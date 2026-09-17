#!/usr/bin/env node
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'

const dir = join(tmpdir(), 'ihate-pdf-engine-test')
rmSync(dir, { recursive: true, force: true })
mkdirSync(dir, { recursive: true })

function py(code, file) {
  writeFileSync(file, code)
}

py(
  `from reportlab.pdfgen import canvas
c = canvas.Canvas(${JSON.stringify(join(dir, 'a.pdf'))})
c.drawString(72, 720, 'Alpha')
c.showPage()
c.drawString(72, 720, 'Alpha 2')
c.save()
c = canvas.Canvas(${JSON.stringify(join(dir, 'b.pdf'))})
c.drawString(72, 720, 'Bravo')
c.save()
`,
  join(dir, 'make.py')
)

let r = spawnSync('python3', [join(dir, 'make.py')], { encoding: 'utf8' })
if (r.status !== 0) {
  console.error(r.stderr)
  process.exit(1)
}

r = spawnSync('qpdf', ['--empty', '--pages', join(dir, 'a.pdf'), '1-z', join(dir, 'b.pdf'), '1-z', '--', join(dir, 'merged.pdf')], {
  encoding: 'utf8'
})
if (r.status !== 0) {
  console.error('merge failed', r.stderr)
  process.exit(1)
}

r = spawnSync('pdfinfo', [join(dir, 'merged.pdf')], { encoding: 'utf8' })
if (!/Pages:\s+3/.test(r.stdout)) {
  console.error('expected 3 pages', r.stdout)
  process.exit(1)
}

r = spawnSync(
  'python3',
  [
    join(process.cwd(), 'resources/worker.py'),
    'crop',
    '--inp',
    join(dir, 'merged.pdf'),
    '--out',
    join(dir, 'cropped.pdf'),
    '--top',
    '10',
    '--right',
    '10',
    '--bottom',
    '10',
    '--left',
    '10'
  ],
  { encoding: 'utf8' }
)
if (r.status !== 0) {
  console.error('crop failed', r.stderr)
  process.exit(1)
}

r = spawnSync('qpdf', [join(dir, 'a.pdf'), '--rotate=+90:1-z', '--', join(dir, 'rot.pdf')], { encoding: 'utf8' })
if (r.status !== 0) {
  console.error('rotate failed', r.stderr)
  process.exit(1)
}

console.log('engine smoke tests passed')
console.log('merged', join(dir, 'merged.pdf'))
