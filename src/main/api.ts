import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { createWriteStream, existsSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { dialog, shell } from 'electron'
import { EventEmitter } from 'node:events'
import { API_PORT, type EngineStatus, type FileRef, type JobRequest, type JobResult } from '@shared/types'
import { detectBinaries, engineStatus } from './pdfinfo'
import { defaultOutputDir, defaultTmp, inspectFile, makeFileRef, runJob } from './jobs'
import { ensureDir, extraPath, formatBytes } from './run'

const bus = new EventEmitter()
bus.setMaxListeners(100)

let outputDir = defaultOutputDir()
let concurrency = 2
const queue: Array<{ job: JobRequest; resolve: (r: JobResult) => void; reject: (e: Error) => void }> = []
let active = 0

function cors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

async function json<T>(req: IncomingMessage): Promise<T> {
  const raw = await readBody(req)
  return raw ? (JSON.parse(raw) as T) : ({} as T)
}

function send(res: ServerResponse, code: number, data: unknown): void {
  cors(res)
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

function pumpQueue(): void {
  while (active < concurrency && queue.length) {
    const item = queue.shift()!
    active += 1
    runJob(item.job, (p) => bus.emit('progress:' + item.job.id, p))
      .then((r) => item.resolve(r))
      .catch((e: Error) => {
        const fail: JobResult = {
          jobId: item.job.id,
          ok: false,
          message: e.message,
          outputs: []
        }
        item.resolve(fail)
      })
      .finally(() => {
        active -= 1
        pumpQueue()
      })
  }
}

function enqueue(job: JobRequest): Promise<JobResult> {
  return new Promise((resolve, reject) => {
    queue.push({ job, resolve, reject })
    bus.emit('progress:' + job.id, {
      jobId: job.id,
      percent: 0,
      message: queue.length + active > 1 ? `Queued (${queue.length} waiting)` : 'Starting…'
    })
    pumpQueue()
  })
}

async function pickFiles(multi: boolean, filters: { name: string; extensions: string[] }[]): Promise<FileRef[]> {
  const result = await dialog.showOpenDialog({
    properties: multi ? ['openFile', 'multiSelections'] : ['openFile'],
    filters: filters.length ? filters : [{ name: 'All files', extensions: ['*'] }]
  })
  if (result.canceled) return []
  const refs: FileRef[] = []
  for (const p of result.filePaths) {
    const st = statSync(p)
    const ref = makeFileRef(p, st.size)
    Object.assign(ref, await inspectFile(p))
    refs.push(ref)
  }
  return refs
}

export function startApiServer(port = API_PORT): Promise<void> {
  process.env.PATH = extraPath()
  void ensureDir(outputDir)
  const server = createServer((req, res) => {
    void handle(req, res)
  })
  return new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => {
      console.log(`LovePDF engine listening on http://127.0.0.1:${port}`)
      resolve()
    })
    server.on('error', reject)
  })
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  cors(res)
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  const url = new URL(req.url || '/', 'http://127.0.0.1')
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') {
      send(res, 200, { ok: true })
      return
    }
    if (req.method === 'GET' && url.pathname === '/api/status') {
      const status: EngineStatus = await engineStatus(defaultTmp(), outputDir, concurrency)
      send(res, 200, { ...status, outputDir, formatFree: formatBytes(status.diskFreeBytes) })
      return
    }
    if (req.method === 'GET' && url.pathname === '/api/bins') {
      send(res, 200, detectBinaries())
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/settings') {
      const body = await json<{ outputDir?: string; concurrency?: number }>(req)
      if (body.outputDir) {
        outputDir = body.outputDir
        await ensureDir(outputDir)
      }
      if (body.concurrency) concurrency = Math.max(1, Math.min(4, Number(body.concurrency)))
      send(res, 200, { outputDir, concurrency })
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/pick-dir') {
      const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
      send(res, 200, { path: result.canceled ? null : result.filePaths[0] })
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/pick-files') {
      const body = await json<{ multi?: boolean; extensions?: string[] }>(req)
      const exts = (body.extensions || []).map((e) => e.replace(/^\./, ''))
      const files = await pickFiles(body.multi !== false, [
        exts.length ? { name: 'Supported', extensions: exts } : { name: 'All files', extensions: ['*'] }
      ])
      send(res, 200, { files })
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/pick-image') {
      const files = await pickFiles(false, [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }])
      send(res, 200, { file: files[0] || null })
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/add-paths') {
      const body = await json<{ paths: string[] }>(req)
      const files: FileRef[] = []
      for (const p of body.paths || []) {
        const trimmed = p.trim()
        if (!trimmed || !existsSync(trimmed)) continue
        const st = statSync(trimmed)
        if (!st.isFile()) continue
        const ref = makeFileRef(trimmed, st.size)
        Object.assign(ref, await inspectFile(trimmed))
        files.push(ref)
      }
      send(res, 200, { files })
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/info') {
      const body = await json<{ path: string; password?: string }>(req)
      send(res, 200, await inspectFile(body.path, body.password))
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/import') {
      const name = url.searchParams.get('name') || `upload-${Date.now()}`
      const dir = join(defaultTmp(), 'imports')
      await ensureDir(dir)
      const dest = join(dir, `${randomUUID()}-${basename(name)}`)
      await pipeline(req, createWriteStream(dest))
      const st = statSync(dest)
      const ref = makeFileRef(dest, st.size)
      Object.assign(ref, await inspectFile(dest))
      send(res, 200, { file: ref })
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/jobs') {
      const body = await json<Partial<JobRequest>>(req)
      const job: JobRequest = {
        id: body.id || randomUUID(),
        tool: body.tool as JobRequest['tool'],
        files: body.files || [],
        options: body.options || {},
        outputDir: body.outputDir || outputDir
      }
      if (!job.tool) {
        send(res, 400, { error: 'Missing tool' })
        return
      }
      const result = await enqueue(job)
      send(res, 200, result)
      return
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/jobs/') && url.pathname.endsWith('/events')) {
      const id = url.pathname.split('/')[3]
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      })
      const onProg = (p: unknown) => {
        res.write(`data: ${JSON.stringify(p)}\n\n`)
      }
      bus.on('progress:' + id, onProg)
      req.on('close', () => bus.off('progress:' + id, onProg))
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/open') {
      const body = await json<{ path: string }>(req)
      if (body.path) await shell.openPath(body.path)
      send(res, 200, { ok: true })
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/reveal') {
      const body = await json<{ path: string }>(req)
      if (body.path) shell.showItemInFolder(body.path)
      send(res, 200, { ok: true })
      return
    }
    send(res, 404, { error: 'Not found' })
  } catch (e) {
    send(res, 500, { error: e instanceof Error ? e.message : String(e) })
  }
}

export { outputDir, formatBytes }
