/**
 * Electron is optional so the same engine can run under Node (Tauri sidecar).
 * Never import 'electron' at module top-level from engine.ts.
 */
import { createRequire } from 'node:module'

type ElectronNS = typeof import('electron')

let cached: ElectronNS | null | undefined
const nodeRequire = createRequire(import.meta.url)

export function getElectron(): ElectronNS | null {
  if (cached !== undefined) return cached
  try {
    cached = nodeRequire('electron') as ElectronNS
    if (!cached?.app && !cached?.dialog) cached = null
  } catch {
    cached = null
  }
  return cached
}
