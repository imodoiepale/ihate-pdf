import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getTool } from '@shared/tools'
import type { FileRef, JobProgress, JobResult, OptionField } from '@shared/types'
import { apiGet, apiPost, importBrowserFile, subscribeJob } from '../lib/api'
import { formatBytes, formatPages } from '../lib/format'
import { ToolIcon } from '../components/ToolIcon'
import { Callout, EmptyDrop, LoadingBar } from '../components/Callout'

type Status = {
  outputDir: string
  formatFree: string
  binaries: Record<string, string | null>
  extract?: Record<string, boolean | string>
  llm?: { defaultProvider: string | null; configured: string[]; encryption: string }
}

const defaults: Record<string, string> = {
  level: 'recommended',
  format: 'docx',
  position: 'center',
  fontSize: '16',
  dpi: '150',
  pageSize: 'fit',
  margin: 'none',
  orientation: 'auto',
  angle: '90',
  rotation: 'diagonal',
  opacity: '25',
  start: '1',
  marginMm: '12',
  target: 'en'
}

export function ToolWorkspace() {
  const { id } = useParams()
  const tool = getTool(id)
  const [files, setFiles] = useState<FileRef[]>([])
  const [opts, setOpts] = useState<Record<string, string>>({ ...defaults })
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<JobProgress | null>(null)
  const [result, setResult] = useState<JobResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<Status | null>(null)
  const [pathBox, setPathBox] = useState('')
  const [drag, setDrag] = useState(false)
  const [engineDown, setEngineDown] = useState(false)

  useEffect(() => {
    setFiles([])
    setResult(null)
    setError(null)
    setProgress(null)
    setOpts({ ...defaults })
  }, [id])

  useEffect(() => {
    apiGet<Status>('/api/status')
      .then((s) => {
        setStatus(s)
        setEngineDown(false)
      })
      .catch(() => setEngineDown(true))
  }, [])

  const addFiles = useCallback((incoming: FileRef[]) => {
    setResult(null)
    setError(null)
    setFiles((prev) => {
      const map = new Map(prev.map((f) => [f.path, f]))
      for (const f of incoming) map.set(f.path, f)
      return [...map.values()]
    })
  }, [])

  async function selectNative() {
    if (!tool) return
    try {
      const data = await apiPost<{ files: FileRef[] }>('/api/pick-files', {
        multi: tool.maxFiles !== 1,
        extensions: tool.accept.map((e) => e.replace('.', ''))
      })
      addFiles(data.files)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function addByPaths() {
    const paths = pathBox
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    if (!paths.length) return
    const data = await apiPost<{ files: FileRef[] }>('/api/add-paths', { paths })
    addFiles(data.files)
    setPathBox('')
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDrag(false)
    const list = [...e.dataTransfer.files]
    const imported: FileRef[] = []
    for (const file of list) {
      const withPath = file as File & { path?: string }
      if (withPath.path) {
        const data = await apiPost<{ files: FileRef[] }>('/api/add-paths', { paths: [withPath.path] })
        imported.push(...data.files)
      } else {
        imported.push(await importBrowserFile(file))
      }
    }
    addFiles(imported)
  }

  async function onInput(e: React.ChangeEvent<HTMLInputElement>) {
    const list = [...(e.target.files || [])]
    const imported: FileRef[] = []
    for (const file of list) imported.push(await importBrowserFile(file))
    addFiles(imported)
    e.target.value = ''
  }

  function move(i: number, dir: -1 | 1) {
    setFiles((prev) => {
      const next = [...prev]
      const j = i + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  const missingHint = useMemo(() => {
    if (!tool || !status) return null
    const bins = status.binaries
    const need = (name: string, hint: string) => (!bins[name] ? hint : null)
    if (['word-to-pdf', 'ppt-to-pdf', 'excel-to-pdf', 'pdf-to-word', 'pdf-to-ppt', 'pdf-to-excel', 'html-to-pdf'].includes(tool.id)) {
      return need('soffice', 'LibreOffice is not installed. Office conversion needs soffice. Linux: sudo apt install libreoffice')
    }
    if (tool.id === 'ocr') return need('tesseract', 'Tesseract is not installed. Linux: sudo apt install tesseract-ocr')
    if (tool.id === 'jpg-to-pdf' || tool.id === 'scan-to-pdf') {
      return need('img2pdf', 'img2pdf is not installed. Linux: sudo apt install python3-img2pdf')
    }
    if (tool.id === 'pdf-to-jpg') return need('pdftoppm', 'Poppler is not installed. Linux: sudo apt install poppler-utils')
    if (tool.id === 'pdf-to-pdfa') return need('gs', 'Ghostscript is not installed. Linux: sudo apt install ghostscript')
    if (['parse-pdf', 'extract-bank', 'extract-invoice', 'ask-pdf', 'summarize-pdf', 'translate-pdf'].includes(tool.id)) {
      return need('pdftotext', 'pdftotext is not installed. Analyze/extract needs poppler-utils. Linux: sudo apt install poppler-utils')
    }
    if (tool.id === 'extract-images') {
      return need('pdfimages', 'pdfimages is not installed. Linux: sudo apt install poppler-utils')
    }
    return need('qpdf', 'qpdf is not installed. Linux: sudo apt install qpdf')
  }, [tool, status])

  const ready = useMemo(() => {
    if (!tool) return false
    if (tool.id === 'html-to-pdf' && opts.url) return true
    return files.length >= tool.minFiles
  }, [tool, files, opts.url])

  async function run() {
    if (!tool) return
    setBusy(true)
    setError(null)
    setResult(null)
    const jobId = crypto.randomUUID()
    setProgress({ jobId, percent: 1, message: 'Starting…' })
    const stop = subscribeJob(jobId, setProgress)
    await new Promise((r) => window.setTimeout(r, 40))
    try {
      const data = await apiPost<JobResult>('/api/jobs', {
        id: jobId,
        tool: tool.id,
        files,
        options: opts,
        outputDir: status?.outputDir
      })
      if (!data.ok) setError(data.message)
      else setResult(data)
      setProgress({ jobId, percent: 100, message: data.message })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      stop()
      setBusy(false)
    }
  }

  async function pickSignature() {
    const data = await apiPost<{ file: FileRef | null }>('/api/pick-image', {})
    if (data.file) setOpts((o) => ({ ...o, signature: data.file!.path }))
  }

  async function chooseOut() {
    const data = await apiPost<{ path: string | null }>('/api/pick-dir', {})
    if (data.path) {
      await apiPost('/api/settings', { outputDir: data.path })
      setStatus((s) => (s ? { ...s, outputDir: data.path! } : s))
    }
  }

  if (!tool) {
    return (
      <div className="px-5 py-24 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight">Tool not found</h1>
        <p className="mt-2 text-sm text-ilp-muted">That tool isn’t in this studio build.</p>
        <Link to="/" className="mt-4 inline-block text-sm font-semibold text-ilp-red">
          Back to all tools
        </Link>
      </div>
    )
  }

  return (
    <div className="tool-sand min-h-[calc(100vh-58px)] pb-40">
      <div className="mx-auto max-w-[860px] px-5 pt-8 text-center sm:pt-10">
        <div className="mb-4 flex justify-center">
          <ToolIcon id={tool.id} color={tool.color} size={44} />
        </div>
        <h1 className="text-[28px] font-extrabold tracking-tight text-ilp-dark sm:text-[34px]">{tool.title}</h1>
        <p className="mx-auto mt-2 max-w-[620px] text-[15px] text-[#5c5c66] sm:text-[16px]">{tool.tagline}</p>
      </div>

      {engineDown && (
        <div className="mx-auto mt-6 max-w-[760px] px-5">
          <Callout tone="danger" title="Engine offline">
            The desktop engine is not running. Start LovePDF Studio with <code className="font-mono">npm run dev</code>{' '}
            so file picking and PDF jobs can use your disk.
          </Callout>
        </div>
      )}

      {missingHint && (
        <div className="mx-auto mt-4 max-w-[760px] px-5">
          <Callout tone="warn">{missingHint}</Callout>
        </div>
      )}

      {files.some((f) => f.size >= 1024 * 1024 * 1024) && (
        <div className="mx-auto mt-4 max-w-[760px] px-5">
          <Callout tone="info" title="Huge file">
            At least one file is 1 GB or larger. LovePDF Studio will stream it on disk with qpdf and related CLI tools
            — it will not load the document into the page heap. Make sure the destination drive has enough free space.
            There is no app-imposed size or file-count cap.
          </Callout>
        </div>
      )}

      <div className="mx-auto mt-8 max-w-[760px] px-5">
        <div
          className={`rounded-2xl bg-white p-6 shadow-drop sm:p-8 ${drag ? 'ring-2 ring-ilp-red' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => void onDrop(e)}
        >
          {files.length === 0 ? (
            <EmptyDrop
              icon={<ToolIcon id={tool.id} color={tool.color} size={52} />}
              action={
                <button className="ilp-btn" onClick={() => void selectNative()}>
                  Select {tool.acceptLabel}
                </button>
              }
              hint={`or drop ${tool.acceptLabel} here`}
              extra={
                <label className="mt-4 inline-block cursor-pointer text-xs font-semibold text-ilp-red">
                  Use browser file picker
                  <input
                    type="file"
                    multiple={tool.maxFiles !== 1}
                    accept={tool.accept.join(',')}
                    className="hidden"
                    onChange={(e) => void onInput(e)}
                  />
                </label>
              }
            />
          ) : (
            <div>
              <div className="flex flex-wrap gap-3">
                {files.map((f, i) => (
                  <article key={f.id} className="file-card">
                    <button
                      className="absolute right-2 top-2 text-[#b0b0b6] hover:text-ilp-red"
                      onClick={() => setFiles((prev) => prev.filter((x) => x.id !== f.id))}
                      aria-label={`Remove ${f.name}`}
                    >
                      ×
                    </button>
                    <div className="mb-2 text-[#e5322d]">
                      <PdfBadge ext={f.ext} />
                    </div>
                    <p className="w-full truncate text-center text-xs font-semibold" title={f.path}>
                      {f.name}
                    </p>
                    <p className="text-[11px] text-ilp-muted">
                      {formatBytes(f.size)}
                      {f.pages ? ` · ${formatPages(f.pages)}` : ''}
                    </p>
                    {f.encrypted && <p className="text-[11px] text-amber-700">Locked</p>}
                    <div className="mt-2 flex gap-1">
                      <button className="text-[11px] text-ilp-red" onClick={() => move(i, -1)}>
                        ↑
                      </button>
                      <button className="text-[11px] text-ilp-red" onClick={() => move(i, 1)}>
                        ↓
                      </button>
                    </div>
                  </article>
                ))}
                {tool.maxFiles !== 1 && (
                  <button
                    onClick={() => void selectNative()}
                    className="flex h-[148px] w-[148px] flex-col items-center justify-center rounded-xl border border-dashed border-[#d9d4cc] text-sm text-ilp-muted hover:border-ilp-red hover:text-ilp-red"
                  >
                    + Add more
                  </button>
                )}
              </div>
              {tool.minFiles > files.length && (
                <p className="mt-4 text-sm text-ilp-red">
                  Please select more {tool.acceptLabel} — this tool needs at least {tool.minFiles}.
                </p>
              )}
            </div>
          )}

          <details className="mt-6 text-left text-sm">
            <summary className="cursor-pointer text-ilp-muted">Add by absolute path (for huge files)</summary>
            <p className="mt-2 text-xs text-ilp-muted">
              Paths never copy the file. Use this for documents that should not pass through a file picker buffer.
            </p>
            <textarea
              className="field mt-2 font-mono text-xs"
              rows={3}
              placeholder="/data/archive/huge.pdf"
              value={pathBox}
              onChange={(e) => setPathBox(e.target.value)}
            />
            <button className="ilp-btn-outline mt-2" onClick={() => void addByPaths()}>
              Add paths
            </button>
          </details>
        </div>

        {tool.options.length > 0 && (
          <div className="mt-5 rounded-2xl bg-white p-5 shadow-drop sm:p-6">
            <h2 className="mb-4 text-[11px] font-bold uppercase tracking-[0.14em] text-ilp-muted">Options</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {tool.options.map((field) => (
                <OptionInput
                  key={field.key}
                  field={field}
                  value={opts}
                  onChange={(k, v) => setOpts((o) => ({ ...o, [k]: v }))}
                  onPickImage={() => void pickSignature()}
                />
              ))}
            </div>
          </div>
        )}

        {status && (
          <p className="mt-4 text-center text-xs text-ilp-muted">
            Saving to {status.outputDir} · {status.formatFree} free
            <button className="ml-2 text-ilp-red underline" onClick={() => void chooseOut()}>
              Change folder
            </button>
          </p>
        )}

        {busy && <LoadingBar message={progress?.message || 'Working on disk…'} percent={progress?.percent || 8} />}

        {error && (
          <div className="mt-6">
            <Callout tone="danger" title="Couldn’t finish this job">
              {error}
            </Callout>
          </div>
        )}

        {result?.ok && (
          <div className="surface mt-6 mb-8 p-5">
            <p className="font-semibold text-ilp-dark">{result.message}</p>
            {Boolean(result.extra?.truncated) && (
              <p className="mt-2 text-sm text-amber-800">
                Huge document: only a page window was indexed. Set a page range or tick “entire document”.
              </p>
            )}
            {Array.isArray(result.extra?.failures) && (result.extra.failures as { name: string; error: string }[]).length > 0 && (
              <ul className="mt-3 space-y-1 text-sm text-red-700">
                {(result.extra.failures as { name: string; error: string }[]).map((f) => (
                  <li key={f.name}>
                    {f.name}: {f.error}
                  </li>
                ))}
              </ul>
            )}
            {typeof result.extra?.preview === 'string' && result.extra.preview && (
              <pre className="mt-3 max-h-56 overflow-auto rounded-xl bg-[#f6f6f8] p-3 text-left font-mono text-[11px] leading-relaxed text-[#333]">
                {result.extra.preview}
              </pre>
            )}
            {typeof result.extra?.answer === 'string' && result.extra.answer && (
              <div className="mt-3 whitespace-pre-wrap rounded-xl bg-[#fff7f6] p-3 text-left text-sm">{result.extra.answer}</div>
            )}
            <ul className="mt-3 space-y-2">
              {result.outputs.map((o) => (
                <li key={o.path} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">
                    {o.name} · {formatBytes(o.size)}
                  </span>
                  <span className="flex gap-2">
                    <button className="text-ilp-red" onClick={() => void apiPost('/api/open', { path: o.path })}>
                      Open
                    </button>
                    <button className="text-ilp-red" onClick={() => void apiPost('/api/reveal', { path: o.path })}>
                      Show in folder
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            {tool.id === 'ask-pdf' && typeof result.extra?.indexDir === 'string' && (
              <AskPanel indexDir={result.extra.indexDir} useLlm={opts.useLlm === 'true'} />
            )}
            <button
              className="ilp-btn-outline mt-4"
              onClick={() => {
                setFiles([])
                setResult(null)
              }}
            >
              Start over
            </button>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-[#ececef] bg-white/95 shadow-bar backdrop-blur">
        <div className="mx-auto flex max-w-[860px] items-center justify-between gap-4 px-4 py-2.5 sm:px-5 sm:py-3">
          <p className="hidden text-[12.5px] leading-snug text-ilp-muted sm:block">{tool.description}</p>
          <button className="ilp-btn shrink-0" disabled={!ready || busy} onClick={() => void run()}>
            {busy ? 'Processing…' : tool.action}
          </button>
        </div>
      </div>
    </div>
  )
}

function OptionInput({
  field,
  value,
  onChange,
  onPickImage
}: {
  field: OptionField
  value: Record<string, string>
  onChange: (k: string, v: string) => void
  onPickImage: () => void
}) {
  if (field.type === 'radio') {
    return (
      <fieldset className="sm:col-span-2">
        <legend className="mb-2 text-sm font-medium">{field.label}</legend>
        <div className="flex flex-wrap gap-3">
          {field.options.map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={field.key}
                checked={(value[field.key] || field.options[0].value) === o.value}
                onChange={() => onChange(field.key, o.value)}
              />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>
    )
  }
  if (field.type === 'select') {
    return (
      <label className="block text-sm">
        <span className="mb-1 block font-medium">{field.label}</span>
        <select
          className="field"
          value={value[field.key] || field.options[0].value}
          onChange={(e) => onChange(field.key, e.target.value)}
        >
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    )
  }
  if (field.type === 'checkbox') {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value[field.key] === 'true'}
          onChange={(e) => onChange(field.key, e.target.checked ? 'true' : 'false')}
        />
        {field.label}
      </label>
    )
  }
  if (field.type === 'margins') {
    const keys = [field.keys.top, field.keys.right, field.keys.bottom, field.keys.left]
    const labels = ['Top', 'Right', 'Bottom', 'Left']
    return (
      <div className="sm:col-span-2">
        <p className="mb-2 text-sm font-medium">{field.label}</p>
        <div className="grid grid-cols-4 gap-2">
          {keys.map((k, i) => (
            <label key={k} className="text-xs">
              {labels[i]}
              <input
                type="number"
                min={0}
                className="field mt-1"
                value={value[k] || '0'}
                onChange={(e) => onChange(k, e.target.value)}
              />
            </label>
          ))}
        </div>
      </div>
    )
  }
  if (field.type === 'file') {
    return (
      <div className="text-sm">
        <p className="mb-1 font-medium">{field.label}</p>
        <button className="ilp-btn-outline" onClick={onPickImage}>
          {value.signature ? 'Change image' : 'Choose image'}
        </button>
        {value.signature && <p className="mt-1 truncate text-xs text-ilp-muted">{value.signature}</p>}
      </div>
    )
  }
  if (field.type === 'textarea') {
    return (
      <label className="block text-sm sm:col-span-2">
        <span className="mb-1 block font-medium">{field.label}</span>
        <textarea
          className="field"
          rows={3}
          placeholder={field.placeholder}
          value={value[field.key] || ''}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      </label>
    )
  }
  if (field.type === 'text' || field.type === 'password' || field.type === 'number') {
    return (
      <label className="block text-sm">
        <span className="mb-1 block font-medium">{field.label}</span>
        <input
          type={field.type}
          min={field.type === 'number' ? field.min : undefined}
          max={field.type === 'number' ? field.max : undefined}
          placeholder={field.placeholder}
          className="field"
          value={value[field.key] || ''}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
        {'hint' in field && field.hint && <span className="mt-1 block text-xs text-ilp-muted">{field.hint}</span>}
      </label>
    )
  }
  return null
}

function PdfBadge({ ext }: { ext: string }) {
  const label = ext.replace('.', '').toUpperCase() || 'FILE'
  return (
    <span className="inline-flex h-12 w-10 items-center justify-center rounded bg-[#e5322d] text-[10px] font-bold text-white">
      {label.slice(0, 4)}
    </span>
  )
}

function AskPanel({ indexDir, useLlm }: { indexDir: string; useLlm: boolean }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([])

  async function send() {
    const question = q.trim()
    if (!question || busy) return
    setBusy(true)
    setErr(null)
    setQ('')
    setMessages((m) => [...m, { role: 'user', text: question }])
    try {
      const data = await apiPost<{ answer: string; usedLlm: boolean }>('/api/ask', {
        indexDir,
        question,
        useLlm
      })
      setMessages((m) => [...m, { role: 'assistant', text: data.answer }])
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-5 border-t border-[#ececef] pt-4 text-left">
      <h3 className="text-sm font-bold text-ilp-dark">Ask this PDF</h3>
      <p className="mt-1 text-xs text-ilp-muted">
        Retrieval uses on-disk chunks. {useLlm ? 'Cloud LLM is on for this session (passages only).' : 'Local passages only — tick Use cloud LLM and re-index to send text to a model.'}
      </p>
      <div className="mt-3 max-h-64 space-y-2 overflow-auto">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded-xl px-3 py-2 text-sm ${m.role === 'user' ? 'bg-[#fff3f2] text-ilp-dark' : 'bg-[#f6f6f8]'}`}
          >
            <p className="whitespace-pre-wrap">{m.text}</p>
          </div>
        ))}
      </div>
      {err && <p className="mt-2 text-sm text-red-700">{err}</p>}
      <div className="mt-3 flex gap-2">
        <input
          className="field"
          placeholder="What is the closing balance?"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void send()
          }}
        />
        <button className="ilp-btn h-10 shrink-0 px-4" disabled={busy || !q.trim()} onClick={() => void send()}>
          {busy ? 'Asking…' : 'Ask'}
        </button>
      </div>
    </div>
  )
}
