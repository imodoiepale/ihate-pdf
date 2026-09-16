#!/usr/bin/env node
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const dir = await mkdtemp(join(tmpdir(), 'lovepdf-extract-'))
const pyFile = join(dir, 'make.py')
await writeFile(
  pyFile,
  `
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter

bank = ${JSON.stringify(join(dir, 'bank.pdf'))}
inv = ${JSON.stringify(join(dir, 'invoice.pdf'))}

c = canvas.Canvas(bank, pagesize=letter)
c.setFont('Helvetica-Bold', 16)
c.drawString(72, 740, 'First National Bank')
c.setFont('Helvetica', 11)
c.drawString(72, 720, 'Account Statement')
c.drawString(72, 700, 'Account Number: 123456789')
c.drawString(72, 684, 'Statement Period: 2026-01-01 to 2026-01-31')
c.drawString(72, 668, 'Opening Balance: 2500.00')
y = 630
c.drawString(72, y, 'Date        Description              Debit     Credit    Balance')
rows = [
    ('2026-01-03', 'Payroll Deposit', '', '3200.00', '5700.00'),
    ('2026-01-05', 'Grocery Store', '86.40', '', '5613.60'),
    ('2026-01-12', 'Electric Company', '124.10', '', '5489.50'),
    ('2026-01-20', 'ATM Withdrawal', '200.00', '', '5289.50'),
    ('2026-01-28', 'Interest Earned', '', '1.12', '5290.62'),
]
y = 610
for date, desc, debit, credit, bal in rows:
    c.drawString(72, y, f'{date}  {desc:<22} {debit:>8} {credit:>8} {bal:>10}')
    y -= 16
c.drawString(72, y - 8, 'Closing Balance: 5290.62')
c.save()

c = canvas.Canvas(inv, pagesize=letter)
c.setFont('Helvetica-Bold', 16)
c.drawString(72, 740, 'ACME Supplies Inc.')
c.setFont('Helvetica', 11)
c.drawString(72, 720, 'INVOICE')
c.drawString(72, 700, 'Invoice Number: INV-1042')
c.drawString(72, 684, 'Invoice Date: 2026-03-15')
c.drawString(72, 668, 'Bill To: Contoso LLC')
c.drawString(72, 640, 'Description            Qty    Unit     Amount')
c.drawString(72, 620, 'Copy paper 10-ream     4      12.50    50.00')
c.drawString(72, 604, 'Toner cartridge        2      89.00    178.00')
c.drawString(72, 588, 'Shipping               1      15.00    15.00')
c.drawString(72, 560, 'Subtotal: 243.00')
c.drawString(72, 544, 'Tax: 19.44')
c.drawString(72, 528, 'Total: 262.44')
c.save()
print('ok')
`
)

let r = spawnSync('python3', [pyFile], { encoding: 'utf8' })
if (r.status !== 0) {
  console.error(r.stderr)
  process.exit(1)
}

const extractPy = join(process.cwd(), 'resources/extract.py')
const parsedBank = join(dir, 'parsed-bank')
const parsedInv = join(dir, 'parsed-inv')
await mkdir(parsedBank, { recursive: true })
await mkdir(parsedInv, { recursive: true })

function py(args) {
  const out = spawnSync('python3', [extractPy, ...args], { encoding: 'utf8' })
  if (out.status !== 0) {
    throw new Error(out.stderr || out.stdout || 'extract.py failed')
  }
  return out.stdout
}

const t0 = Date.now()
const parseOut = py(['parse', '--inp', join(dir, 'bank.pdf'), '--out-dir', parsedBank])
const elapsed = Date.now() - t0
const meta = JSON.parse(parseOut.trim().split('\n').pop())
if (!meta.engine) throw new Error('parse meta missing engine')
if (elapsed > 15000) throw new Error(`parse too slow: ${elapsed}ms`)

py(['extract-bank', '--parsed-dir', parsedBank, '--out', join(dir, 'bank.json')])
const bank = JSON.parse(await readFile(join(dir, 'bank.json'), 'utf8'))
if (bank.account_number !== '123456789') throw new Error('account number missing: ' + JSON.stringify(bank))
if (!Array.isArray(bank.transactions) || bank.transactions.length < 3) {
  throw new Error('expected transactions, got ' + JSON.stringify(bank.transactions))
}

py(['parse', '--inp', join(dir, 'invoice.pdf'), '--out-dir', parsedInv])
py(['extract-invoice', '--parsed-dir', parsedInv, '--out', join(dir, 'invoice.json')])
const inv = JSON.parse(await readFile(join(dir, 'invoice.json'), 'utf8'))
if (inv.invoice_number !== 'INV-1042') throw new Error('invoice number missing: ' + JSON.stringify(inv))
if (inv.total !== 262.44) throw new Error('total mismatch: ' + JSON.stringify(inv))

const engines = JSON.parse(py(['engines']))
if (!engines.pdftotext) throw new Error('pdftotext should be detected')

await rm(dir, { recursive: true, force: true })
console.log(
  `extract local OK — parser=${meta.engine} bankTx=${bank.transactions.length} invoiceTotal=${inv.total} parseMs=${meta.elapsedMs} markitdown=${Boolean(engines.markitdown)}`
)
