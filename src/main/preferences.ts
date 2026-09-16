/**
 * Workspace preferences + LLM provider metadata.
 * Raw API keys live in the encrypted vault (./secrets). Never log them.
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { API_ORIGIN } from '@shared/types'
import {
  LLM_PROVIDERS,
  PROVIDER_META,
  type LlmProviderId,
  type LlmProviderPublic,
  type StudioPreferencesPublic
} from '@shared/preferences'
import { defaultOutputDir } from './paths'
import { encryptionMode, readVault, writeVault } from './secrets'

const ENV_KEYS: Record<LlmProviderId, string> = {
  openrouter: 'OPENROUTER_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  custom: 'OPENAI_COMPATIBLE_API_KEY'
}

const DEFAULT_BASE: Record<LlmProviderId, string> = {
  openrouter: 'https://openrouter.ai/api/v1',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  custom: 'http://127.0.0.1:11434/v1'
}

interface StoredProviderMeta {
  model?: string
  baseUrl?: string
}

interface StoredPreferences {
  outputDir?: string
  concurrency?: number
  mcpEnabled?: boolean
  mcpPath?: string
  defaultProvider?: LlmProviderId | null
  providers?: Partial<Record<LlmProviderId, StoredProviderMeta>>
}

let cache: StoredPreferences | null = null

export function preferencesPath(): string {
  try {
    if (app?.isReady?.()) return join(app.getPath('userData'), 'preferences.json')
  } catch {
    /* fall through */
  }
  return join(homedir(), '.config', 'lovepdf-studio', 'preferences.json')
}

function emptyStored(): StoredPreferences {
  return { mcpEnabled: false, mcpPath: '/mcp', concurrency: 2, providers: {}, defaultProvider: null }
}

export async function loadPreferences(): Promise<StoredPreferences> {
  if (cache) return cache
  const path = preferencesPath()
  if (!existsSync(path)) {
    cache = emptyStored()
    return cache
  }
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw) as Omit<StoredPreferences, 'providers'> & {
      providers?: Record<string, { apiKey?: string; model?: string; baseUrl?: string }>
    }
    const vault = { ...readVault() }
    let vaultDirty = false
    const providers: StoredPreferences['providers'] = {}
    for (const id of LLM_PROVIDERS) {
      const p = parsed.providers?.[id] || {}
      if (typeof p.apiKey === 'string' && p.apiKey.trim()) {
        vault[id] = p.apiKey.trim()
        vaultDirty = true
      }
      providers[id] = { model: p.model, baseUrl: p.baseUrl }
    }
    cache = {
      ...emptyStored(),
      ...parsed,
      providers
    }
    if (vaultDirty) {
      writeVault(vault)
      await savePreferences(cache)
    }
  } catch {
    cache = emptyStored()
  }
  return cache
}

export async function savePreferences(next: StoredPreferences): Promise<void> {
  cache = next
  const path = preferencesPath()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(next, null, 2), { mode: 0o600 })
}

export function isMcpEnabled(): boolean {
  return Boolean(cache?.mcpEnabled)
}

export function mcpUrl(): string {
  const path = cache?.mcpPath || '/mcp'
  return `${API_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`
}

function envKey(id: LlmProviderId): string {
  return (process.env[ENV_KEYS[id]] || '').trim()
}

function envBase(id: LlmProviderId): string {
  if (id === 'custom') return (process.env.OPENAI_COMPATIBLE_BASE_URL || '').trim()
  return ''
}

function vaultKey(id: LlmProviderId): string {
  return (readVault()[id] || '').trim()
}

function resolvedKey(id: LlmProviderId): { key: string; fromEnv: boolean } {
  const stored = vaultKey(id)
  if (stored) return { key: stored, fromEnv: false }
  const env = envKey(id)
  return { key: env, fromEnv: Boolean(env) }
}

function metaFor(id: LlmProviderId): { model: string; baseUrl: string } {
  const stored = cache?.providers?.[id]
  return {
    model: stored?.model?.trim() || PROVIDER_META[id].defaultModel,
    baseUrl: stored?.baseUrl?.trim() || envBase(id) || DEFAULT_BASE[id]
  }
}

