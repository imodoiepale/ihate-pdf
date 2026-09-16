import { run, whichSync } from './run'
import type { EngineStatus } from '@shared/types'

export interface PdfInfo {
  pages: number
  encrypted: boolean
  pageSize?: string
  title?: string
  widthPts?: number
  heightPts?: number
}

export function detectBinaries(): Record<string, string | null> {
  const names = [
    'qpdf',
    'gs',
    'pdftoppm',
    'pdfinfo',
    'pdftotext',
    'pdftocairo',
    'img2pdf',
    'soffice',
    'python3',
    'tesseract',
    'zip',
    'pdfimages'
  ]
  const out: Record<string, string | null> = {}
  for (const n of names) out[n] = whichSync(n)
  return out
}

export async function diskFree(dir: string): Promise<number> {
  try {
    const { stdout } = await run('df', ['-B1', '--output=avail', dir])
    const line = stdout.trim().split('\n').pop()
    return Number(line) || 0
  } catch {
    return 0
  }
}

export async function engineStatus(tmp: string, outputDir: string, concurrency: number): Promise<EngineStatus> {
  const binaries = detectBinaries()
  return {
    ok: Boolean(binaries.qpdf),
    binaries,
    tmp,
    outputDir,
    concurrency,
    diskFreeBytes: await diskFree(outputDir || tmp)
  }
}

export async function pdfInfo(file: string, password?: string): Promise<PdfInfo> {
  const pdfinfo = whichSync('pdfinfo')
  if (pdfinfo) {
    try {
      const args = password ? ['-upw', password, file] : [file]
      const { stdout } = await run(pdfinfo, args)
      return parsePdfinfo(stdout)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/Incorrect password|encrypted/i.test(msg)) {
        return { pages: 0, encrypted: true }
      }
    }
  }
  const qpdf = whichSync('qpdf')
  if (!qpdf) throw new Error('Neither pdfinfo nor qpdf is installed')
  const args = ['--show-npages']
  if (password) args.unshift(`--password=${password}`)
  const { stdout } = await run(qpdf, [...args, file])
  const pages = Number(stdout.trim()) || 0
  return { pages, encrypted: false }
}

function parsePdfinfo(text: string): PdfInfo {
  const get = (key: string) => {
    const line = text.split('\n').find((l) => l.toLowerCase().startsWith(key.toLowerCase() + ':'))
    return line ? line.slice(line.indexOf(':') + 1).trim() : ''
  }
  const pages = Number(get('Pages')) || 0
  const enc = get('Encrypted').toLowerCase()
  const pageSize = get('Page size')
  const m = pageSize.match(/([\d.]+)\s*x\s*([\d.]+)/)
  return {
    pages,
    encrypted: enc.startsWith('yes'),
    pageSize: pageSize || undefined,
    title: get('Title') || undefined,
    widthPts: m ? Number(m[1]) : undefined,
    heightPts: m ? Number(m[2]) : undefined
  }
}
