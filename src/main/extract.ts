import { existsSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import type { JobRequest, JobResult } from '@shared/types'
import type { JobProgress } from '@shared/types'
import { defaultTmp } from './paths'
import { ensureDir, parseRanges, rmQuiet, run, uniquePath, whichSync } from './run'
import { BANK_SCHEMA, INVOICE_SCHEMA, chat, parseJsonLoose } from './llm'
import { resolveLlm } from './preferences'

type Emit = (p: JobProgress) => void

function extractPy(): string {
  const packed = join(process.resourcesPath || '', 'extract.py')
  if (existsSync(packed)) return packed
  return join(process.cwd(), 'resources/extract.py')
}

function py(): string {
  return whichSync('python3') || 'python3'
}

export async function extractEngines(): Promise<Record<string, boolean | string>> {
  try {
    const { stdout } = await run(py(), [extractPy(), 'engines'], { timeoutMs: 15_000 })
    return JSON.parse(stdout.trim()) as Record<string, boolean | string>
  } catch {
    return {
      pdftotext: Boolean(whichSync('pdftotext')),
      markitdown: false,
      pdfplumber: false,
      defaultParser: whichSync('pdftotext') ? 'pdftotext' : 'none'
    }
  }
}

function optStr(opts: JobRequest['options'], key: string, fallback = ''): string {
  const v = opts[key]
  if (v === undefined || v === null) return fallback
  return String(v)
}

function truthy(opts: JobRequest['options'], key: string): boolean {
  const v = optStr(opts, key).toLowerCase()
  return v === 'true' || v === '1' || v === 'yes' || v === 'on'
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T
}

export interface ParseMeta {
  engine: string
  pagesTotal: number
  pagesParsed: number[]
  truncated: boolean
  usedOcr: boolean
  tables: number
  chunks: number
  elapsedMs: number
  markitdown: boolean
  preview: string
  source: string
}

export async function parseToDisk(
  pdf: string,
  destDir: string,
  options: JobRequest['options']
): Promise<ParseMeta> {
  await ensureDir(destDir)
  const args = [extractPy(), 'parse', '--inp', pdf, '--out-dir', destDir]
  const pages = optStr(options, 'pages')
  if (pages) args.push('--pages', pages)
  if (truthy(options, 'entire')) args.push('--entire')
  const engine = optStr(options, 'engine', 'auto')
  if (engine) args.push('--engine', engine)
  const lang = optStr(options, 'lang', 'eng')
  if (lang) args.push('--lang', lang)
  const { stdout } = await run(py(), args, { timeoutMs: 10 * 60_000 })
  const line = stdout.trim().split('\n').filter(Boolean).pop() || '{}'
  return JSON.parse(line) as ParseMeta
}

async function localExtract(kind: 'bank' | 'invoice', parsedDir: string, outJson: string): Promise<Record<string, unknown>> {
  const cmd = kind === 'bank' ? 'extract-bank' : 'extract-invoice'
  await run(py(), [extractPy(), cmd, '--parsed-dir', parsedDir, '--out', outJson], { timeoutMs: 60_000 })
  return readJson<Record<string, unknown>>(outJson)
}

function layoutSnippet(parsedDir: string, max = 14_000): Promise<string> {
  return readFile(join(parsedDir, 'layout.txt'), 'utf8')
    .then((t) => (t.length > max ? t.slice(0, max) + '\n[truncated]' : t))
    .catch(() => '')
}

async function llmRefine(
  kind: 'bank' | 'invoice',
  fileName: string,
  local: Record<string, unknown>,
  parsedDir: string,
  provider?: string
): Promise<Record<string, unknown>> {
  const schema = kind === 'bank' ? BANK_SCHEMA : INVOICE_SCHEMA
  const text = await layoutSnippet(parsedDir)
  const { text: raw } = await chat(
    [
      {
        role: 'system',
        content:
          `You extract structured data from ${kind === 'bank' ? 'bank statements' : 'invoices and receipts'}. ` +
          `Return JSON matching this schema:\n${schema}\n` +
          `Use the local parse as a starting point. Fix missing fields when the text supports them. ` +
          `Do not invent amounts. Numbers must come from the document.`
      },
      {
        role: 'user',
        content:
          `File: ${fileName}\nLocal parse JSON:\n${JSON.stringify(local).slice(0, 10_000)}\n\nDocument text:\n${text}`
      }
    ],
    { provider, json: true, maxTokens: 2500 }
  )
  const parsed = parseJsonLoose(raw)
  if (!parsed || typeof parsed !== 'object') return local
  return { ...local, ...(parsed as Record<string, unknown>), file: fileName }
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function bankRows(docs: Array<Record<string, unknown>>): string {
  const header = [
    'file',
    'account_number',
    'institution',
    'date',
    'description',
    'debit',
    'credit',
    'amount',
    'balance'
  ]
  const lines = [header.join(',')]
  for (const d of docs) {
    const tx = Array.isArray(d.transactions) ? d.transactions : [{}]
    if (!tx.length) tx.push({})
    for (const t of tx as Array<Record<string, unknown>>) {
      lines.push(
        [
          d.file,
          d.account_number,
          d.institution,
          t.date,
          t.description,
          t.debit,
          t.credit,
          t.amount,
          t.balance
        ]
          .map(csvEscape)
          .join(',')
      )
    }
  }
  return lines.join('\n') + '\n'
}

function invoiceRows(docs: Array<Record<string, unknown>>): string {
  const header = [
    'file',
    'doc_type',
    'vendor',
    'invoice_number',
    'invoice_date',
    'customer',
    'description',
    'qty',
    'unit_price',
    'amount',
    'subtotal',
    'tax',
    'total'
  ]
  const lines = [header.join(',')]
  for (const d of docs) {
    const items = Array.isArray(d.line_items) && d.line_items.length ? d.line_items : [{}]
    for (const it of items as Array<Record<string, unknown>>) {
      lines.push(
        [
          d.file,
          d.doc_type,
          d.vendor,
          d.invoice_number,
          d.invoice_date,
          d.customer,
          it.description,
          it.qty,
          it.unit_price,
          it.amount,
          d.subtotal,
          d.tax,
          d.total
        ]
          .map(csvEscape)
          .join(',')
      )
    }
  }
  return lines.join('\n') + '\n'
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next
      next += 1
      out[i] = await fn(items[i], i)
    }
  }
  const n = Math.max(1, Math.min(limit, items.length || 1))
  await Promise.all(Array.from({ length: n }, () => worker()))
  return out
}

