import { join } from 'node:path'

/** Installer scripts copied into extraResources/scripts (and Tauri pdf-tools/scripts). */
export const BUNDLED_INSTALL_SCRIPTS = [
  'install-pending.ps1',
  'install-pending.sh',
  'install-deps.ps1',
  'install-deps.sh',
  'install.ps1',
  'install.sh'
] as const

export type BundledInstallScript = (typeof BUNDLED_INSTALL_SCRIPTS)[number]

export function installScriptName(platform: NodeJS.Platform | string = process.platform): string {
  return platform === 'win32' ? 'install-pending.ps1' : 'install-pending.sh'
}

export interface ScriptLookupOpts {
  name: string
  resourcesPath?: string
  cwd?: string
  packaged?: boolean
  appPath?: string
  envResources?: string
  extraDirs?: string[]
}

function uniq(paths: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of paths) {
    if (!p || seen.has(p)) continue
    seen.add(p)
    out.push(p)
  }
  return out
}

function scriptsUnder(root: string, name: string): string[] {
  if (!root) return []
  return [
    join(root, 'scripts', name),
    join(root, name),
    join(root, 'pdf-tools', 'scripts', name),
    join(root, 'resources', 'scripts', name)
  ]
}

/**
 * Paths the engine tries, in order.
 * Packaged Electron: `process.resourcesPath/scripts/<name>` first (extraResources),
 * never the source-tree `scripts/` folder next to the EXE.
 */
export function scriptFileCandidates(opts: ScriptLookupOpts): string[] {
  const { name } = opts
  const packed = opts.resourcesPath || ''
  const cwd = opts.cwd || ''
  const env = opts.envResources || ''
  const appPath = opts.appPath || ''
  const packaged = Boolean(opts.packaged)

  const packedHits = [
    ...scriptsUnder(packed, name),
    ...(appPath ? [join(appPath, '..', 'scripts', name), join(appPath, 'scripts', name)] : [])
  ]
  const envHits = scriptsUnder(env, name)
  const extraHits = (opts.extraDirs || []).flatMap((d) => scriptsUnder(d, name))
  const devHits = cwd ? [join(cwd, 'scripts', name), join(cwd, 'resources', 'scripts', name)] : []

  if (packaged) return uniq([...packedHits, ...envHits, ...extraHits, ...devHits])
  return uniq([...devHits, ...envHits, ...extraHits, ...packedHits])
}

export function windowsPowerShellExe(
  systemRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows'
): string {
  return join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

export function installInvocation(opts: {
  platform?: NodeJS.Platform | string
  script: string | null
  vendorOnly?: boolean
  systemRoot?: string
}): { command: string; argv: string[]; vendorOnly: boolean } {
  const platform = opts.platform || process.platform
  const vendorOnly = opts.vendorOnly !== false
  const script = opts.script || ''
  if (platform === 'win32') {
    return {
      command: windowsPowerShellExe(opts.systemRoot),
      argv: [
        '-NoProfile',
        '-NonInteractive',
        '-NoLogo',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        script,
        ...(vendorOnly ? ['-VendorOnly'] : ['-Full'])
      ],
      vendorOnly
    }
  }
  return {
    command: 'bash',
    argv: [script, ...(vendorOnly ? ['--vendor-only'] : ['--full'])],
    vendorOnly
  }
}
