import { spawn } from 'node:child_process'
import { chmodSync, existsSync } from 'node:fs'
import { scriptFile, userVendorRoot } from './resources'
import { extraLibPath, extraPath, refreshToolPath, whichSync } from './run'
import { ensureVendorTools } from './vendor'

export interface InstallToolsResult {
  ok: boolean
  code: number | null
  stdout: string
  stderr: string
  script: string | null
  vendorOnly: boolean
  binaries: Record<string, string | null>
  message: string
}

let inflight: Promise<InstallToolsResult> | null = null

function coreBins(): Record<string, string | null> {
  const names = ['qpdf', 'pdftotext', 'pdfinfo', 'pdftoppm', 'pdfimages', 'python3', 'gs', 'img2pdf', 'tesseract', 'soffice', 'zip']
  const out: Record<string, string | null> = {}
  for (const n of names) out[n] = whichSync(n)
  return out
}

function spawnCapture(cmd: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs: number): Promise<{
  code: number | null
  stdout: string
  stderr: string
}> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
    }, timeoutMs)
    child.stdout.on('data', (b: Buffer) => {
      stdout += b.toString()
      if (stdout.length > 800_000) stdout = stdout.slice(-600_000)
    })
    child.stderr.on('data', (b: Buffer) => {
      stderr += b.toString()
      if (stderr.length > 400_000) stderr = stderr.slice(-300_000)
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ code: 1, stdout, stderr: stderr + '\n' + err.message })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
  })
}

async function runScript(vendorOnly: boolean): Promise<InstallToolsResult> {
  refreshToolPath()
  const isWin = process.platform === 'win32'
  const script = scriptFile(isWin ? 'install-pending.ps1' : 'install-pending.sh')
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: extraPath(),
    DEBIAN_FRONTEND: 'noninteractive',
    IHATEPDF_VENDOR_ROOT: userVendorRoot(),
    PYTHONUNBUFFERED: '1'
  }
  if (process.platform !== 'win32') {
    env.LD_LIBRARY_PATH = extraLibPath()
    if (process.platform === 'darwin') env.DYLD_LIBRARY_PATH = extraLibPath()
  }

  if (script && !isWin) {
    try {
      chmodSync(script, 0o755)
    } catch {
      /* ignore */
    }
  }

  let stdout = ''
  let stderr = ''
  let code: number | null = 0

  if (script && existsSync(script)) {
    const timeoutMs = vendorOnly ? 8 * 60_000 : 25 * 60_000
    const ran = isWin
      ? await spawnCapture(
          'powershell',
          [
            '-NoProfile',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            script,
            ...(vendorOnly ? ['-VendorOnly'] : [])
          ],
          env,
          timeoutMs
        )
      : await spawnCapture('bash', [script, ...(vendorOnly ? ['--vendor-only'] : [])], env, timeoutMs)
    stdout = ran.stdout
    stderr = ran.stderr
    code = ran.code
  } else {
    const vendor = await ensureVendorTools()
    stdout = vendor.message
    code = 0
  }

  if (vendorOnly || !whichSync('qpdf') || !whichSync('pdftotext')) {
    try {
      const vendor = await ensureVendorTools()
      stdout += `\n[vendor] ${vendor.message}\n`
    } catch (e) {
      stderr += `\n[vendor] ${e instanceof Error ? e.message : String(e)}\n`
    }
  }

  refreshToolPath()
  const binaries = coreBins()
  const ok = Boolean(binaries.qpdf) && code === 0
  const message = ok
    ? `Tools ready. qpdf=${binaries.qpdf || 'missing'} pdftotext=${binaries.pdftotext || 'missing'}`
    : `Install finished with missing tools. qpdf=${binaries.qpdf || 'MISSING'} pdftotext=${binaries.pdftotext || 'MISSING'}. See scripts/install-pending.sh`
  return { ok, code, stdout, stderr, script, vendorOnly, binaries, message }
}

export function runInstallPending(opts: { vendorOnly?: boolean } = {}): Promise<InstallToolsResult> {
  if (inflight) return inflight
  inflight = runScript(Boolean(opts.vendorOnly)).finally(() => {
    inflight = null
  })
  return inflight
}

export function maybeEnsureVendorInBackground(): void {
  refreshToolPath()
  if (whichSync('qpdf') && whichSync('pdftotext')) return
  void runInstallPending({ vendorOnly: true }).catch((err) => {
    console.warn('i hate pdf vendor ensure:', err)
  })
}
