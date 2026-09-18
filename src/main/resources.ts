import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

type ProcessWithResources = NodeJS.Process & { resourcesPath?: string }

function packedResources(): string {
  return (process as ProcessWithResources).resourcesPath || ''
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
    return join(homedir(), 'Library', 'Application Support', 'ihate-pdf')
  }
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
    return join(local, 'ihate-pdf')
  }
  return join(homedir(), '.local', 'share', 'ihate-pdf')
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

export function scriptFile(name: string): string | null {
  const packed = packedResources()
  const cwd = process.cwd()
  const candidates = [
    join(cwd, 'scripts', name),
    ...resourceRoots().map((root) => join(root, 'scripts', name)),
    ...resourceRoots().map((root) => join(root, name)),
    packed ? join(packed, 'scripts', name) : '',
    join(cwd, 'resources', 'scripts', name)
  ]
  for (const p of candidates) {
    if (p && existsSync(p)) return p
  }
  return null
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
    join(home, '.ihate-pdf', 'bin'),
    localApp ? join(localApp, 'ihate-pdf', 'bin') : ''
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
      join(home, '.ihate-pdf', 'lib'),
      ...fromResources
    ].filter(Boolean)
  )
}

export const INSTALL_PENDING_HINT =
  'Run scripts/install-pending.sh (macOS/Linux) or scripts/install-pending.ps1 (Windows), or use Settings → Install missing tools. The app searches bundled resources, then the vendor folder (~/.local/share/ihate-pdf/bin, %LOCALAPPDATA%\\ihate-pdf\\bin, or ~/Library/Application Support/ihate-pdf/bin), then PATH.'
