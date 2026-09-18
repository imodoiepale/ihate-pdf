import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

type ProcessWithResources = NodeJS.Process & { resourcesPath?: string }

function packedResources(): string {
  return (process as ProcessWithResources).resourcesPath || ''
}

/** Directories that may contain worker.py, extract.py, and extra bins. */
export function resourceRoots(): string[] {
  const env = process.env.IHATEPDF_RESOURCES || ''
  const packed = packedResources()
  return [
    env,
    env ? join(env, 'pdf-tools') : '',
    packed,
    packed ? join(packed, 'pdf-tools') : '',
    packed ? join(packed, 'resources') : '',
    join(process.cwd(), 'resources')
  ].filter(Boolean)
}

export function resourceFile(...parts: string[]): string {
  for (const root of resourceRoots()) {
    const p = join(root, ...parts)
    if (existsSync(p)) return p
  }
  return join(process.cwd(), 'resources', ...parts)
}

export function extraResourceBinDirs(): string[] {
  const home = homedir()
  const localApp = process.env.LOCALAPPDATA || process.env.APPDATA || ''
  const pf = process.env.ProgramFiles || 'C:\\Program Files'
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
  const fromResources = resourceRoots().flatMap((root) => [root, join(root, 'bin')])
  return [
    ...fromResources,
    join(home, '.local', 'bin'),
    join(home, '.ihate-pdf', 'bin'),
    localApp ? join(localApp, 'ihate-pdf', 'bin') : '',
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    process.platform === 'win32' ? join(pf, 'qpdf', 'bin') : '',
    process.platform === 'win32' ? join(pf, 'poppler', 'Library', 'bin') : '',
    process.platform === 'win32' ? join(pf, 'poppler', 'bin') : '',
    process.platform === 'win32' ? join(pf86, 'qpdf', 'bin') : '',
    process.platform === 'win32' ? join(home, 'scoop', 'shims') : ''
  ].filter(Boolean)
}
