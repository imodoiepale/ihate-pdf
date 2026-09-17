import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import type { FileRef, JobProgress, JobRequest, JobResult } from '@shared/types'
import { chunk, copyFileStream, ensureDir, parseOrder, parseRanges, resolvePython, rmQuiet, run, uniquePath, whichSync } from './run'
import { pdfInfo } from './pdfinfo'
import { defaultOutputDir, defaultTmp } from './paths'
import {
  runAskIndexJob,
  runExtractImagesJob,
  runFormsJob,
  runParseJob,
  runStructuredExtract,
  runSummarizeJob,
  runTranslateJob
} from './extract'

export { defaultOutputDir, defaultTmp }

export type Emit = (p: JobProgress) => void

/* defaultOutputDir / defaultTmp live in ./paths */

function workerPy(): string {
  const packed = join(process.resourcesPath || '', 'worker.py')
  if (existsSync(packed)) return packed
  return join(process.cwd(), 'resources/worker.py')
}

function py(): string {
  return resolvePython()
}

function qpdf(): string {
  const b = whichSync('qpdf')
  if (!b) {
    throw new Error(
      'qpdf is not installed — it is not bundled inside this app. Run scripts/install-deps.sh or scripts/install-deps.ps1 (Windows: winget install QPDF.QPDF).'
    )
  }
  return b
}

function img2pdfBin(): { cmd: string; prefix: string[] } {
  const bin = whichSync('img2pdf')
  if (bin) return { cmd: bin, prefix: [] }
  const python = whichSync('python3')
  if (python) return { cmd: python, prefix: ['-m', 'img2pdf'] }
  throw new Error('img2pdf is not installed. pip install img2pdf or sudo apt install python3-img2pdf')
}

function must(bin: string, hint: string): string {
  const b = whichSync(bin)
  if (!b) throw new Error(`${bin} is not installed. ${hint}`)
  return b
}

async function outDirFor(job: JobRequest): Promise<string> {
  const dir = job.outputDir || defaultOutputDir()
  await ensureDir(dir)
  return dir
}

async function jobTmp(): Promise<string> {
  await ensureDir(defaultTmp())
  return mkdtemp(join(defaultTmp(), 'job-'))
}

function emit(cb: Emit, jobId: string, percent: number, message: string, current?: number, total?: number) {
  cb({ jobId, percent: Math.max(0, Math.min(100, percent)), message, current, total })
}

function optStr(opts: JobRequest['options'], key: string, fallback = ''): string {
  const v = opts[key]
  if (v === undefined || v === null) return fallback
  return String(v)
}