export interface FileFailure {
  name: string
  error: string
}

async function resultFile(path: string): Promise<{ path: string; name: string; size: number }> {
  const { stat } = await import('node:fs/promises')
  const s = await stat(path)
  return { path, name: basename(path), size: s.size }
}

export async function runParseJob(job: JobRequest, destRoot: string, cb: Emit): Promise<JobResult> {
  const outputs: JobResult['outputs'] = []
  const failures: FileFailure[] = []
  const metas: ParseMeta[] = []
  let i = 0
  for (const f of job.files) {
    i += 1
    cb({ jobId: job.id, percent: (i / job.files.length) * 90, message: `Parsing ${f.name}`, current: i, total: job.files.length })
    try {
      const dir = await uniquePath(join(destRoot, `${basename(f.name, extname(f.name))}-parse`))
      const meta = await parseToDisk(f.path, dir, job.options)
      metas.push(meta)
      outputs.push(await resultFile(join(dir, 'markdown.md')))
      outputs.push(await resultFile(join(dir, 'layout.txt')))
      outputs.push(await resultFile(join(dir, 'meta.json')))
      if (existsSync(join(dir, 'tables.json'))) outputs.push(await resultFile(join(dir, 'tables.json')))
    } catch (e) {
      failures.push({ name: f.name, error: e instanceof Error ? e.message : String(e) })
    }
  }
  if (!outputs.length) throw new Error(failures[0]?.error || 'Parse failed')
  const fastest = metas[0]
  return {
    jobId: job.id,
    ok: true,
    message:
      failures.length && outputs.length
        ? `Parsed ${job.files.length - failures.length} of ${job.files.length} files (${failures.length} failed)`
        : `Parsed with ${fastest?.engine || 'local'} in ${fastest?.elapsedMs ?? '?'} ms`,
    outputs,
    extra: {
      failures,
      parser: fastest?.engine,
      truncated: metas.some((m) => m.truncated),
      preview: fastest?.preview,
      elapsedMs: fastest?.elapsedMs
    }
  }
}

