import { spawn } from 'node:child_process'
import { chmodSync, existsSync } from 'node:fs'
import { PRODUCT_NAME } from '@shared/brand'
import { installInvocation } from './script-paths'
import {
  bundledInstallScripts,
  resolveInstallScript,
  userVendorRoot
} from './resources'
import { extraLibPath, extraPath, refreshToolPath, whichSync } from './run'
import { ensureVendorTools } from './vendor'

export interface InstallToolsResult {
  ok: boolean
  status: 'ok' | 'error'
  code: number | null
  stdout: string
  stderr: string
  script: string | null
  command: string
  argv: string[]
  vendorOnly: boolean
  binaries: Record<string, string | null>
  message: string
}

export interface InstallToolsInfo {
  inFlight: boolean
  script: string | null
  exists: boolean
  name: string
  packaged: boolean
  resourcesPath: string | null
  command: string
  argv: string[]
  vendorOnlyDefault: true
  bundled: Array<{ name: string; path: string | null; exists: boolean }>
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
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
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

function spawnCommand(isWin: boolean, preferred: string): string {
  if (!isWin) return 'bash'
  if (preferred && existsSync(preferred)) return preferred
  return 'powershell.exe'
}

export function installToolsInfo(opts: { vendorOnly?: boolean; full?: boolean } = {}): InstallToolsInfo {
  const vendorOnly = resolveVendorOnly(opts)
  const resolved = resolveInstallScript()
  const inv = installInvocation({
    platform: process.platform,
    script: resolved.path,
    vendorOnly
  })
  return {
    inFlight: inflight !== null,
    script: resolved.path,
    exists: resolved.exists,
    name: resolved.name,
    packaged: resolved.packaged,
    resourcesPath: resolved.resourcesPath || null,
    command: spawnCommand(process.platform === 'win32', inv.command),
    argv: inv.argv,
    vendorOnlyDefault: true,
    bundled: bundledInstallScripts()
  }
}

async function runScript(vendorOnly: boolean): Promise<InstallToolsResult> {
  refreshToolPath()
  const isWin = process.platform === 'win32'
  const resolved = resolveInstallScript()
  const script = resolved.path
  const inv = installInvocation({ platform: process.platform, script, vendorOnly })
  const command = spawnCommand(isWin, inv.command)
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
    const ran = await spawnCapture(command, inv.argv, env, timeoutMs)
    stdout = ran.stdout
    stderr = ran.stderr
    code = ran.code
  } else {
    stderr = `Bundled install script not found (${resolved.name}). Looked under process.resourcesPath/scripts and app.getAppPath().`
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
    : `PDF tools missing. qpdf=${binaries.qpdf || 'MISSING'} pdftotext=${binaries.pdftotext || 'MISSING'}`
  return {
    ok,
    status: ok ? 'ok' : 'error',
    code,
    stdout,
    stderr,
    script,
    command,
    argv: inv.argv,
    vendorOnly,
    binaries,
    message
  }
}

function resolveVendorOnly(opts: { vendorOnly?: boolean; full?: boolean }): boolean {
  if (opts.full === true) return false
  return opts.vendorOnly !== false
}

export function previewInstallTools(opts: { vendorOnly?: boolean; full?: boolean } = {}): InstallToolsResult {
  const vendorOnly = resolveVendorOnly(opts)
  const info = installToolsInfo({ vendorOnly, full: opts.full })
  refreshToolPath()
  const binaries = coreBins()
  const ok = info.exists
  return {
    ok,
    status: ok ? 'ok' : 'error',
    code: ok ? 0 : 1,
    stdout: '',
    stderr: ok ? '' : `Bundled install script not found (${info.name})`,
    script: info.script,
    command: info.command,
    argv: info.argv,
    vendorOnly,
    binaries,
    message: ok
      ? `Would run ${info.command} ${info.argv.join(' ')}`
      : `Bundled ${info.name} is not on the packaged resource path`
  }
}

export function runInstallPending(opts: { vendorOnly?: boolean; full?: boolean } = {}): Promise<InstallToolsResult> {
  if (inflight) return inflight
  inflight = runScript(resolveVendorOnly(opts)).finally(() => {
    inflight = null
  })
  return inflight
}

export function vendorInstallInFlight(): boolean {
  return inflight !== null
}

/** Wait only when a core CLI is missing and a vendor download is already running. */
export async function waitForCoreVendorIfNeeded(): Promise<boolean> {
  refreshToolPath()
  if (whichSync('qpdf') && whichSync('pdftotext')) return false
  if (!inflight) return false
  await inflight
  refreshToolPath()
  return true
}

export function maybeEnsureVendorInBackground(): void {
  refreshToolPath()
  if (whichSync('qpdf') && whichSync('pdftotext')) return
  void runInstallPending({ vendorOnly: true }).catch((err) => {
    console.warn(`${PRODUCT_NAME} vendor ensure:`, err)
  })
}