function optNum(opts: JobRequest['options'], key: string, fallback: number): number {
  const v = opts[key]
  if (v === undefined || v === null || v === '') return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

async function namedOut(dir: string, name: string): Promise<string> {
  return uniquePath(join(dir, name))
}

function pdfArgs(password?: string): string[] {
  return password ? [`--password=${password}`] : []
}

async function overlay(input: string, stamp: string, output: string, password?: string): Promise<void> {
  await run(qpdf(), [
    ...pdfArgs(password),
    input,
    '--overlay',
    stamp,
    '--repeat=1',
    '--',
    output
  ])
}

async function overlayPages(input: string, stamp: string, output: string, password?: string): Promise<void> {
  await run(qpdf(), [...pdfArgs(password), input, '--overlay', stamp, '--', output])
}

async function pageDims(file: string, password?: string): Promise<{ w: number; h: number; pages: number }> {
  const info = await pdfInfo(file, password)
  return {
    w: info.widthPts || 612,
    h: info.heightPts || 792,
    pages: info.pages
  }
}

async function mergePdfs(paths: string[], output: string, password: string | undefined, onChunk: (i: number, n: number) => void): Promise<void> {
  if (paths.length === 1) {
    await copyFileStream(paths[0], output)
    return
  }
  const tmp = await jobTmp()
  try {
    const groups = chunk(paths, 30)
    let current: string | null = null
    let gi = 0
    for (const group of groups) {
      gi += 1
      onChunk(gi, groups.length)
      const next: string =
        gi === groups.length && current === null && groups.length === 1 ? output : join(tmp, `m-${gi}.pdf`)
      const pages: string[] = []
      if (current) pages.push(current, '1-z')
      for (const p of group) pages.push(p, '1-z')
      await run(qpdf(), [...pdfArgs(password), '--empty', '--pages', ...pages, '--', next])
      if (current && current.startsWith(tmp)) await rmQuiet(current)
      current = next
    }
    if (current !== output) {
      await copyFileStream(current!, output)
    }
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}

async function sofficeConvert(input: string, outDir: string, format: string): Promise<string> {
  const soffice = must('soffice', 'Install LibreOffice for office conversions.')
  const profile = join(defaultTmp(), `lo-${randomUUID()}`)
  await ensureDir(profile)
  await ensureDir(outDir)
  try {
    await run(soffice, [
      '--headless',
      '--norestore',
      '--nolockcheck',
            `-env:UserInstallation=file://${profile}`,
      '--convert-to',
      format,
      '--outdir',
      outDir,
      input
    ])
    const base = basename(input, extname(input))
    const files = await readdir(outDir)
    const hit = files.find((f) => f.startsWith(base) && f.toLowerCase().endsWith('.' + format.split(':')[0].toLowerCase()))
    if (!hit) {
      const any = files.find((f) => f.toLowerCase().endsWith('.' + format.split(':')[0].toLowerCase()))
      if (!any) throw new Error(`LibreOffice did not produce a .${format} for ${basename(input)}`)
      return join(outDir, any)
    }
    return join(outDir, hit)
  } finally {
    await rm(profile, { recursive: true, force: true })
  }
}

async function imagesToPdf(files: FileRef[], output: string, options: JobRequest['options']): Promise<void> {
  const { cmd, prefix } = img2pdfBin()
  const pageSize = optStr(options, 'pageSize', 'fit')
  const margin = optStr(options, 'margin', 'none')
  const orientation = optStr(options, 'orientation', 'auto')
  const args: string[] = ['-o', output]
  const sizes: Record<string, { portrait: string; landscape: string }> = {
    A4: { portrait: 'A4', landscape: '297mmx210mm' },
    Letter: { portrait: 'Letter', landscape: '279mmx216mm' },
    Legal: { portrait: 'Legal', landscape: '356mmx216mm' }
  }
  if (pageSize !== 'fit' && sizes[pageSize]) {
    const spec = orientation === 'landscape' ? sizes[pageSize].landscape : sizes[pageSize].portrait
    args.push('--pagesize', spec)
    if (orientation === 'auto') args.push('--auto-orient')
  } else if (orientation === 'auto') {
    args.push('--auto-orient')
  }
  let border = ''
  if (margin === 'small') border = '10mm'
  else if (margin === 'big') border = '25mm'
  else if (margin === 'custom') {
    const t = optNum(options, 'mTop', 10)
    const b = optNum(options, 'mBottom', 10)
    const r = optNum(options, 'mRight', 10)
    const l = optNum(options, 'mLeft', 10)
    border = `${Math.max(t, b)}mm:${Math.max(l, r)}mm`
  }
  if (border) args.push('--border', border)
  if (files.length > 40) {
    const list = join(defaultTmp(), `imglist-${randomUUID()}.txt`)
    await writeFile(list, files.map((f) => f.path).join('\0'))
    args.push('--from-file', list)
    await run(cmd, [...prefix, ...args])
    await rmQuiet(list)
    return
  }
  args.push(...files.map((f) => f.path))
  await run(cmd, [...prefix, ...args])
}

async function stampTextOn(input: string, output: string, options: JobRequest['options'], password?: string): Promise<void> {
  const dims = await pageDims(input, password)
  const stamp = join(defaultTmp(), `stamp-${randomUUID()}.pdf`)
  await ensureDir(defaultTmp())
  await run(py(), [
    workerPy(),
    'stamp-text',
    '--out',
    stamp,
    '--text',
    optStr(options, 'text', 'WATERMARK'),
    '--width',
    String(dims.w),
    '--height',
    String(dims.h),
    '--font-size',
    String(optNum(options, 'fontSize', 48)),
    '--opacity',
    String(optNum(options, 'opacity', 25) / 100),
    '--rotation',
    optStr(options, 'rotation', 'diagonal'),
    '--position',
    optStr(options, 'position', 'center'),
    '--margin-mm',
    String(optNum(options, 'marginMm', 12))
  ])
  try {
    await overlay(input, stamp, output, password)
  } finally {
    await rmQuiet(stamp)
  }
}

async function addPageNumbers(input: string, output: string, options: JobRequest['options'], password: string | undefined, jobId: string, cb: Emit): Promise<void> {
  const dims = await pageDims(input, password)
  const n = dims.pages
  if (!n) throw new Error('Could not read page count')
  const start = optNum(options, 'start', 1)
  const tmp = await jobTmp()
  const chunkSize = 80
  const parts: string[] = []
  try {
    for (let i = 0; i < n; i += chunkSize) {
      const count = Math.min(chunkSize, n - i)
      emit(cb, jobId, 10 + (i / n) * 80, `Numbering pages ${i + 1}–${i + count} of ${n}`, i + count, n)
      const slice = join(tmp, `slice-${i}.pdf`)
      const stamp = join(tmp, `num-${i}.pdf`)
      const numbered = join(tmp, `out-${i}.pdf`)
      const from = i + 1
      const to = i + count
      await run(qpdf(), [...pdfArgs(password), input, '--pages', '.', `${from}-${to}`, '--', slice])
      await run(py(), [
        workerPy(),
        'stamp-pages',
        '--out',
        stamp,
        '--width',
        String(dims.w),
        '--height',
        String(dims.h),
        '--start',
        String(start + i),
        '--count',
        String(count),
        '--total',
        String(n),
        '--format',
        optStr(options, 'format', 'n'),
        '--position',
        optStr(options, 'position', 'bottom-center'),
        '--font-size',
        '11',
        '--margin-mm',
        String(optNum(options, 'marginMm', 12))
      ])
      await overlayPages(slice, stamp, numbered, password)
      parts.push(numbered)
    }
    emit(cb, jobId, 92, 'Joining numbered chunks…')
    await mergePdfs(parts, output, undefined, () => undefined)
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}

async function compressOne(input: string, output: string, level: string, password?: string): Promise<void> {
  if (level === 'extreme') {
    const gs = must('gs', 'Install ghostscript for extreme compression.')
    await run(gs, [
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.4',
      '-dPDFSETTINGS=/screen',
      '-dNOPAUSE',
      '-dQUIET',
      '-dBATCH',
      `-sOutputFile=${output}`,
      input
    ])
    return
  }
  if (level === 'less') {
    const gs = whichSync('gs')
    if (gs) {
      await run(gs, [
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.7',
        '-dPDFSETTINGS=/printer',
        '-dNOPAUSE',
        '-dQUIET',
        '-dBATCH',
        `-sOutputFile=${output}`,
        input
      ])
      return
    }
  }
  await run(qpdf(), [
    ...pdfArgs(password),
    '--object-streams=generate',
    '--compression-level=9',
    '--recompress-flate',
    '--optimize-images',
    input,
    output
  ])
}

async function pdfToImages(input: string, destDir: string, options: JobRequest['options'], password: string | undefined): Promise<string[]> {
  const pdftoppm = must('pdftoppm', 'Install poppler-utils.')
  await ensureDir(destDir)
  const fmt = optStr(options, 'format', 'jpg') === 'png' ? 'png' : 'jpeg'
  const dpi = optNum(options, 'dpi', 150)
  const info = await pdfInfo(input, password)
  let first = 1
  let last = info.pages || 1
  const pages = optStr(options, 'pages')
  if (pages) {
    const list = parseRanges(pages, info.pages || 1)
    if (!list.length) throw new Error('No valid pages in range')
    first = Math.min(...list)
    last = Math.max(...list)
  }
  const prefix = join(destDir, 'page')
  const args = [`-r`, String(dpi), '-f', String(first), '-l', String(last)]
  if (password) args.unshift('-upw', password)
  if (fmt === 'png') args.push('-png')
  else args.push('-jpeg', '-jpegopt', 'quality=85')
  args.push(input, prefix)
  await run(pdftoppm, args)
  const files = (await readdir(destDir))
    .filter((f) => f.startsWith('page'))
    .sort()
    .map((f) => join(destDir, f))
  return files
}

async function ocrPdf(input: string, output: string, options: JobRequest['options'], password: string | undefined, jobId: string, cb: Emit): Promise<void> {
  const tesseract = must('tesseract', 'Install tesseract-ocr.')
  const pdftoppm = must('pdftoppm', 'Install poppler-utils.')
  const info = await pdfInfo(input, password)
  let pages = Array.from({ length: info.pages }, (_, i) => i + 1)
  const range = optStr(options, 'pages')
  if (range) pages = parseRanges(range, info.pages)
  if (!pages.length) throw new Error('No pages to OCR')
  const lang = optStr(options, 'lang', 'eng') || 'eng'
  const tmp = await jobTmp()
  const parts: string[] = []
  try {
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i]
      emit(cb, jobId, (i / pages.length) * 90, `OCR page ${p} (${i + 1}/${pages.length})`, i + 1, pages.length)
      const prefix = join(tmp, `p${p}`)
      const args = ['-f', String(p), '-l', String(p), '-r', '300', '-png']
      if (password) args.unshift('-upw', password)
      await run(pdftoppm, [...args, input, prefix])
      const img = `${prefix}-1.png`
      const pdfPage = join(tmp, `ocr-${p}`)
      await run(tesseract, [img, pdfPage, '-l', lang, 'pdf'])
      parts.push(pdfPage + '.pdf')
    }
    emit(cb, jobId, 92, 'Merging OCR pages…')
    await mergePdfs(parts, output, undefined, () => undefined)
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}

async function zipFolder(dir: string, zipPath: string): Promise<void> {
  const zip = must('zip', 'Install zip.')
  await run(zip, ['-r', '-q', zipPath, '.'], { cwd: dir })
}

async function htmlToPdf(job: JobRequest, output: string): Promise<void> {
  const url = optStr(job.options, 'url')
  if (url) {
    const { BrowserWindow } = await import('electron')
    const win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 1600,
      webPreferences: { sandbox: false, offscreen: true }
    })
    try {
      await win.loadURL(url)
      const data = await win.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true
      })
      await writeFile(output, data)
    } finally {
      win.destroy()
    }
    return
  }
  if (!job.files.length) throw new Error('Select an HTML file or paste a URL')
  const converted = await sofficeConvert(job.files[0].path, join(defaultTmp(), randomUUID()), 'pdf')
  await copyFileStream(converted, output)
}