export async function runStructuredExtract(
  kind: 'bank' | 'invoice',
  job: JobRequest,
  destRoot: string,
  cb: Emit
): Promise<JobResult> {
  const useLlm = truthy(job.options, 'useLlm')
  const provider = optStr(job.options, 'provider') || undefined
  if (useLlm && !resolveLlm(provider)) {
    cb({
      jobId: job.id,
      percent: 3,
      message: 'No API key — continuing with local parser. Add a key in Settings to refine with an LLM.'
    })
  }
  const docs: Array<Record<string, unknown>> = []
  const failures: FileFailure[] = []
  const outputs: JobResult['outputs'] = []
  const tmpRoot = join(defaultTmp(), `extract-${randomUUID()}`)
  await ensureDir(tmpRoot)

  const limit = useLlm && resolveLlm(provider) ? 2 : 3
  let done = 0
  await mapPool(job.files, limit, async (f) => {
    try {
      cb({
        jobId: job.id,
        percent: 5 + (done / Math.max(1, job.files.length)) * 80,
        message: `Extracting ${f.name}`,
        current: done + 1,
        total: job.files.length
      })
      const parsedDir = join(tmpRoot, basename(f.name, extname(f.name)) + '-' + randomUUID().slice(0, 8))
      await parseToDisk(f.path, parsedDir, job.options)
      const localPath = join(parsedDir, `${kind}.json`)
      let doc = await localExtract(kind, parsedDir, localPath)
      doc.file = f.name
      if (useLlm && resolveLlm(provider)) {
        try {
          doc = await llmRefine(kind, f.name, doc, parsedDir, provider)
        } catch (e) {
          doc.llm_error = e instanceof Error ? e.message : String(e)
        }
      }
      docs.push(doc)
      const per = await uniquePath(join(destRoot, `${basename(f.name, extname(f.name))}-${kind}.json`))
      await writeFile(per, JSON.stringify(doc, null, 2) + '\n')
      outputs.push(await resultFile(per))
    } catch (e) {
      failures.push({ name: f.name, error: e instanceof Error ? e.message : String(e) })
    } finally {
      done += 1
    }
  })

  if (!docs.length) {
    throw new Error(
      failures.length
        ? `All ${failures.length} files failed. First error: ${failures[0].error}`
        : 'Nothing extracted'
    )
  }

  const combined = await uniquePath(join(destRoot, kind === 'bank' ? 'statements.json' : 'invoices.json'))
  await writeFile(combined, JSON.stringify({ documents: docs, failures }, null, 2) + '\n')
  outputs.unshift(await resultFile(combined))

  const csvPath = await uniquePath(join(destRoot, kind === 'bank' ? 'statements.csv' : 'invoices.csv'))
  await writeFile(csvPath, kind === 'bank' ? bankRows(docs) : invoiceRows(docs))
  outputs.unshift(await resultFile(csvPath))

  const txCount =
    kind === 'bank'
      ? docs.reduce((n, d) => n + (Array.isArray(d.transactions) ? d.transactions.length : 0), 0)
      : docs.reduce((n, d) => n + (Array.isArray(d.line_items) ? d.line_items.length : 0), 0)

  return {
    jobId: job.id,
    ok: true,
    message: failures.length
      ? `Extracted ${docs.length} of ${job.files.length} files, ${txCount} rows (${failures.length} failed)`
      : `Extracted ${txCount} rows from ${docs.length} file${docs.length === 1 ? '' : 's'}`,
    outputs,
    extra: {
      failures,
      preview: JSON.stringify(docs[0], null, 2).slice(0, 2500),
      usedLlm: Boolean(useLlm && resolveLlm(provider)),
      count: txCount
    }
  }
}

