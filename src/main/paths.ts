import { app } from 'electron'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

export function defaultOutputDir(): string {
  return join(homedir(), 'Documents', 'LovePDF Studio')
}

export function defaultTmp(): string {
  try {
    if (app?.isReady?.()) return join(app.getPath('temp'), 'lovepdf-studio')
  } catch {
    /* ignore */
  }
  return join(tmpdir(), 'lovepdf-studio')
}
