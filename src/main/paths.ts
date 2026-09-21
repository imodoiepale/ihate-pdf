import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_OUTPUT_FOLDER, LEGACY_OUTPUT_FOLDER, PRODUCT_SLUG } from '@shared/brand'
import { getElectron } from './optional-electron'

export function userDataDir(): string {
  if (process.env.IHATEPDF_USER_DATA) return process.env.IHATEPDF_USER_DATA
  const electron = getElectron()
  try {
    if (electron?.app?.isReady?.()) return electron.app.getPath('userData')
  } catch {
    /* ignore */
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', PRODUCT_SLUG)
  }
  if (process.platform === 'win32') {
    return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), PRODUCT_SLUG)
  }
  return join(homedir(), '.config', PRODUCT_SLUG)
}

export function defaultOutputDir(): string {
  return join(homedir(), 'Documents', DEFAULT_OUTPUT_FOLDER)
}

export function legacyOutputDirs(): string[] {
  return [join(homedir(), 'Documents', LEGACY_OUTPUT_FOLDER)]
}

export function defaultTmp(): string {
  const electron = getElectron()
  try {
    if (electron?.app?.isReady?.()) return join(electron.app.getPath('temp'), PRODUCT_SLUG)
  } catch {
    /* ignore */
  }
  return join(tmpdir(), PRODUCT_SLUG)
}
