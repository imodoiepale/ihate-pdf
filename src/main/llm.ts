import type { LlmProviderId } from '@shared/preferences'
import { resolveLlm } from './preferences'
import { maskError } from './secrets'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  provider?: string
  json?: boolean
  maxTokens?: number
  temperature?: number
}

const MAX_CONTENT = 28_000

function clip(s: string, n = MAX_CONTENT): string {
  if (s.length <= n) return s
  return s.slice(0, n) + '\n\n[truncated for context window]'
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs = 90_000): Promise<unknown> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ac.signal
    })
    const text = await res.text()
    let data: unknown = text
    try {
      data = JSON.parse(text)
    } catch {
      /* keep text */
    }
    if (!res.ok) {
      const msg =
        typeof data === 'object' && data && 'error' in data
          ? JSON.stringify((data as { error: unknown }).error)
          : text.slice(0, 400)
      throw new Error(`LLM HTTP ${res.status}: ${maskError(msg)}`)
    }
    return data
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw new Error('LLM request timed out')
    throw e
  } finally {
    clearTimeout(t)
  }
}

function openaiUrl(base: string): string {
  const b = base.replace(/\/+$/, '')
  if (b.endsWith('/chat/completions')) return b
  return b + '/chat/completions'
}

async function chatOpenAiCompatible(
  cfg: { apiKey: string; model: string; baseUrl: string },
  messages: ChatMessage[],
  opts: ChatOptions,
  extraHeaders: Record<string, string> = {}
): Promise<string> {
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: messages.map((m) => ({ role: m.role, content: clip(m.content) })),
    temperature: opts.temperature ?? 0,
    max_tokens: opts.maxTokens ?? 1800
  }
  if (opts.json) body.response_format = { type: 'json_object' }
  const headers: Record<string, string> = { ...extraHeaders }
  if (cfg.apiKey && cfg.apiKey !== 'local') headers.Authorization = `Bearer ${cfg.apiKey}`
  const data = (await postJson(openaiUrl(cfg.baseUrl), headers, body)) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('LLM returned an empty response')
  return content
}

async function chatAnthropic(
  cfg: { apiKey: string; model: string; baseUrl: string },
  messages: ChatMessage[],
  opts: ChatOptions
): Promise<string> {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
  const rest = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: clip(m.content) }))
  const body: Record<string, unknown> = {
    model: cfg.model,
    max_tokens: opts.maxTokens ?? 1800,
    temperature: opts.temperature ?? 0,
    messages: rest
  }
  if (system) body.system = clip(system, 12_000)
  if (opts.json) body.system = `${body.system || ''}\n\nReturn ONLY valid JSON.`.trim()
  const data = (await postJson(
    cfg.baseUrl.replace(/\/+$/, '') + '/v1/messages',
    { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
    body
  )) as { content?: Array<{ type?: string; text?: string }> }
  const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text || '').join('\n')
  if (!text) throw new Error('Anthropic returned an empty response')
  return text
}

export async function chat(
  messages: ChatMessage[],
  opts: ChatOptions = {}
): Promise<{ text: string; provider: LlmProviderId; model: string }> {
  const resolved = resolveLlm(opts.provider)
  if (!resolved) {
    throw new Error(
      'No API key configured. Open Settings and add OpenRouter, OpenAI, Anthropic, or a compatible base URL. Local parse still works without a key.'
    )
  }
  const text =
    resolved.id === 'anthropic'
      ? await chatAnthropic(resolved, messages, opts)
      : await chatOpenAiCompatible(
          resolved,
          messages,
          opts,
          resolved.id === 'openrouter' ? { 'HTTP-Referer': 'http://127.0.0.1:43127', 'X-Title': 'LovePDF Studio' } : {}
        )
  return { text, provider: resolved.id, model: resolved.model }
}

export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim()
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = fence ? fence[1].trim() : trimmed
  try {
    return JSON.parse(raw)
  } catch {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1))
    throw new Error('Model did not return JSON')
  }
}

export async function testProvider(id: LlmProviderId): Promise<{ ok: boolean; message: string; latencyMs: number }> {
  const t0 = Date.now()
  try {
    const result = await chat(
      [
        { role: 'system', content: 'Reply with the single word pong.' },
        { role: 'user', content: 'ping' }
      ],
      { provider: id, maxTokens: 16 }
    )
    return { ok: true, message: `Connected to ${id} (${result.model}).`, latencyMs: Date.now() - t0 }
  } catch (e) {
    return { ok: false, message: maskError(e instanceof Error ? e.message : String(e)), latencyMs: Date.now() - t0 }
  }
}

export const BANK_SCHEMA = `{
  "file": "string",
  "institution": "string|null",
  "account_name": "string|null",
  "account_number": "string|null",
  "routing_number": "string|null",
  "iban": "string|null",
  "period_start": "string|null",
  "period_end": "string|null",
  "opening_balance": "number|null",
  "closing_balance": "number|null",
  "currency": "string|null",
  "transactions": [
    { "date": "string", "description": "string", "debit": "number|null", "credit": "number|null", "amount": "number|null", "balance": "number|null" }
  ]
}`

export const INVOICE_SCHEMA = `{
  "file": "string",
  "doc_type": "invoice|receipt",
  "vendor": "string|null",
  "vendor_address": "string|null",
  "customer": "string|null",
  "invoice_number": "string|null",
  "invoice_date": "string|null",
  "due_date": "string|null",
  "currency": "string|null",
  "subtotal": "number|null",
  "tax": "number|null",
  "total": "number|null",
  "line_items": [
    { "description": "string", "qty": "number|null", "unit_price": "number|null", "amount": "number|null" }
  ]
}`