export async function runSummarizeJob(job: JobRequest, destRoot: string, cb: Emit): Promise<JobResult> {
  const useLlm = truthy(job.options, 'useLlm')
  const provider = optStr(job.options, 'provider') || undefined
  const outputs: JobResult['outputs'] = []
  const failures: FileFailure[] = []
  let i = 0
  for (const f of job.files) {
    i += 1
    cb({ jobId: job.id, percent: (i / job.files.length) * 90, message: `Summarizing ${f.name}`, current: i, total: job.files.length })
    try {
      const parsedDir = join(defaultTmp(), `sum-${randomUUID()}`)
      await parseToDisk(f.path, parsedDir, job.options)
      const localOut = await uniquePath(join(destRoot, `${basename(f.name, extname(f.name))}-summary.md`))
      await run(py(), [extractPy(), 'summarize-local', '--parsed-dir', parsedDir, '--out', localOut], { timeoutMs: 30_000 })
      if (useLlm && resolveLlm(provider)) {
        const snippet = await layoutSnippet(parsedDir, 16_000)
        const { text } = await chat(
          [
            {
              role: 'system',
              content:
                'Summarize this PDF for a busy reader. Use short markdown: title, 5-8 bullets, then any amounts/dates/parties. Do not invent facts.'
            },
            { role: 'user', content: `File: ${f.name}\n\n${snippet}` }
          ],
          { provider, maxTokens: 1200 }
        )
        await writeFile(localOut, text.trim() + '\n')
      } else if (useLlm && !resolveLlm(provider)) {
        const existing = await readFile(localOut, 'utf8')
        await writeFile(
          localOut,
          existing +
            '\n\n> Cloud summary skipped: add an API key in Settings (OpenRouter, OpenAI, Anthropic, or compatible).\n'
        )
      }
      outputs.push(await resultFile(localOut))
    } catch (e) {
      failures.push({ name: f.name, error: e instanceof Error ? e.message : String(e) })
    }
  }
  if (!outputs.length) throw new Error(failures[0]?.error || 'Summarize failed')
  return {
    jobId: job.id,
    ok: true,
    message: failures.length ? `Summarized ${outputs.length} of ${job.files.length}` : `Saved ${outputs.length} summaries`,
    outputs,
    extra: { failures, usedLlm: Boolean(useLlm && resolveLlm(provider)) }
  }
}

export async function runTranslateJob(job: JobRequest, destRoot: string, cb: Emit): Promise<JobResult> {
  const target = optStr(job.options, 'target', 'en') || 'en'
  const provider = optStr(job.options, 'provider') || undefined
  if (!resolveLlm(provider)) {
    throw new Error(
      'Translate PDF needs an API key. Open Settings and add OpenRouter, OpenAI, Anthropic, or an OpenAI-compatible endpoint. Local parse still works from Analyze PDF.'
    )
  }
  const outputs: JobResult['outputs'] = []
  const failures: FileFailure[] = []
  let i = 0
  for (const f of job.files) {
    i += 1
    cb({ jobId: job.id, percent: (i / job.files.length) * 90, message: `Translating ${f.name}`, current: i, total: job.files.length })
    try {
      const parsedDir = join(defaultTmp(), `tr-${randomUUID()}`)
      await parseToDisk(f.path, parsedDir, job.options)
      const md = await readFile(join(parsedDir, 'markdown.md'), 'utf8').catch(() => layoutSnippet(parsedDir, 16_000))
      const { text } = await chat(
        [
          {
            role: 'system',
            content: `Translate the document into ${target}. Keep markdown structure, tables, and numbers. Do not add commentary.`
          },
          { role: 'user', content: clipMd(await md, 18_000) }
        ],
        { provider, maxTokens: 3500 }
      )
      const out = await uniquePath(join(destRoot, `${basename(f.name, extname(f.name))}-${target}.md`))
      await writeFile(out, text.trim() + '\n')
      outputs.push(await resultFile(out))
    } catch (e) {
      failures.push({ name: f.name, error: e instanceof Error ? e.message : String(e) })
    }
  }
  if (!outputs.length) throw new Error(failures[0]?.error || 'Translate failed')
  return {
    jobId: job.id,
    ok: true,
    message: `Translated ${outputs.length} file(s) to ${target}`,
    outputs,
    extra: { failures, usedLlm: true }
  }
}

