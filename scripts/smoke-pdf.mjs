#!/usr/bin/env node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('close', (code) => {
      if (code === 0) resolve(out || err)
      else reject(new Error(`${command} ${args.join(' ')} -> ${code}\n${err || out}`))
    })
  })
}

function miniPdf(text) {
  const content = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`
  const objects = [
    null,
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]
  let body = '%PDF-1.4\n'
  const offsets = [0]
  for (let i = 1; i <= 5; i++) {
    offsets[i] = body.length
    body += `${i} 0 obj\n${objects[i]}\nendobj\n`
  }
  const xref = body.length
  body += `xref\n0 6\n0000000000 65535 f \n`
  for (let i = 1; i <= 5; i++) body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  body += `trailer << /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return body
}

const dir = await mkdtemp(join(tmpdir(), 'lovepdf-smoke-'))
const a = join(dir, 'a.pdf')
const b = join(dir, 'b.pdf')
const merged = join(dir, 'merged.pdf')
const rotated = join(dir, 'rotated.pdf')
const extracted = join(dir, 'extracted.pdf')
await writeFile(a, miniPdf('Page A'))
await writeFile(b, miniPdf('Page B'))

await run('qpdf', ['--empty', '--pages', a, '1-z', b, '1-z', '--', merged])
const info = await run('pdfinfo', [merged])
if (!/Pages:\s+2/.test(info)) throw new Error(`Expected 2 pages, got:\n${info}`)
await run('qpdf', ['--rotate=+90:1-z', merged, rotated])
await run('qpdf', [merged, '--pages', '.', '2', '--', extracted])
const extractedInfo = await run('pdfinfo', [extracted])
if (!/Pages:\s+1/.test(extractedInfo)) throw new Error('Extract did not produce 1 page')
const bytes = (await readFile(merged)).length
if (bytes < 200) throw new Error('Merged PDF too small')
await rm(dir, { recursive: true, force: true })
console.log('smoke-pdf: merge, rotate, extract OK')