function resultFile(path: string): Promise<{ path: string; name: string; size: number }> {
  return stat(path).then((s) => ({ path, name: basename(path), size: s.size }))
}

export async function inspectFile(path: string, password?: string): Promise<Partial<FileRef>> {
  const ext = extname(path).toLowerCase()
  const extra: Partial<FileRef> = { ext }
  if (ext === '.pdf') {
    try {
      const info = await pdfInfo(path, password)
      extra.pages = info.pages
      extra.pageSize = info.pageSize
      extra.encrypted = info.encrypted
    } catch (e) {
      extra.error = e instanceof Error ? e.message : String(e)
    }
  }
  return extra
}

export async function runJob(job: JobRequest, cb: Emit): Promise<JobResult> {
  const password = optStr(job.options, 'password') || undefined
  const destRoot = await outDirFor(job)
  emit(cb, job.id, 2, 'Preparing…')
  const outputs: JobResult['outputs'] = []

  const tool = job.tool
  const files = job.files
  if (tool !== 'html-to-pdf' && files.length === 0) {
    throw new Error('Select at least one file')
  }

  switch (tool) {
    case 'merge': {
      if (files.length < 2) throw new Error('Please select more PDF files to merge')
      const out = await namedOut(destRoot, 'merged.pdf')
      await mergePdfs(
        files.map((f) => f.path),
        out,
        password,
        (i, n) => emit(cb, job.id, 10 + (i / n) * 80, `Merging batch ${i} of ${n}`, i, n)
      )
      outputs.push(await resultFile(out))
      break
    }
    case 'split': {
      const file = files[0]
      const info = await pdfInfo(file.path, password)
      const mode = optStr(job.options, 'mode', 'range')
      const folder = await namedOut(destRoot, `${basename(file.name, '.pdf')}-split`)
      await ensureDir(folder)
      if (mode === 'extract') {
        emit(cb, job.id, 20, `Extracting ${info.pages} pages to disk…`)
        await run(qpdf(), [
          ...pdfArgs(password),
          `--split-pages=1`,
          file.path,
          join(folder, 'page-%d.pdf')
        ])
        const zipPath = await namedOut(destRoot, `${basename(file.name, '.pdf')}-pages.zip`)
        emit(cb, job.id, 80, 'Zipping extracted pages…')
        await zipFolder(folder, zipPath)
        outputs.push(await resultFile(zipPath))
      } else if (mode === 'fixed') {
        const every = optNum(job.options, 'every', 2)
        emit(cb, job.id, 20, `Splitting every ${every} pages…`)
        await run(qpdf(), [
          ...pdfArgs(password),
          `--split-pages=${every}`,
          file.path,
          join(folder, 'part-%d.pdf')
        ])
        const zipPath = await namedOut(destRoot, `${basename(file.name, '.pdf')}-parts.zip`)
        await zipFolder(folder, zipPath)
        outputs.push(await resultFile(zipPath))
      } else {
        const ranges = optStr(job.options, 'ranges', '1')
        const parts = ranges.split(',').map((s) => s.trim()).filter(Boolean)
        if (!parts.length) throw new Error('Enter at least one range, e.g. 1-3, 5')
        let i = 0
        for (const part of parts) {
          i += 1
          emit(cb, job.id, (i / parts.length) * 90, `Writing range ${part}`, i, parts.length)
          const out = await namedOut(folder, `${basename(file.name, '.pdf')}_${part.replace(/\s+/g, '')}.pdf`)
          await run(qpdf(), [...pdfArgs(password), file.path, '--pages', '.', part, '--', out])
          outputs.push(await resultFile(out))
        }
      }
      break
    }
    case 'compress': {
      const level = optStr(job.options, 'level', 'recommended')
      let i = 0
      for (const f of files) {
        i += 1
        emit(cb, job.id, (i / files.length) * 90, `Compressing ${f.name}`, i, files.length)
        const out = await namedOut(destRoot, `${basename(f.name, extname(f.name))}-compressed.pdf`)
        try {
          await compressOne(f.path, out, level, password)
        } catch {
          if (level !== 'recommended') await compressOne(f.path, out, 'recommended', password)
          else throw new Error(`Could not compress ${f.name}`)
        }
        outputs.push(await resultFile(out))
      }
      break
    }
    case 'rotate': {
      const angle = optStr(job.options, 'angle', '90')
      let i = 0
      for (const f of files) {
        i += 1
        emit(cb, job.id, (i / files.length) * 90, `Rotating ${f.name}`, i, files.length)
        const out = await namedOut(destRoot, `${basename(f.name, extname(f.name))}-rotated.pdf`)
        await run(qpdf(), [...pdfArgs(password), f.path, `--rotate=+${angle}:1-z`, '--', out])
        outputs.push(await resultFile(out))
      }
      break
    }
    case 'unlock': {
      let i = 0
      for (const f of files) {
        i += 1
        emit(cb, job.id, (i / files.length) * 90, `Unlocking ${f.name}`, i, files.length)
        const out = await namedOut(destRoot, `${basename(f.name, extname(f.name))}-unlocked.pdf`)
        await run(qpdf(), [...pdfArgs(password), '--decrypt', f.path, out])
        outputs.push(await resultFile(out))
      }
      break
    }
    case 'protect': {
      const pw = optStr(job.options, 'password')
      const pw2 = optStr(job.options, 'password2')
      if (!pw) throw new Error('Enter a password')
      if (pw2 && pw !== pw2) throw new Error('Passwords do not match')
      let i = 0
      for (const f of files) {
        i += 1
        emit(cb, job.id, (i / files.length) * 90, `Encrypting ${f.name}`, i, files.length)
        const out = await namedOut(destRoot, `${basename(f.name, extname(f.name))}-protected.pdf`)
        await run(qpdf(), ['--encrypt', pw, pw, '256', '--', f.path, out])
        outputs.push(await resultFile(out))
      }
      break
    }
    case 'organize': {
      const file = files[0]
      const info = await pdfInfo(file.path, password)
      const orderRaw = optStr(job.options, 'order')
      const extra = files.slice(1)
      const out = await namedOut(destRoot, `${basename(file.name, extname(file.name))}-organized.pdf`)
      const pageArgs: string[] = []
      if (orderRaw) {
        const order = parseOrder(orderRaw, info.pages)
        if (!order.length) throw new Error('No valid pages in order')
        pageArgs.push(file.path, order.join(','))
      } else {
        pageArgs.push(file.path, '1-z')
      }
      for (const f of extra) pageArgs.push(f.path, '1-z')
      emit(cb, job.id, 40, 'Writing page order…')
      await run(qpdf(), [...pdfArgs(password), '--empty', '--pages', ...pageArgs, '--', out])
      outputs.push(await resultFile(out))
      break
    }
    case 'repair': {
      let i = 0
      for (const f of files) {
        i += 1
        emit(cb, job.id, (i / files.length) * 90, `Repairing ${f.name}`, i, files.length)
        const out = await namedOut(destRoot, `${basename(f.name, extname(f.name))}-repaired.pdf`)
        try {
          await run(qpdf(), [...pdfArgs(password), '--warning-exit-0', '--normalize-content=y', f.path, out])
        } catch {
          const gs = must('gs', 'Install ghostscript to repair this file.')
          await run(gs, ['-o', out, '-sDEVICE=pdfwrite', '-dPDFSETTINGS=/prepress', f.path])
        }
        outputs.push(await resultFile(out))
      }
      break
    }
    case 'crop': {
      let i = 0
      for (const f of files) {
        i += 1
        emit(cb, job.id, (i / files.length) * 90, `Cropping ${f.name}`, i, files.length)
        const out = await namedOut(destRoot, `${basename(f.name, extname(f.name))}-cropped.pdf`)
        await run(py(), [
          workerPy(),
          'crop',
          '--inp',
          f.path,
          '--out',
          out,
          '--top',
          String(optNum(job.options, 'cTop', 0)),
          '--right',
          String(optNum(job.options, 'cRight', 0)),
          '--bottom',
          String(optNum(job.options, 'cBottom', 0)),
          '--left',
          String(optNum(job.options, 'cLeft', 0))
        ])
        outputs.push(await resultFile(out))
      }
      break
    }
    case 'watermark':
    case 'edit-pdf': {
      let i = 0
      for (const f of files) {
        i += 1
        emit(cb, job.id, (i / files.length) * 90, `Stamping ${f.name}`, i, files.length)
        const suffix = tool === 'edit-pdf' ? 'edited' : 'watermarked'
        const out = await namedOut(destRoot, `${basename(f.name, extname(f.name))}-${suffix}.pdf`)
        const opts = { ...job.options }
        if (tool === 'edit-pdf') {
          opts.rotation = '0'
          opts.opacity = 100
          opts.fontSize = optNum(opts, 'fontSize', 16)
        }
        await stampTextOn(f.path, out, opts, password)
        outputs.push(await resultFile(out))
      }
      break
    }
    case 'page-numbers': {
      const f = files[0]
      const out = await namedOut(destRoot, `${basename(f.name, extname(f.name))}-numbered.pdf`)
      await addPageNumbers(f.path, out, job.options, password, job.id, cb)
      outputs.push(await resultFile(out))
      break
    }
    case 'sign-pdf': {
      const sig = optStr(job.options, 'signature')
      if (!sig) throw new Error('Choose a signature image')
      let i = 0
      for (const f of files) {
        i += 1
        emit(cb, job.id, (i / files.length) * 90, `Signing ${f.name}`, i, files.length)
        const dims = await pageDims(f.path, password)
        const stamp = join(defaultTmp(), `sig-${randomUUID()}.pdf`)
        await run(py(), [
          workerPy(),
          'image-stamp',
          '--out',
          stamp,
          '--image',
          sig,
          '--width',
          String(dims.w),
          '--height',
          String(dims.h),
          '--position',
          optStr(job.options, 'position', 'bottom-right'),
          '--scale',
          '0.35'
        ])
        const out = await namedOut(destRoot, `${basename(f.name, extname(f.name))}-signed.pdf`)
        try {
          await overlay(f.path, stamp, out, password)
        } finally {
          await rmQuiet(stamp)
        }
        outputs.push(await resultFile(out))
      }
      break
    }
    case 'jpg-to-pdf':
    case 'scan-to-pdf': {
      const name = tool === 'scan-to-pdf' ? 'scan.pdf' : 'images.pdf'
      const out = await namedOut(destRoot, name)
      emit(cb, job.id, 30, 'Wrapping images (lossless, on disk)…')
      const opts = { ...job.options }
      if (tool === 'scan-to-pdf' && !opts.pageSize) opts.pageSize = 'A4'
      if (tool === 'scan-to-pdf' && !opts.margin) opts.margin = 'small'
      await imagesToPdf(files, out, opts)
      outputs.push(await resultFile(out))
      break
    }
    case 'pdf-to-jpg': {
      let i = 0
      for (const f of files) {
        i += 1
        emit(cb, job.id, (i / files.length) * 80, `Rendering ${f.name}`, i, files.length)
        const folder = await namedOut(destRoot, `${basename(f.name, extname(f.name))}-images`)
        const imgs = await pdfToImages(f.path, folder, job.options, password)
        const zipPath = await namedOut(destRoot, `${basename(f.name, extname(f.name))}-images.zip`)
        await zipFolder(folder, zipPath)
        outputs.push(await resultFile(zipPath))
        for (const img of imgs.slice(0, 3)) outputs.push(await resultFile(img))
      }
      break
    }
    case 'word-to-pdf':
    case 'ppt-to-pdf':
    case 'excel-to-pdf': {
      let i = 0
      for (const f of files) {
        i += 1
        emit(cb, job.id, (i / files.length) * 90, `Converting ${f.name}`, i, files.length)
        const converted = await sofficeConvert(f.path, destRoot, 'pdf')
        outputs.push(await resultFile(converted))
      }
      break
    }
    case 'pdf-to-word': {
      const format = optStr(job.options, 'format', 'docx')
      let i = 0
      for (const f of files) {
        i += 1
        emit(cb, job.id, (i / files.length) * 90, `Converting ${f.name}`, i, files.length)
        try {
          const converted = await sofficeConvert(f.path, destRoot, format)
          outputs.push(await resultFile(converted))
        } catch {
          const txt = await namedOut(destRoot, `${basename(f.name, '.pdf')}.txt`)
          await run(must('pdftotext', 'Install poppler-utils.'), ['-layout', f.path, txt])
          outputs.push(await resultFile(txt))
        }
      }
      break
    }
    case 'pdf-to-ppt': {
      let i = 0
      for (const f of files) {
        i += 1
        emit(cb, job.id, (i / files.length) * 90, `Converting ${f.name}`, i, files.length)
        const converted = await sofficeConvert(f.path, destRoot, 'pptx')
        outputs.push(await resultFile(converted))
      }
      break
    }
    case 'pdf-to-excel': {
      let i = 0
      for (const f of files) {
        i += 1
        emit(cb, job.id, (i / files.length) * 90, `Converting ${f.name}`, i, files.length)
        try {
          const converted = await sofficeConvert(f.path, destRoot, 'xlsx')
          outputs.push(await resultFile(converted))
        } catch {
          const txt = join(defaultTmp(), `${randomUUID()}.txt`)
          await run(must('pdftotext', 'Install poppler-utils.'), ['-layout', f.path, txt])
          const csv = await namedOut(destRoot, `${basename(f.name, '.pdf')}.csv`)
          const text = await readFile(txt, 'utf8')
          const rows = text
            .split('\n')
            .map((line) =>
              line
                .trimEnd()
                .split(/\s{2,}/)
                .map((c) => `"${c.replace(/"/g, '""')}"`)
                .join(',')
            )
          await writeFile(csv, rows.join('\n'))
          outputs.push(await resultFile(csv))
        }
      }
      break
    }
    case 'pdf-to-pdfa': {
      const gs = must('gs', 'Install ghostscript for PDF/A.')
      let i = 0
      for (const f of files) {
        i += 1
        emit(cb, job.id, (i / files.length) * 90, `Archiving ${f.name}`, i, files.length)
        const out = await namedOut(destRoot, `${basename(f.name, extname(f.name))}-pdfa.pdf`)
        await run(gs, [
          '-dPDFA=1',
          '-dBATCH',
          '-dNOPAUSE',
          '-dNOOUTERSAVE',
          '-sColorConversionStrategy=RGB',
          '-sDEVICE=pdfwrite',
          '-dPDFACompatibilityPolicy=1',
          `-sOutputFile=${out}`,
          f.path
        ])
        outputs.push(await resultFile(out))
      }
      break
    }
    case 'html-to-pdf': {
      emit(cb, job.id, 20, 'Rendering HTML…')
      const out = await namedOut(destRoot, 'page.pdf')
      await htmlToPdf(job, out)
      outputs.push(await resultFile(out))
      break
    }
    case 'ocr': {
      const f = files[0]
      const out = await namedOut(destRoot, `${basename(f.name, extname(f.name))}-ocr.pdf`)
      await ocrPdf(f.path, out, job.options, password, job.id, cb)
      outputs.push(await resultFile(out))
      break
    }
    case 'compare': {
      if (files.length !== 2) throw new Error('Pick exactly two PDFs')
      const pdftotext = must('pdftotext', 'Install poppler-utils.')
      emit(cb, job.id, 20, 'Extracting text…')
      const a = join(defaultTmp(), `${randomUUID()}.txt`)
      const b = join(defaultTmp(), `${randomUUID()}.txt`)
      await run(pdftotext, ['-layout', files[0].path, a])
      await run(pdftotext, ['-layout', files[1].path, b])
      const ta = await readFile(a, 'utf8')
      const tb = await readFile(b, 'utf8')
      const la = ta.split('\n')
      const lb = tb.split('\n')
      const max = Math.max(la.length, lb.length)
      const rows: string[] = []
      let diffs = 0
      for (let i = 0; i < max; i++) {
        const x = la[i] ?? ''
        const y = lb[i] ?? ''
        const changed = x !== y
        if (changed) diffs += 1
        rows.push(
          `<tr class="${changed ? 'diff' : ''}"><td>${i + 1}</td><td>${esc(x)}</td><td>${esc(y)}</td></tr>`
        )
      }
      const html = `<!doctype html><meta charset="utf-8"><title>Compare</title>
<style>body{font:14px/1.4 ui-sans-serif,system-ui} table{border-collapse:collapse;width:100%} td{vertical-align:top;padding:4px 8px;border-bottom:1px solid #eee;width:47%} td:first-child{width:6%;color:#888} .diff td{background:#fff2f2}</style>
<h1>Compare PDF</h1><p>${diffs} differing lines of ${max}.</p>
<table><thead><tr><th>#</th><th>${esc(files[0].name)}</th><th>${esc(files[1].name)}</th></tr></thead><tbody>${rows.join('')}</tbody></table>`
      const out = await namedOut(destRoot, 'compare.html')
      await writeFile(out, html)
      outputs.push(await resultFile(out))
      break
    }
    case 'redact': {
      const f = files[0]
      const info = await pdfInfo(f.path, password)
      const pages = parseRanges(optStr(job.options, 'pages', '1'), info.pages)
      if (!pages.length) throw new Error('Enter pages to redact')
      const mode = optStr(job.options, 'mode', 'blank')
      const out = await namedOut(destRoot, `${basename(f.name, extname(f.name))}-redacted.pdf`)
      if (mode === 'remove') {
        const keep = []
        for (let i = 1; i <= info.pages; i++) if (!pages.includes(i)) keep.push(i)
        if (!keep.length) throw new Error('That would delete every page')
        await run(qpdf(), [...pdfArgs(password), '--empty', '--pages', f.path, keep.join(','), '--', out])
      } else if (mode === 'flatten') {
        const tmp = await jobTmp()
        const rebuilt: string[] = []
        try {
          for (let i = 1; i <= info.pages; i++) {
            emit(cb, job.id, (i / info.pages) * 90, `Page ${i}`, i, info.pages)
            if (pages.includes(i)) {
              const imgs = await pdfToImages(f.path, join(tmp, `p${i}`), { format: 'jpg', dpi: 120, pages: String(i) }, password)
              const pagePdf = join(tmp, `flat-${i}.pdf`)
              await imagesToPdf([{ id: 'x', path: imgs[0], name: 'p.jpg', size: 1, ext: '.jpg' }], pagePdf, { pageSize: 'fit', margin: 'none' })
              rebuilt.push(pagePdf)
            } else {
              const slice = join(tmp, `keep-${i}.pdf`)
              await run(qpdf(), [...pdfArgs(password), f.path, '--pages', '.', String(i), '--', slice])
              rebuilt.push(slice)
            }
          }
          await mergePdfs(rebuilt, out, undefined, () => undefined)
        } finally {
          await rm(tmp, { recursive: true, force: true })
        }
      } else {
        const dims = await pageDims(f.path, password)
        const blank = join(defaultTmp(), `blank-${randomUUID()}.pdf`)
        await run(py(), [workerPy(), 'blank', '--out', blank, '--width', String(dims.w), '--height', String(dims.h)])
        const tmp = await jobTmp()
        const rebuilt: string[] = []
        try {
          for (let i = 1; i <= info.pages; i++) {
            if (pages.includes(i)) rebuilt.push(blank)
            else {
              const slice = join(tmp, `keep-${i}.pdf`)
              await run(qpdf(), [...pdfArgs(password), f.path, '--pages', '.', String(i), '--', slice])
              rebuilt.push(slice)
            }
          }
          await mergePdfs(rebuilt, out, undefined, () => undefined)
        } finally {
          await rm(tmp, { recursive: true, force: true })
        }
      }
      outputs.push(await resultFile(out))
      break
    }
    case 'pdf-to-markdown': {
      const pdftotext = must('pdftotext', 'Install poppler-utils.')
      let i = 0
      for (const f of files) {
        i += 1
        emit(cb, job.id, (i / files.length) * 90, `Extracting ${f.name}`, i, files.length)
        const txt = join(defaultTmp(), `${randomUUID()}.txt`)
        await run(pdftotext, ['-layout', f.path, txt])
        const out = await namedOut(destRoot, `${basename(f.name, extname(f.name))}.md`)
        await run(py(), [workerPy(), 'md', '--inp', txt, '--out', out])
        outputs.push(await resultFile(out))
      }
      break
    }
    case 'extract': {
      const file = files[0]
      const ranges = optStr(job.options, 'ranges', '1')
      if (!ranges.trim()) throw new Error('Enter pages to keep, e.g. 1-3, 9')
      const out = await namedOut(destRoot, `${basename(file.name, extname(file.name))}-extracted.pdf`)
      emit(cb, job.id, 30, `Extracting ${ranges}…`)
      await run(qpdf(), [...pdfArgs(password), file.path, '--pages', '.', ranges, '--', out])
      outputs.push(await resultFile(out))
      break
    }
    case 'delete-pages': {
      const file = files[0]
      const info = await pdfInfo(file.path, password)
      const remove = parseRanges(optStr(job.options, 'pages', ''), info.pages)
      if (!remove.length) throw new Error('Enter pages to delete, e.g. 2, 5-7')
      const keep: number[] = []
      for (let i = 1; i <= info.pages; i++) if (!remove.includes(i)) keep.push(i)
      if (!keep.length) throw new Error('Deleting those pages would leave an empty PDF.')
      const out = await namedOut(destRoot, `${basename(file.name, extname(file.name))}-trimmed.pdf`)
      emit(cb, job.id, 40, 'Writing remaining pages…')
      await run(qpdf(), [...pdfArgs(password), '--empty', '--pages', file.path, keep.join(','), '--', out])
      outputs.push(await resultFile(out))
      break
    }
    case 'parse-pdf':
      return runParseJob(job, destRoot, cb)
    case 'extract-bank':
      return runStructuredExtract('bank', job, destRoot, cb)
    case 'extract-mpesa':
      return runStructuredExtract('mpesa', job, destRoot, cb)
    case 'extract-invoice':
      return runStructuredExtract('invoice', job, destRoot, cb)
    case 'extract-anything':
      return runStructuredExtract('anything', job, destRoot, cb)
    case 'ask-pdf':
      return runAskIndexJob(job, destRoot, cb)
    case 'summarize-pdf':
      return runSummarizeJob(job, destRoot, cb)
    case 'translate-pdf':
      return runTranslateJob(job, destRoot, cb)
    case 'pdf-forms':
      return runFormsJob(job, destRoot, cb)
    case 'extract-images':
      return runExtractImagesJob(job, destRoot, cb)
    default:
      throw new Error(`Unknown tool: ${tool satisfies never}`)
  }

  emit(cb, job.id, 100, 'Done')
  return {
    jobId: job.id,
    ok: true,
    message: outputs.length === 1 ? `Saved ${outputs[0].name}` : `Saved ${outputs.length} files`,
    outputs
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

export function makeFileRef(path: string, size: number): FileRef {
  return {
    id: createHash('sha1').update(path).digest('hex').slice(0, 12) + '-' + Math.random().toString(16).slice(2, 6),
    path,
    name: basename(path),
    size,
    ext: extname(path).toLowerCase()
  }
}