function clipMd(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '\n[truncated]' : s
}

export async function runAskIndexJob(job: JobRequest, destRoot: string, cb: Emit): Promise<JobResult> {
  const f = job.files[0]
  if (!f) throw new Error('Select a PDF to index')
  cb({ jobId: job.id, percent: 10, message: `Indexing ${f.name} on disk…` })
  const dir = await uniquePath(join(destRoot, `${basename(f.name, extname(f.name))}-index`))
  const meta = await parseToDisk(f.path, dir, job.options)
  const question = optStr(job.options, 'question')
  const outputs = [
    await resultFile(join(dir, 'markdown.md')),
    await resultFile(join(dir, 'index.json')),
    await resultFile(join(dir, 'meta.json'))
  ]
  let answer: string | undefined
  if (question) {
    cb({ jobId: job.id, percent: 80, message: 'Retrieving passages…' })
    const asked = await askParsed(dir, question, {
      useLlm: truthy(job.options, 'useLlm'),
      provider: optStr(job.options, 'provider') || undefined
    })
    answer = asked.answer
    const ansPath = await uniquePath(join(dir, 'answer.md'))
    await writeFile(ansPath, `# ${question}\n\n${answer}\n`)
    outputs.push(await resultFile(ansPath))
  }
  return {
    jobId: job.id,
    ok: true,
    message: question ? 'Indexed and answered' : `Indexed ${meta.chunks} chunks with ${meta.engine}`,
    outputs,
    extra: {
      indexDir: dir,
      parser: meta.engine,
      truncated: meta.truncated,
      preview: meta.preview,
      answer,
      elapsedMs: meta.elapsedMs
    }
  }
}

export async function askParsed(
  parsedDir: string,
  question: string,
  opts: { useLlm?: boolean; provider?: string; topk?: number }
): Promise<{ answer: string; hits: Array<{ pages?: number[]; text: string; score: number }>; usedLlm: boolean }> {
  const hitsPath = join(parsedDir, 'retrieve.json')
  await run(
    py(),
    [
      extractPy(),
      'retrieve',
      '--parsed-dir',
      parsedDir,
      '--query',
      question,
      '--out',
      hitsPath,
      '--topk',
      String(opts.topk || 8)
    ],
    { timeoutMs: 60_000 }
  )
  const retrieved = await readJson<{ hits: Array<{ pages?: number[]; text: string; score: number }> }>(hitsPath)
  const hits = retrieved.hits || []
  const passages = hits
    .map((h, i) => `Passage ${i + 1} (pages ${(h.pages || []).join('-')}, score ${h.score}):\n${h.text}`)
    .join('\n\n')
  if (opts.useLlm && resolveLlm(opts.provider)) {
    const { text } = await chat(
      [
        {
          role: 'system',
          content:
            'Answer the user using ONLY the supplied passages from a local PDF. Cite page numbers. If the passages do not contain the answer, say so. Never request the whole file.'
        },
        { role: 'user', content: `Question: ${question}\n\n${passages.slice(0, 20_000)}` }
      ],
      { provider: opts.provider, maxTokens: 1200 }
    )
    return { answer: text.trim(), hits, usedLlm: true }
  }
  if (!hits.length) {
    return {
      answer: 'No matching passages on disk. Try different words, or widen the page range and re-index.',
      hits,
      usedLlm: false
    }
  }
  const local =
    `Local retrieval (no API key used):\n\n` +
    hits
      .slice(0, 5)
      .map((h) => `**Pages ${(h.pages || []).join('–')}**\n\n${h.text.slice(0, 900)}`)
      .join('\n\n---\n\n')
  return { answer: local, hits, usedLlm: false }
}

