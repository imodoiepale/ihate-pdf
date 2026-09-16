import { app, safeStorage } from 'electron'
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

function dataDir(): string {
  try {
    if (app?.isReady?.()) return app.getPath('userData')
  } catch {
    /* ignore */
  }
  return join(homedir(), '.config', 'lovepdf-studio')
}

function keyFile(): string {
  return join(dataDir(), 'llm-keys.bin')
}

function machineKeyPath(): string {
  return join(dataDir(), '.machine-key')
}

export function encryptionMode(): 'safeStorage' | 'aes-file' {
  try {
    if (safeStorage?.isEncryptionAvailable?.()) return 'safeStorage'
  } catch {
    /* ignore */
  }
  return 'aes-file'
}

function machineKey(): Buffer {
  const p = machineKeyPath()
  mkdirSync(dirname(p), { recursive: true })
  if (existsSync(p)) return readFileSync(p)
  const key = randomBytes(32)
  writeFileSync(p, key, { mode: 0o600 })
  try {
    chmodSync(p, 0o600)
  } catch {
    /* ignore */
  }
  return key
}

export function encryptString(plain: string): Buffer {
  if (encryptionMode() === 'safeStorage') {
    return Buffer.concat([Buffer.from('S1'), safeStorage.encryptString(plain)])
  }
  const iv = randomBytes(12)
  const key = scryptSync(machineKey(), 'lovepdf-llm-v1', 32)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return Buffer.concat([Buffer.from('A1'), iv, cipher.getAuthTag(), ct])
}

export function decryptString(buf: Buffer): string {
  if (buf.length < 4) throw new Error('Empty secrets file')
  const mag = buf.subarray(0, 2).toString('utf8')
  if (mag === 'S1') {
    if (encryptionMode() !== 'safeStorage') {
      throw new Error('This key file needs the OS keychain. Unlock it and retry.')
    }
    return safeStorage.decryptString(buf.subarray(2))
  }
  if (mag === 'A1') {
    const iv = buf.subarray(2, 14)
    const tag = buf.subarray(14, 30)
    const ct = buf.subarray(30)
    const key = scryptSync(machineKey(), 'lovepdf-llm-v1', 32)
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
  }
  throw new Error('Unrecognized secrets file')
}

export function readVault(): Record<string, string> {
  const p = keyFile()
  if (!existsSync(p)) return {}
  try {
    const parsed = JSON.parse(decryptString(readFileSync(p))) as { keys?: Record<string, string> }
    return parsed.keys || {}
  } catch {
    return {}
  }
}

export function writeVault(keys: Record<string, string>): void {
  const p = keyFile()
  mkdirSync(dirname(p), { recursive: true })
  const blob = encryptString(JSON.stringify({ version: 1, keys }))
  writeFileSync(p, blob, { mode: 0o600 })
  try {
    chmodSync(p, 0o600)
  } catch {
    /* ignore */
  }
}

export function maskError(message: string): string {
  return message
    .replace(/sk-[A-Za-z0-9_-]{6,}/g, 'sk-***')
    .replace(/Bearer\s+\S+/gi, 'Bearer ***')
    .replace(/x-api-key["']?\s*[:=]\s*["']?[^"'\s]+/gi, 'x-api-key: ***')
}
