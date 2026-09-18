import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
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
    return join(homedir(), 'Library', 'Application Support', 'ihate-pdf')
  }
  if (process.platform === 'win32') {
    return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'ihate-pdf')
  }
  return join(homedir(), '.config', 'ihate-pdf')
}

export function defaultOutputDir(): string {
  return join(homedir(), 'Documents', 'IHATE PDF')
}

export function defaultTmp(): string {
  const electron = getElectron()
  try {
    if (electron?.app?.isReady?.()) return join(electron.app.getPath('temp'), 'ihate-pdf')
  } catch {
    /* ignore */
  }
  return join(tmpdir(), 'ihate-pdf')
}