export async function runFormsJob(job: JobRequest, destRoot: string, cb: Emit): Promise<JobResult> {
  const mode = optStr(job.options, 'mode', 'list')
  const f = job.files[0]
  if (!f) throw new Error('Select a PDF')
  cb({ jobId: job.id, percent: 20, message: mode === 'list' ? 'Reading form fields…' : 'Writing form values…' })
  if (mode === 'list') {
    const out = await uniquePath(join(destRoot, `${basename(f.name, extname(f.name))}-fields.json`))
    await run(py(), [extractPy(), 'forms-list', '--inp', f.path, '--out', out], { timeoutMs: 60_000 })
    const data = await readJson<{ count: number; fields: unknown[] }>(out)
    return {
      jobId: job.id,
      ok: true,
      message: data.count ? `Found ${data.count} fields` : 'No AcroForm fields in this PDF (it may be a flattened scan).',
      outputs: [await resultFile(out)],
      extra: { preview: JSON.stringify(data, null, 2).slice(0, 2500), count: data.count }
    }
  }
  const valuesRaw = optStr(job.options, 'values', '{}')
  let values: unknown
  try {
    values = JSON.parse(valuesRaw)
  } catch {
    throw new Error('Field values must be JSON, e.g. {"Name":"Ada","Date":"2026-01-01"}')
  }
  const tmp = join(defaultTmp(), `form-${randomUUID()}.json`)
  await writeFile(tmp, JSON.stringify(values))
  const out = await uniquePath(join(destRoot, `${basename(f.name, extname(f.name))}-filled.pdf`))
  const args = [extractPy(), 'forms-fill', '--inp', f.path, '--out', out, '--values', tmp]
  if (mode === 'flatten' || truthy(job.options, 'flatten')) args.push('--flatten')
  try {
    await run(py(), args, { timeoutMs: 60_000 })
  } finally {
    await rmQuiet(tmp)
  }
  return {
    jobId: job.id,
    ok: true,
    message: mode === 'flatten' ? 'Filled and flattened' : 'Filled form fields',
    outputs: [await resultFile(out)]
  }
}

export async function runExtractImagesJob(job: JobRequest, destRoot: string, cb: Emit): Promise<JobResult> {
  const pdfimages = whichSync('pdfimages')
  if (!pdfimages) throw new Error('pdfimages is not installed. Linux: sudo apt install poppler-utils')
  const outputs: JobResult['outputs'] = []
  let i = 0
  for (const f of job.files) {
    i += 1
    cb({ jobId: job.id, percent: (i / job.files.length) * 90, message: `Extracting images from ${f.name}`, current: i, total: job.files.length })
    const folder = await uniquePath(join(destRoot, `${basename(f.name, extname(f.name))}-images`))
    await ensureDir(folder)
    const info = await import('./pdfinfo').then((m) => m.pdfInfo(f.path, optStr(job.options, 'password') || undefined))
    const pages = optStr(job.options, 'pages')
    const args = ['-all']
    if (pages && info.pages) {
      const list = parseRanges(pages, info.pages)
      if (list.length) {
        args.push('-f', String(Math.min(...list)), '-l', String(Math.max(...list)))
      }
    }
    args.push(f.path, join(folder, 'img'))
    await run(pdfimages, args, { timeoutMs: 10 * 60_000 })
    const files = (await readdir(folder)).filter((n) => !n.startsWith('.'))
    if (!files.length) throw new Error(`No embedded images in ${f.name}. Use PDF to JPG to rasterize pages instead.`)
    const zip = whichSync('zip')
    if (!zip) throw new Error('zip is not installed. Linux: sudo apt install zip')
    const zipPath = await uniquePath(join(destRoot, `${basename(f.name, extname(f.name))}-embedded-images.zip`))
    await run(zip, ['-r', '-q', zipPath, '.'], { cwd: folder })
    outputs.push(await resultFile(zipPath))
  }
  return {
    jobId: job.id,
    ok: true,
    message: `Saved embedded images for ${outputs.length} file(s)`,
    outputs
  }
}

