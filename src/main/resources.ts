import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { PRODUCT_SLUG } from '@shared/brand'
import { getElectron } from './optional-electron'
import {
  BUNDLED_INSTALL_SCRIPTS,
  installScriptName,
  scriptFileCandidates
} from './script-paths'

export { BUNDLED_INSTALL_SCRIPTS, installScriptName, scriptFileCandidates } from './script-paths'

type ProcessWithResources = NodeJS.Process & { resourcesPath?: string }

export function packedResources(): string {
  return (process as ProcessWithResources).resourcesPath || ''
}

export function isPackagedApp(): boolean {
  if (process.env.IHATEPDF_PACKAGED === '1' || process.env.IHATEPDF_PACKAGED === 'true') return true
  try {
    const packed = getElectron()?.app?.isPackaged
    if (typeof packed === 'boolean') return packed
  } catch {
    /* node engine / tests */
  }
  const resources = packedResources()
  return Boolean(resources && existsSync(join(resources, 'app.asar')))
}

function electronAppPath(): string {
  try {
    return getElectron()?.app?.getAppPath() || ''
  } catch {
    return ''
  }
}

/** linux-x64 / linux-arm64 / win-x64 / win-arm64 / mac-arm64 / mac-x64 */
export function vendorPlatformKey(): string {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  if (process.platform === 'win32') return `win-${arch}`
  if (process.platform === 'darwin') return `mac-${arch}`
  return `linux-${arch}`
}

/**
 * User-writable vendor prefix (bin/ + lib/).
 * macOS: ~/Library/Application Support/ihate-pdf
 * Windows: %LOCALAPPDATA%/ihate-pdf
 * Linux: ~/.local/share/ihate-pdf
 */
export function userVendorRoot(): string {
  if (process.env.IHATEPDF_VENDOR_ROOT) return process.env.IHATEPDF_VENDOR_ROOT
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', PRODUCT_SLUG)
  }
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
    return join(local, PRODUCT_SLUG)
  }
  return join(homedir(), '.local', 'share', PRODUCT_SLUG)
}

export function userVendorBinDir(): string {
  if (process.env.IHATEPDF_VENDOR_BIN) return process.env.IHATEPDF_VENDOR_BIN
  return join(userVendorRoot(), 'bin')
}

export function userVendorLibDir(): string {
  if (process.env.IHATEPDF_VENDOR_LIB) return process.env.IHATEPDF_VENDOR_LIB
  return join(userVendorRoot(), 'lib')
}

/** Directories that may contain worker.py, extract.py, and extra bins. */
export function resourceRoots(): string[] {
  const env = process.env.IHATEPDF_RESOURCES || ''
  const packed = packedResources()
  const cwd = process.cwd()
  return uniqueDirs([
    env,
    env ? join(env, 'pdf-tools') : '',
    packed,
    packed ? join(packed, 'pdf-tools') : '',
    packed ? join(packed, 'resources') : '',
    join(cwd, 'resources'),
    join(cwd, 'src-tauri', 'resources', 'pdf-tools')
  ])
}

function uniqueDirs(dirs: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const dir of dirs) {
    if (!dir || seen.has(dir)) continue
    seen.add(dir)
    out.push(dir)
  }
  return out
}

export function resourceFile(...parts: string[]): string {
  for (const root of resourceRoots()) {
    const p = join(root, ...parts)
    if (existsSync(p)) return p
  }
  return join(process.cwd(), 'resources', ...parts)
}

export function scriptLookupOpts(name: string) {
  return {
    name,
    resourcesPath: packedResources(),
    cwd: process.cwd(),
    packaged: isPackagedApp(),
    appPath: electronAppPath(),
    envResources: process.env.IHATEPDF_RESOURCES || '',
    extraDirs: resourceRoots()
  }
}

export function scriptFile(name: string): string | null {
  for (const p of scriptFileCandidates(scriptLookupOpts(name))) {
    if (p && existsSync(p)) return p
  }
  return null
}

export function bundledInstallScripts(): Array<{ name: string; path: string | null; exists: boolean }> {
  return BUNDLED_INSTALL_SCRIPTS.map((name) => {
    const path = scriptFile(name)
    return { name, path, exists: Boolean(path) }
  })
}

