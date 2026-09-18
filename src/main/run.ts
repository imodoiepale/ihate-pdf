import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, stat, unlink } from 'node:fs/promises'
import { delimiter, dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { extraResourceBinDirs } from './resources'

export class CommandError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly stderr: string
  ) {
    super(message)
  }
}

function bundledBinDirs(): string[] {
  return extraResourceBinDirs()
}

export function extraPath(): string {
  return [...bundledBinDirs(), process.env.PATH || ''].join(delimiter)
}

export function whichSync(bin: string): string | null {
  const names =
    process.platform === 'win32' ? [bin, `${bin}.exe`, `${bin}.cmd`, `${bin}.bat`] : [bin]
  for (const dir of extraPath().split(delimiter)) {
    if (!dir) continue
    for (const name of names) {
      const p = join(dir, name)
      if (existsSync(p)) return p
    }
  }
  return null
}

/** python3 on Unix; python.exe / python3.exe on Windows. */
export function resolvePython(): string {
  return whichSync('python3') || whichSync('python') || (process.platform === 'win32' ? 'python' : 'python3')
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

export async function uniquePath(path: string): Promise<string> {
  const { existsSync } = await import('node:fs')
  if (!existsSync(path)) return path
  const { parse } = await import('node:path')
  const { dir, name, ext } = parse(path)
  let i = 1
  while (existsSync(join(dir, `${name} (${i})${ext}`))) i += 1
  return join(dir, `${name} (${i})${ext}`)
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i += 1
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`
}

export async function fileSize(path: string): Promise<number> {
  const s = await stat(path)
  return s.size
}

export async function copyFileStream(src: string, dest: string): Promise<void> {
  await ensureDir(dirname(dest))
  const { createReadStream } = await import('node:fs')
  await pipeline(createReadStream(src), createWriteStream(dest))
}

export async function writeStreamToFile(stream: NodeJS.ReadableStream, dest: string): Promise<number> {
  await ensureDir(dirname(dest))
  const ws = createWriteStream(dest)
  await pipeline(stream, ws)
  return (await stat(dest)).size
}

export async function rmQuiet(path: string): Promise<void> {
  try {
    await unlink(path)
  } catch {
    /* ignore */
  }
}

export interface RunOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
  input?: string
  onStdout?: (chunk: string) => void
  onStderr?: (chunk: string) => void
}

const children = new Set<ChildProcess>()

export function cancelAllChildren(): void {
  for (const c of children) {
    try {
      c.kill('SIGTERM')
    } catch {
      /* ignore */
    }
  }
}

export function run(cmd: string, args: string[], opts: RunOptions = {}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: { ...process.env, PATH: extraPath(), ...(opts.env || {}) },
      stdio: ['pipe', 'pipe', 'pipe']
    })
    children.add(child)
    let stdout = ''
    let stderr = ''
    let settled = false

    const finish = (err?: Error, out?: { stdout: string; stderr: string }) => {
      if (settled) return
      settled = true
      children.delete(child)
      if (timer) clearTimeout(timer)
      if (err) reject(err)
      else resolve(out!)
    }

    const timer =
      opts.timeoutMs && opts.timeoutMs > 0
        ? setTimeout(() => {
            child.kill('SIGKILL')
            finish(new CommandError(`${cmd} timed out`, null, stderr))
          }, opts.timeoutMs)
        : null

    child.stdout.on('data', (b: Buffer) => {
      const s = b.toString()
      if (stdout.length < 2_000_000) stdout += s
      opts.onStdout?.(s)
    })
    child.stderr.on('data', (b: Buffer) => {
      const s = b.toString()
      if (stderr.length < 2_000_000) stderr += s
      opts.onStderr?.(s)
    })
    child.on('error', (err) => finish(err))
    child.on('close', (code) => {
      if (code === 0) finish(undefined, { stdout, stderr })
      else {
        finish(
          new CommandError(
            `${cmd} ${args[0] ?? ''} failed (${code ?? 'exit'}): ${stderr.trim() || stdout.trim() || 'no output'}`,
            code,
            stderr
          )
        )
      }
    })
    if (opts.input) child.stdin.write(opts.input)
    child.stdin.end()
  })
}

export async function runOk(cmd: string, args: string[], opts: RunOptions = {}): Promise<string> {
  const { stdout } = await run(cmd, args, opts)
  return stdout
}

/** Split a large argv list so we stay under OS command-line limits. */
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export function parseRanges(input: string, pageCount: number): number[] {
  const pages = new Set<number>()
  const parts = input.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)
  for (const part of parts) {
    const m = part.match(/^(\d+)\s*-\s*(\d+)$/)
    if (m) {
      let a = Number(m[1])
      let b = Number(m[2])
      if (a > b) [a, b] = [b, a]
      for (let i = a; i <= b && i <= pageCount; i++) if (i >= 1) pages.add(i)
    } else if (/^\d+$/.test(part)) {
      const n = Number(part)
      if (n >= 1 && n <= pageCount) pages.add(n)
    } else {
      throw new Error(`Invalid page range: ${part}`)
    }
  }
  return [...pages]
}

export function parseOrder(input: string, pageCount: number): number[] {
  const out: number[] = []
  const parts = input.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)
  for (const part of parts) {
    const m = part.match(/^(\d+)\s*-\s*(\d+)$/)
    if (m) {
      const a = Number(m[1])
      const b = Number(m[2])
      const step = a <= b ? 1 : -1
      for (let i = a; step > 0 ? i <= b : i >= b; i += step) {
        if (i >= 1 && i <= pageCount) out.push(i)
      }
    } else if (/^\d+$/.test(part)) {
      const n = Number(part)
      if (n >= 1 && n <= pageCount) out.push(n)
    } else {
      throw new Error(`Invalid page order: ${part}`)
    }
  }
  return out
}

export { dirname, join }
