/** Public preference shapes shared by the engine and the renderer. Never include raw API keys. */

export const LLM_PROVIDERS = ['openrouter', 'openai', 'anthropic', 'custom'] as const
export type LlmProviderId = (typeof LLM_PROVIDERS)[number]

export interface LlmProviderPublic {
  id: LlmProviderId
  label: string
  hasKey: boolean
  hint: string
  model: string
  baseUrl?: string
  fromEnv: boolean
}

export interface McpPublic {
  enabled: boolean
  url: string
}

export interface StudioPreferencesPublic {
  outputDir: string
  concurrency: number
  mcp: McpPublic
  defaultProvider: LlmProviderId | null
  encryption: 'safeStorage' | 'aes-file'
  providers: Record<LlmProviderId, LlmProviderPublic>
}

export const PROVIDER_META: Record<
  LlmProviderId,
  { label: string; blurb: string; placeholder: string; defaultModel: string; accent: string }
> = {
  openrouter: {
    label: 'OpenRouter',
    blurb: 'One key for GPT, Claude, Gemini, Llama, and dozens of other models.',
    placeholder: 'sk-or-v1-…',
    defaultModel: 'openai/gpt-4o-mini',
    accent: '#6b4eff'
  },
  openai: {
    label: 'OpenAI',
    blurb: 'Official OpenAI API. Keys stay on this machine and are used only when a tool opts in.',
    placeholder: 'sk-…',
    defaultModel: 'gpt-4o-mini',
    accent: '#10a37f'
  },
  anthropic: {
    label: 'Anthropic',
    blurb: 'Claude models for long-context PDF analysis and extraction.',
    placeholder: 'sk-ant-…',
    defaultModel: 'claude-3-5-haiku-latest',
    accent: '#d97757'
  },
  custom: {
    label: 'OpenAI-compatible',
    blurb: 'Any server that speaks the OpenAI Chat Completions API — LM Studio, vLLM, Ollama, Together, Groq, Azure.',
    placeholder: 'sk-… or leave blank for local',
    defaultModel: 'gpt-4o-mini',
    accent: '#2563eb'
  }
}