export function resolveLlm(
  provider?: string | null
): { id: LlmProviderId; apiKey: string; model: string; baseUrl: string } | null {
  const pick =
    (provider && LLM_PROVIDERS.includes(provider as LlmProviderId)
      ? (provider as LlmProviderId)
      : cache?.defaultProvider) || null
  const order: LlmProviderId[] = pick ? [pick, ...LLM_PROVIDERS.filter((x) => x !== pick)] : [...LLM_PROVIDERS]
  for (const id of order) {
    const { key } = resolvedKey(id)
    const meta = metaFor(id)
    if (key) return { id, apiKey: key, model: meta.model, baseUrl: meta.baseUrl }
  }
  const customUrl = cache?.providers?.custom?.baseUrl?.trim() || envBase('custom')
  if (customUrl) {
    const meta = metaFor('custom')
    return { id: 'custom', apiKey: 'local', model: meta.model, baseUrl: customUrl }
  }
  return null
}

function publicProviders(): Record<LlmProviderId, LlmProviderPublic> {
  const providers = {} as Record<LlmProviderId, LlmProviderPublic>
  for (const id of LLM_PROVIDERS) {
    const { key, fromEnv } = resolvedKey(id)
    const meta = metaFor(id)
    const customLocal = id === 'custom' && Boolean(cache?.providers?.custom?.baseUrl || envBase('custom'))
    providers[id] = {
      id,
      label: PROVIDER_META[id].label,
      hasKey: Boolean(key) || customLocal,
      hint: key ? `••••${key.slice(-4)}` : customLocal ? 'local' : '',
      model: meta.model,
      baseUrl: meta.baseUrl,
      fromEnv
    }
  }
  return providers
}

export function publicPreferences(outputDir: string, concurrency: number): StudioPreferencesPublic {
  return {
    outputDir: cache?.outputDir || outputDir || defaultOutputDir(),
    concurrency: cache?.concurrency || concurrency,
    mcp: {
      enabled: Boolean(cache?.mcpEnabled),
      url: mcpUrl()
    },
    defaultProvider: cache?.defaultProvider || null,
    encryption: encryptionMode(),
    providers: publicProviders()
  }
}

export interface PreferencePatch {
  outputDir?: string
  concurrency?: number
  mcpEnabled?: boolean
  mcpPath?: string
  defaultProvider?: LlmProviderId | null
  providers?: Partial<
    Record<
      LlmProviderId,
      {
        apiKey?: string | null
        model?: string
        baseUrl?: string
        clearKey?: boolean
        setDefault?: boolean
      }
    >
  >
}

export async function applyPreferencePatch(patch: PreferencePatch): Promise<StoredPreferences> {
  const current = await loadPreferences()
  const next: StoredPreferences = {
    ...current,
    providers: { ...(current.providers || {}) }
  }
  if (patch.outputDir) next.outputDir = patch.outputDir
  if (patch.concurrency) next.concurrency = Math.max(1, Math.min(4, Number(patch.concurrency)))
  if (typeof patch.mcpEnabled === 'boolean') next.mcpEnabled = patch.mcpEnabled
  if (patch.mcpPath) next.mcpPath = patch.mcpPath
  if (patch.defaultProvider !== undefined) next.defaultProvider = patch.defaultProvider

  const vault = { ...readVault() }
  let vaultDirty = false
  if (patch.providers) {
    for (const id of LLM_PROVIDERS) {
      const incoming = patch.providers[id]
      if (!incoming) continue
      const prev = next.providers?.[id] || {}
      next.providers![id] = {
        model: typeof incoming.model === 'string' && incoming.model.trim() ? incoming.model.trim() : prev.model,
        baseUrl: typeof incoming.baseUrl === 'string' && incoming.baseUrl.trim() ? incoming.baseUrl.trim() : prev.baseUrl
      }
      if (incoming.clearKey) {
        delete vault[id]
        vaultDirty = true
      } else if (typeof incoming.apiKey === 'string' && incoming.apiKey.trim() && !incoming.apiKey.includes('•')) {
        vault[id] = incoming.apiKey.trim()
        vaultDirty = true
      }
      if (incoming.setDefault) next.defaultProvider = id
    }
  }
  await savePreferences(next)
  if (vaultDirty) writeVault(vault)
  return next
}