export function resolveInstallScript(platform: NodeJS.Platform | string = process.platform): {
  name: string
  path: string | null
  exists: boolean
  packaged: boolean
  resourcesPath: string
  candidates: string[]
} {
  const name = installScriptName(platform)
  const candidates = scriptFileCandidates(scriptLookupOpts(name))
  const path = scriptFile(name)
  return {
    name,
    path,
    exists: Boolean(path),
    packaged: isPackagedApp(),
    resourcesPath: packedResources(),
    candidates
  }
}

function pythonUserBins(): string[] {
  const home = homedir()
  const out: string[] = [join(home, '.local', 'bin')]
  if (process.platform === 'darwin') {
    for (const v of ['3.14', '3.13', '3.12', '3.11', '3.10', '3.9']) {
      out.push(join(home, 'Library', 'Python', v, 'bin'))
    }
  }
  if (process.platform === 'win32') {
    const roaming = process.env.APPDATA || join(home, 'AppData', 'Roaming')
    const local = process.env.LOCALAPPDATA || join(home, 'AppData', 'Local')
    for (const v of ['314', '313', '312', '311', '310', '39']) {
      out.push(join(roaming, 'Python', `Python${v}`, 'Scripts'))
      out.push(join(local, 'Programs', 'Python', `Python${v}`, 'Scripts'))
    }
  }
  return out
}

/**
 * Search order (bundled resources → user vendor dir → well-known system dirs).
 * `extraPath()` then appends the original process PATH.
 */
export function extraResourceBinDirs(): string[] {
  const home = homedir()
  const plat = vendorPlatformKey()
  const localApp = process.env.LOCALAPPDATA || process.env.APPDATA || ''
  const pf = process.env.ProgramFiles || 'C:\\Program Files'
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
  const fromResources = resourceRoots().flatMap((root) => [
    join(root, 'bin', plat, 'bin'),
    join(root, 'bin', plat),
    join(root, 'bin'),
    join(root, 'pdf-tools', 'bin', plat, 'bin'),
    join(root, 'pdf-tools', 'bin', plat),
    join(root, 'pdf-tools', 'bin')
  ])
  const vendor = [
    userVendorBinDir(),
    join(userVendorRoot(), plat, 'bin'),
    join(userVendorRoot(), plat),
    join(home, `.${PRODUCT_SLUG}`, 'bin'),
    localApp ? join(localApp, PRODUCT_SLUG, 'bin') : ''
  ]
  const system = [
    ...pythonUserBins(),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    process.platform === 'win32' ? join(pf, 'qpdf', 'bin') : '',
    process.platform === 'win32' ? join(pf, 'poppler', 'Library', 'bin') : '',
    process.platform === 'win32' ? join(pf, 'poppler', 'bin') : '',
    process.platform === 'win32' ? join(pf86, 'qpdf', 'bin') : '',
    process.platform === 'win32' ? join(home, 'scoop', 'shims') : '',
    process.platform === 'win32' ? join(pf, 'LibreOffice', 'program') : '',
    process.platform === 'win32' ? join(pf86, 'LibreOffice', 'program') : '',
    process.platform === 'win32' ? join(pf, 'gs', 'gs10.04.0', 'bin') : '',
    process.platform === 'win32' ? join(pf, 'Tesseract-OCR') : ''
  ]
  return uniqueDirs([...fromResources, ...vendor, ...system].filter(Boolean))
}

export function extraResourceLibDirs(): string[] {
  const plat = vendorPlatformKey()
  const home = homedir()
  const fromResources = resourceRoots().flatMap((root) => [
    join(root, 'bin', plat, 'lib'),
    join(root, 'bin', plat),
    join(root, 'lib'),
    join(root, 'pdf-tools', 'bin', plat, 'lib'),
    join(root, 'pdf-tools', 'lib')
  ])
  return uniqueDirs(
    [
      userVendorLibDir(),
      join(userVendorRoot(), plat, 'lib'),
      join(home, `.${PRODUCT_SLUG}`, 'lib'),
      ...fromResources
    ].filter(Boolean)
  )
}

export const INSTALL_PENDING_HINT =
  'Use Settings → PDF tools → Install PDF tools (bundled install-pending script, vendor qpdf + Poppler). First launch does the same in the background.'
