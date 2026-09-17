import { app } from 'electron'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

export function defaultOutputDir(): string {
  return join(homedir(), 'Documents', 'IHATE PDF')
}

export function defaultTmp(): string {
  try {
    if (app?.isReady?.()) return join(app.getPath('temp'), 'ihate-pdf')
  } catch {
    /* ignore */
  }
  return join(tmpdir(), 'ihate-pdf')
}
