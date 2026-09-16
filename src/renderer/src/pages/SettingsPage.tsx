import { useEffect, useState } from 'react'
import { LLM_PROVIDERS, PROVIDER_META, type LlmProviderId, type StudioPreferencesPublic } from '@shared/preferences'
import type { LibraryRuntime } from '@shared/libraries'
import { apiGet, apiPost } from '../lib/api'

type Tab = 'workspace' | 'providers' | 'parsers' | 'mcp' | 'about'

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>('providers')
  const [prefs, setPrefs] = useState<StudioPreferencesPublic | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState<string | null>(null)

  async function refresh() {
    setError(null)
    try {
      const data = await apiGet<StudioPreferencesPublic>('/api/settings')
      setPrefs(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load settings. Is the engine running?')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function patch(body: Record<string, unknown>, toast = 'Saved') {
    setError(null)
    try {
      const data = await apiPost<StudioPreferencesPublic>('/api/settings', body)
      setPrefs(data)
      setSaved(toast)
      window.setTimeout(() => setSaved(null), 1800)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-col gap-8 px-5 py-10 sm:flex-row sm:py-12">
      <aside className="sm:w-48 sm:shrink-0">
        <h1 className="text-[22px] font-extrabold tracking-tight text-ilp-dark">Settings</h1>
        <p className="mt-1 text-[13px] text-ilp-muted">Local to this computer</p>
        <nav className="mt-6 flex gap-2 overflow-x-auto sm:flex-col sm:gap-1">
          {(
            [
              ['providers', 'API keys'],
              ['parsers', 'Parsers'],
              ['workspace', 'Workspace'],
              ['mcp', 'MCP'],
              ['about', 'About']
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              className={`rounded-xl px-3 py-2 text-left text-[13.5px] font-semibold transition ${
                tab === id ? 'bg-[#fff3f2] text-ilp-red' : 'text-[#5c5c66] hover:bg-[#fafafa]'
              }`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      </aside>

      <section className="min-w-0 flex-1">
        {loading && (
          <div className="surface p-8">
            <div className="h-4 w-40 animate-pulse rounded bg-[#ececef]" />
            <div className="mt-4 h-24 animate-pulse rounded-xl bg-[#f6f6f8]" />
            <div className="mt-3 h-24 animate-pulse rounded-xl bg-[#f6f6f8]" />
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm text-red-700">
            {error}
            <button className="ml-3 font-semibold text-ilp-red" onClick={() => void refresh()}>
              Retry
            </button>
          </div>
        )}
        {saved && <p className="mb-3 text-sm font-semibold text-emerald-700">{saved}</p>}

        {!loading && prefs && tab === 'providers' && (
          <div className="space-y-4">
            <header>
              <h2 className="text-[18px] font-extrabold tracking-tight text-ilp-dark">Bring your own keys</h2>
              <p className="mt-1 text-[13.5px] leading-relaxed text-[#5c5c66]">
                Keys are stored with the OS keychain via Electron safeStorage when available, otherwise AES-256-GCM in
                a 0600 sidecar. They are never written to git, never logged, and never shown in full after you save.
                Files are not sent to a provider unless you tick <span className="font-semibold">Use cloud LLM</span> on
                an extract job.
              </p>
              {prefs.encryption && (
                <p className="mt-2 text-[12px] text-ilp-muted">
                  Encryption: {prefs.encryption === 'safeStorage' ? 'OS keychain (safeStorage)' : 'AES-256-GCM file'}
                  {prefs.defaultProvider ? ` · Default provider: ${prefs.defaultProvider}` : ''}
                </p>
              )}
            </header>
            {LLM_PROVIDERS.map((id) => (
              <ProviderCard
                key={id}
                id={id}
                prefs={prefs}
                onSave={(body) => patch(body, `${PROVIDER_META[id].label} saved`)}
              />
            ))}
          </div>
        )}

        {!loading && prefs && tab === 'workspace' && (
          <WorkspacePanel prefs={prefs} onPatch={patch} />
        )}

        {tab === 'parsers' && <ParsersPanel />}

        {!loading && prefs && tab === 'mcp' && <McpPanel prefs={prefs} onPatch={patch} />}

        {!loading && tab === 'about' && <AboutPanel />}
      </section>
    </div>
  )
}

function ProviderCard({
  id,
  prefs,
  onSave
}: {
  id: LlmProviderId
  prefs: StudioPreferencesPublic
  onSave: (body: Record<string, unknown>) => Promise<void>
}) {
  const meta = PROVIDER_META[id]
  const current = prefs.providers[id]
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(current.model)
  const [baseUrl, setBaseUrl] = useState(current.baseUrl || '')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [testMsg, setTestMsg] = useState<string | null>(null)
  const isDefault = prefs.defaultProvider === id

  useEffect(() => {
    setModel(current.model)
    setBaseUrl(current.baseUrl || '')
  }, [current.model, current.baseUrl])

  async function save() {
    setBusy(true)
    try {
      await onSave({
        providers: {
          [id]: {
            apiKey: apiKey.trim() || undefined,
            model,
            baseUrl: id === 'custom' ? baseUrl : undefined,
            setDefault: isDefault || !prefs.defaultProvider
          }
        }
      })
      setApiKey('')
    } finally {
      setBusy(false)
    }
  }

  async function clearKey() {
    setBusy(true)
    try {
      await onSave({ providers: { [id]: { clearKey: true } } })
      setApiKey('')
    } finally {
      setBusy(false)
    }
  }

  async function testConn() {
    setBusy(true)
    setTestMsg(null)
    try {
      if (apiKey.trim() || model || (id === 'custom' && baseUrl)) {
        await onSave({
          providers: {
            [id]: {
              apiKey: apiKey.trim() || undefined,
              model,
              baseUrl: id === 'custom' ? baseUrl : undefined
            }
          }
        })
        setApiKey('')
      }
      const data = await apiPost<{ ok: boolean; message: string; latencyMs: number }>('/api/keys/test', {
        provider: id
      })
      setTestMsg(`${data.message} (${data.latencyMs} ms)`)
    } catch (e) {
      setTestMsg(e instanceof Error ? e.message : 'Test failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="surface overflow-hidden">
      <div className="h-1" style={{ background: meta.accent }} />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-bold text-ilp-dark">{meta.label}</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-[#5c5c66]">{meta.blurb}</p>
          </div>
          <StatusChip hasKey={current.hasKey} fromEnv={current.fromEnv} hint={current.hint} />
        </div>
        <label className="mt-4 block text-[12px] font-semibold text-ilp-muted">API key</label>
        <div className="mt-1 flex gap-2">
          <input
            className="field font-mono text-[13px]"
            type={show ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            placeholder={current.hasKey ? current.hint : meta.placeholder}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <button type="button" className="btn-ghost shrink-0" onClick={() => setShow((v) => !v)}>
            {show ? 'Hide' : 'Show'}
          </button>
        </div>
        {id === 'custom' && (
          <>
            <label className="mt-3 block text-[12px] font-semibold text-ilp-muted">Base URL</label>
            <input
              className="field mt-1 font-mono text-[13px]"
              placeholder="http://127.0.0.1:11434/v1"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </>
        )}
        <label className="mt-3 block text-[12px] font-semibold text-ilp-muted">Default model</label>
        <input className="field mt-1 font-mono text-[13px]" value={model} onChange={(e) => setModel(e.target.value)} />
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-primary h-10" disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button
            className="btn-outline"
            disabled={busy || (!current.hasKey && id !== 'custom')}
            onClick={() => void testConn()}
          >
            Test connection
          </button>
          <button
            className="btn-ghost"
            disabled={busy || isDefault}
            onClick={() => void onSave({ defaultProvider: id })}
          >
            {isDefault ? 'Default' : 'Make default'}
          </button>
          {current.hasKey && !current.fromEnv && (
            <button className="btn-ghost" disabled={busy} onClick={() => void clearKey()}>
              Remove stored key
            </button>
          )}
        </div>
        {testMsg && <p className="mt-3 text-[13px] text-[#5c5c66]">{testMsg}</p>}
      </div>
    </article>
  )
}

function StatusChip({ hasKey, fromEnv, hint }: { hasKey: boolean; fromEnv: boolean; hint: string }) {
  if (!hasKey) {
    return (
      <span className="shrink-0 rounded-full bg-[#f6f6f8] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-ilp-muted">
        No key
      </span>
    )
  }
  return (
    <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
      {fromEnv ? 'Env' : 'Saved'} {hint}
    </span>
  )
}

function WorkspacePanel({
  prefs,
  onPatch
}: {
  prefs: StudioPreferencesPublic
  onPatch: (body: Record<string, unknown>, toast?: string) => Promise<void>
}) {
  const [concurrency, setConcurrency] = useState(String(prefs.concurrency))

  async function chooseOut() {
    const data = await apiPost<{ path: string | null }>('/api/pick-dir', {})
    if (data.path) await onPatch({ outputDir: data.path }, 'Output folder updated')
  }

  return (
    <div className="space-y-4">
      <h2 className="text-[18px] font-extrabold tracking-tight text-ilp-dark">Workspace</h2>
      <div className="surface p-5">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-ilp-muted">Output folder</p>
        <p className="mt-2 break-all font-mono text-[13px] text-ilp-dark">{prefs.outputDir}</p>
        <button className="btn-outline mt-4" onClick={() => void chooseOut()}>
          Change folder
        </button>
      </div>
      <div className="surface p-5">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-ilp-muted">Job concurrency</p>
        <p className="mt-1 text-[13px] text-[#5c5c66]">How many PDF jobs may run at once. Keep this low on huge files.</p>
        <div className="mt-3 flex items-center gap-3">
          <input
            className="field w-24"
            type="number"
            min={1}
            max={4}
            value={concurrency}
            onChange={(e) => setConcurrency(e.target.value)}
          />
          <button className="btn-primary h-10" onClick={() => void onPatch({ concurrency: Number(concurrency) })}>
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}

function McpPanel({
  prefs,
  onPatch
}: {
  prefs: StudioPreferencesPublic
  onPatch: (body: Record<string, unknown>, toast?: string) => Promise<void>
}) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    await navigator.clipboard.writeText(prefs.mcp.url)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="space-y-4">
      <h2 className="text-[18px] font-extrabold tracking-tight text-ilp-dark">Model Context Protocol</h2>
      <p className="text-[13.5px] leading-relaxed text-[#5c5c66]">
        Cursor and other MCP clients can call the same local engine. Two options: HTTP JSON-RPC at{' '}
        <code className="font-mono">{prefs.mcp.url}</code>, or the stdio server{' '}
        <code className="font-mono">node mcp/lovepdf-mcp.mjs</code>. Tools: parse_pdf, extract_bank, extract_mpesa,
        extract_invoice, extract_anything, ask_pdf. We wrap the engine rather than inventing a competing protocol;
        Microsoft MarkItDown also ships <code className="font-mono">markitdown-mcp</code> if you want the generic
        converter.
      </p>
      <div className="surface p-5">
        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block text-[15px] font-bold text-ilp-dark">Enable local MCP</span>
            <span className="mt-1 block text-[13px] text-[#5c5c66]">Listen at {prefs.mcp.url}</span>
          </span>
          <button
            role="switch"
            aria-checked={prefs.mcp.enabled}
            className={`relative h-7 w-12 rounded-full transition ${prefs.mcp.enabled ? 'bg-ilp-red' : 'bg-[#d9d9de]'}`}
            onClick={() => void onPatch({ mcpEnabled: !prefs.mcp.enabled }, prefs.mcp.enabled ? 'MCP off' : 'MCP on')}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
                prefs.mcp.enabled ? 'left-5' : 'left-0.5'
              }`}
            />
          </button>
        </label>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <code className="rounded-lg bg-[#f6f6f8] px-3 py-2 font-mono text-[12.5px]">{prefs.mcp.url}</code>
          <button className="btn-ghost" onClick={() => void copy()}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AboutPanel() {
  return (
    <div className="space-y-4">
      <h2 className="text-[18px] font-extrabold tracking-tight text-ilp-dark">About LovePDF Studio</h2>
      <div className="surface p-5 text-[14px] leading-relaxed text-[#5c5c66]">
        <p>
          LovePDF Studio is an independent, open-source desktop PDF toolbox. It is not affiliated with, endorsed
          by, or a substitute name for iLovePDF.
        </p>
        <p className="mt-3">
          Processing runs on your disk through qpdf, Ghostscript, Poppler, LibreOffice, img2pdf, Tesseract, and
          PyMuPDF. Optional AI features use keys you provide — OpenRouter, OpenAI, Anthropic, or an
          OpenAI-compatible endpoint. See <span className="font-semibold">Settings → Parsers</span> for the full
          research list (PyMuPDF, MarkItDown, Reducto Parse+Extract, Extractous, Docling, Marker, MinerU, and more).
        </p>
        <p className="mt-3 text-[13px] text-ilp-muted">Version 1.0.0 · MIT License · James Epale</p>
      </div>
    </div>
  )
}

const KIND_LABEL: Record<string, string> = {
  'local-fast': 'Fast local (sub-2 s class)',
  'local-tables': 'Tables / ledgers',
  'local-ocr': 'OCR',
  'local-layout': 'Layout models (optional)',
  'cloud-extract': 'Cloud extract (not uploaded by default)',
  'schema-llm': 'Schema extract'
}

function statusChip(lib: LibraryRuntime) {
  if (lib.activeDefault) return { label: 'Default', className: 'bg-emerald-50 text-emerald-800' }
  if (lib.installed) return { label: 'Installed', className: 'bg-emerald-50 text-emerald-800' }
  if (lib.status === 'shipped') return { label: 'Shipped', className: 'bg-[#fff3f2] text-ilp-red' }
  if (lib.status === 'cloud') return { label: 'Cloud', className: 'bg-[#f6f6f8] text-ilp-muted' }
  return { label: 'Optional', className: 'bg-[#f6f6f8] text-ilp-muted' }
}

function ParsersPanel() {
  const [libs, setLibs] = useState<LibraryRuntime[] | null>(null)
  const [defaultParser, setDefaultParser] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiGet<{ libraries: LibraryRuntime[]; defaultParser: string }>('/api/libraries')
      .then((data) => {
        setLibs(data.libraries)
        setDefaultParser(data.defaultParser)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load parser catalog'))
  }, [])

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-[18px] font-extrabold tracking-tight text-ilp-dark">Parsers we researched</h2>
        <p className="mt-1 text-[13.5px] leading-relaxed text-[#5c5c66]">
          The sub-2-second path is <span className="font-semibold">PyMuPDF</span>
          {defaultParser ? ` (active default: ${defaultParser})` : ''}. “Razer / Extract” maps to{' '}
          <span className="font-semibold">Reducto Parse + Extract</span> (cloud) and locally to Analyze PDF + Extract
          anything. We detect optional libraries if you install them; we do not download multi-gigabyte models.
        </p>
      </header>
      {error && (
        <div className="rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {!libs && !error && (
        <div className="surface p-8">
          <div className="h-4 w-40 animate-pulse rounded bg-[#ececef]" />
          <div className="mt-4 h-24 animate-pulse rounded-xl bg-[#f6f6f8]" />
        </div>
      )}
      {libs?.map((lib) => {
        const chip = statusChip(lib)
        return (
          <article key={lib.id} className="surface overflow-hidden">
            <div className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ilp-muted">
                    {KIND_LABEL[lib.kind] || lib.kind}
                  </p>
                  <h3 className="mt-1 text-[15px] font-bold text-ilp-dark">{lib.name}</h3>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${chip.className}`}>
                  {chip.label}
                </span>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-[#5c5c66]">{lib.what}</p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ilp-muted">
                <span className="font-semibold text-ilp-dark">Speed: </span>
                {lib.speed}
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ilp-muted">{lib.notes}</p>
              <a
                className="mt-3 inline-block text-[12.5px] font-semibold text-ilp-red hover:underline"
                href={lib.url}
                target="_blank"
                rel="noreferrer"
              >
                {lib.url.replace(/^https?:\/\//, '')}
              </a>
            </div>
          </article>
        )
      })}
    </div>
  )
}
