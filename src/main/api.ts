import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { createWriteStream, existsSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { EventEmitter } from 'node:events'
import type { LlmProviderId } from '@shared/preferences'
import { API_PORT, type EngineStatus, type FileRef, type JobRequest, type JobResult } from '@shared/types'
import { detectBinaries, engineStatus } from './pdfinfo'
import { defaultOutputDir, defaultTmp, inspectFile, makeFileRef, runJob } from './jobs'
import { askParsed, extractEngines, libraryCatalog } from './extract'
import { getElectron } from './optional-electron'
import { nativeOpenPath, nativePickDir, nativePickFiles, nativeReveal } from './host-native'
import {
  applyPreferencePatch,
  isMcpEnabled,
  loadPreferences,
  publicPreferences,
  type PreferencePatch
} from './preferences'
import { testProvider } from './llm'
import { handleMcpJsonRpc, isSafeIndexDir, MCP_TOOLS } from './mcp'
import { ensureDir, extraPath, formatBytes, refreshToolPath } from './run'
import { maybeEnsureVendorInBackground, runInstallPending, vendorInstallInFlight } from './install-tools'
import { userVendorBinDir, vendorPlatformKey } from './resources'

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

async function refsFromPaths(paths: string[]): Promise<FileRef[]> {
  const refs: FileRef[] = []
  for (const p of paths) {
    const st = statSync(p)
    const ref = makeFileRef(p, st.size)
    Object.assign(ref, await inspectFile(p))
    refs.push(ref)
  }
  return refs
}

async function pickFiles(multi: boolean, filters: { name: string; extensions: string[] }[]): Promise<FileRef[]> {
  const electron = getElectron()
  if (electron?.dialog) {
    const result = await electron.dialog.showOpenDialog({
      properties: multi ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: filters.length ? filters : [{ name: 'All files', extensions: ['*'] }]
    })
    if (result.canceled) return []
    return refsFromPaths(result.filePaths)
  }
  const exts = filters.flatMap((f) => f.extensions || [])
  const paths = await nativePickFiles(multi, exts)
  return refsFromPaths(paths)
}

export async function startApiServer(port = API_PORT): Promise<void> {
  refreshToolPath()
  process.env.PATH = extraPath()
  const prefs = await loadPreferences()
  if (prefs.outputDir) outputDir = prefs.outputDir
  if (prefs.concurrency) concurrency = prefs.concurrency
  await ensureDir(outputDir)
  maybeEnsureVendorInBackground()
  const server = createServer((req, res) => {
    void handle(req, res)
  })
  return new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => {
      console.log(`i hate pdf engine listening on http://127.0.0.1:${port}`)
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
      send(res, 200, { ok: true, product: 'i hate pdf' })
      return
    }
    if (req.method === 'GET' && url.pathname === '/api/settings') {
      await loadPreferences()
      send(res, 200, publicPreferences(outputDir, concurrency))
      return
    }
    if (req.method === 'GET' && url.pathname === '/api/status') {
      refreshToolPath()
      const status: EngineStatus = await engineStatus(defaultTmp(), outputDir, concurrency)
      const extract = await extractEngines()
      const prefs = publicPreferences(outputDir, concurrency)
      send(res, 200, {
        ...status,
        outputDir,
        formatFree: formatBytes(status.diskFreeBytes),
        extract,
        vendor: {
          bin: userVendorBinDir(),
          platform: vendorPlatformKey()
        },
        vendorInstall: { inFlight: vendorInstallInFlight() },
        llm: {
          defaultProvider: prefs.defaultProvider,
          configured: Object.values(prefs.providers)
            .filter((p) => p.hasKey)
            .map((p) => p.id),
          encryption: prefs.encryption
        }
      })
      return
    }
    if (req.method === 'GET' && url.pathname === '/api/bins') {
      refreshToolPath()
      send(res, 200, detectBinaries())
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/install-tools') {
      const body = await json<{ vendorOnly?: boolean; full?: boolean }>(req)
      const result = await runInstallPending({ vendorOnly: body.vendorOnly, full: body.full })
      send(res, result.ok ? 200 : 207, result)
      return
    }
    if (req.method === 'GET' && url.pathname === '/api/libraries') {
      send(res, 200, await libraryCatalog())
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/settings') {
      const body = await json<PreferencePatch>(req)
      const next = await applyPreferencePatch(body)
      if (next.outputDir) {
        outputDir = next.outputDir
        await ensureDir(outputDir)
      }
      if (next.concurrency) concurrency = next.concurrency
      send(res, 200, publicPreferences(outputDir, concurrency))
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/pick-dir') {
      const electron = getElectron()
      if (electron?.dialog) {
        const result = await electron.dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
        send(res, 200, { path: result.canceled ? null : result.filePaths[0] })
        return
      }
      send(res, 200, { path: await nativePickDir() })
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
    if (req.method === 'POST' && url.pathname === '/api/keys/test') {
      const body = await json<{ provider?: LlmProviderId }>(req)
      if (!body.provider) {
        send(res, 400, { error: 'provider is required' })
        return
      }
      send(res, 200, await testProvider(body.provider))
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/ask') {
      const body = await json<{ indexDir?: string; question?: string; useLlm?: boolean | string; provider?: string }>(req)
      if (!body.indexDir || !body.question) {
        send(res, 400, { error: 'indexDir and question are required' })
        return
      }
      if (!isSafeIndexDir(body.indexDir, outputDir)) {
        send(res, 400, { error: 'indexDir is not an i hate pdf output folder' })
        return
      }
      send(res, 200, await askParsed(body.indexDir, body.question, { useLlm: body.useLlm === true || body.useLlm === 'true', provider: body.provider }))
      return
    }
    if ((req.method === 'GET' || req.method === 'POST') && (url.pathname === '/mcp' || url.pathname === '/api/mcp')) {
      if (!isMcpEnabled()) {
        send(res, 404, { error: 'MCP is disabled. Enable it in i hate pdf Settings.' })
        return
      }
      if (req.method === 'GET') {
        send(res, 200, {
          name: 'ihate-pdf',
          protocol: 'json-rpc',
          tools: MCP_TOOLS,
          stdio: 'node mcp/ihate-pdf-mcp.mjs',
          url: 'http://127.0.0.1:43128/mcp'
        })
        return
      }
      const body = await json<{ method?: string; id?: unknown; params?: Record<string, unknown>; jsonrpc?: string }>(req)
      try {
        const result = await handleMcpJsonRpc(body, async (job) => {
          const full: JobRequest = {
            id: randomUUID(),
            tool: job.tool as JobRequest['tool'],
            files: job.files.map((f) => {
              const st = existsSync(f.path) ? statSync(f.path) : null
              return makeFileRef(f.path, st?.size || 0)
            }),
            options: job.options,
            outputDir: job.outputDir || outputDir
          }
          return enqueue(full)
        }, outputDir)
        if (result === null) {
          send(res, 200, { jsonrpc: '2.0', result: {} })
          return
        }
        send(res, 200, { jsonrpc: '2.0', id: body.id ?? null, result })
      } catch (e) {
        send(res, 200, {
          jsonrpc: '2.0',
          id: body.id ?? null,
          error: { code: -32000, message: e instanceof Error ? e.message : String(e) }
        })
      }
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/open') {
      const body = await json<{ path: string }>(req)
      if (body.path) {
        const electron = getElectron()
        if (electron?.shell) await electron.shell.openPath(body.path)
        else await nativeOpenPath(body.path)
      }
      send(res, 200, { ok: true })
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/reveal') {
      const body = await json<{ path: string }>(req)
      if (body.path) {
        const electron = getElectron()
        if (electron?.shell) electron.shell.showItemInFolder(body.path)
        else await nativeReveal(body.path)
      }
      send(res, 200, { ok: true })
      return
    }
    send(res, 404, { error: 'Not found' })
  } catch (e) {
    send(res, 500, { error: e instanceof Error ? e.message : String(e) })
  }
}

export { outputDir, formatBytes }
