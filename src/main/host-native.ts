import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'

function which(bin: string): string | null {
  const names = process.platform === 'win32' ? [bin, `${bin}.exe`, `${bin}.cmd`] : [bin]
  for (const dir of (process.env.PATH || '').split(delimiter)) {
    if (!dir) continue
    for (const name of names) {
      const p = join(dir, name)
      if (existsSync(p)) return p
    }
  }
  return null
}

function runCapture(cmd: string, args: string[], opts?: { timeoutMs?: number; input?: string }): Promise<{
  code: number | null
  stdout: string
  stderr: string
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    const chunks: Buffer[] = []
    const err: Buffer[] = []
    child.stdout.on('data', (d: Buffer) => chunks.push(d))
    child.stderr.on('data', (d: Buffer) => err.push(d))
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('Native dialog timed out'))
    }, opts?.timeoutMs ?? 300_000)
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({
        code,
        stdout: Buffer.concat(chunks).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8')
      })
    })
    if (opts?.input) child.stdin.end(opts.input)
    else child.stdin.end()
  })
}

function extFilter(extensions: string[]): { zenity: string[]; ps: string; apple: string[] } {
  const clean = extensions.map((e) => e.replace(/^\./, '').toLowerCase()).filter((e) => e && e !== '*')
  const ps =
    clean.length === 0
      ? 'All files (*.*)|*.*'
      : `${clean.map((e) => e.toUpperCase()).join(', ')}|${clean.map((e) => `*.${e}`).join(';')}|All files (*.*)|*.*`
  const zenity = clean.length ? [`--file-filter=${clean.map((e) => `*.${e}`).join(' ')}`] : []
  const apple = clean
  return { zenity, ps, apple }
}

export async function nativePickFiles(multi: boolean, extensions: string[]): Promise<string[]> {
  const filter = extFilter(extensions)
  if (process.platform === 'darwin') {
    const osascript = which('osascript')
    if (!osascript) return []
    const typeLine = filter.apple.length
      ? ` of type {${filter.apple.map((e) => `"${e}"`).join(', ')}}`
      : ''
    const multiLine = multi ? ' with multiple selections allowed' : ''
    const script = `
set out to ""
try
  set theFiles to choose file with prompt "i hate pdf"${typeLine}${multiLine}
  if class of theFiles is list then
    repeat with f in theFiles
      set out to out & POSIX path of f & linefeed
    end repeat
  else
    set out to POSIX path of theFiles
  end if
end try
return out
`
    const { stdout } = await runCapture(osascript, ['-l', 'AppleScript'], { input: script })
    return stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  }
  if (process.platform === 'win32') {
    const ps = which('powershell') || which('pwsh') || 'powershell'
    const script = `
Add-Type -AssemblyName System.Windows.Forms
$d = New-Object System.Windows.Forms.OpenFileDialog
$d.Title = 'i hate pdf'
$d.Multiselect = $${multi ? 'True' : 'False'}
$d.Filter = '${filter.ps.replace(/'/g, "''")}'
$r = $d.ShowDialog()
if ($r -eq [System.Windows.Forms.DialogResult]::OK) { $d.FileNames }
`
    const { stdout } = await runCapture(ps, ['-STA', '-NoProfile', '-Command', script])
    return stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  }
  const zenity = which('zenity')
  if (zenity) {
    const args = ['--file-selection', '--title=i hate pdf', '--separator=\n', ...filter.zenity]
    if (multi) args.push('--multiple')
    try {
      const { stdout, code } = await runCapture(zenity, args)
      if (code !== 0) return []
      return stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    } catch {
      return []
    }
  }
  const kdialog = which('kdialog')
  if (kdialog) {
    const args = ['--getopenfilename', '.']
    if (multi) args.splice(1, 0, '--multiple')
    const { stdout, code } = await runCapture(kdialog, args)
    if (code !== 0) return []
    return stdout.split(/\s+/).map((s) => s.trim()).filter(Boolean)
  }
  return []
}

export async function nativePickDir(): Promise<string | null> {
  if (process.platform === 'darwin') {
    const osascript = which('osascript')
    if (!osascript) return null
    const { stdout } = await runCapture(osascript, [
      '-e',
      'try\nPOSIX path of (choose folder with prompt "i hate pdf")\nend try'
    ])
    return stdout.trim() || null
  }
  if (process.platform === 'win32') {
    const ps = which('powershell') || which('pwsh') || 'powershell'
    const script = `
Add-Type -AssemblyName System.Windows.Forms
$d = New-Object System.Windows.Forms.FolderBrowserDialog
$d.Description = 'i hate pdf'
if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $d.SelectedPath }
`
    const { stdout } = await runCapture(ps, ['-STA', '-NoProfile', '-Command', script])
    return stdout.trim() || null
  }
  const zenity = which('zenity')
  if (zenity) {
    const { stdout, code } = await runCapture(zenity, ['--file-selection', '--directory', '--title=i hate pdf'])
    if (code !== 0) return null
    return stdout.trim() || null
  }
  return null
}

export async function nativeOpenPath(target: string): Promise<void> {
  if (!target) return
  if (process.platform === 'darwin') {
    await runCapture('open', [target])
    return
  }
  if (process.platform === 'win32') {
    await runCapture('cmd', ['/c', 'start', '', target])
    return
  }
  const opener = which('xdg-open') || 'xdg-open'
  await runCapture(opener, [target])
}

export async function nativeReveal(target: string): Promise<void> {
  if (!target) return
  if (process.platform === 'darwin') {
    await runCapture('open', ['-R', target])
    return
  }
  if (process.platform === 'win32') {
    await runCapture('explorer', [`/select,${target}`])
    return
  }
  await nativeOpenPath(dirname(target))
}
