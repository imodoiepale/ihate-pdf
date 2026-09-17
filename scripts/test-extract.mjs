#!/usr/bin/env node
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const dir = await mkdtemp(join(tmpdir(), 'ihate-pdf-extract-'))
const pyFile = join(dir, 'make.py')
await writeFile(
  pyFile,
  `
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter

bank = ${JSON.stringify(join(dir, 'bank.pdf'))}
inv = ${JSON.stringify(join(dir, 'invoice.pdf'))}
mpesa = ${JSON.stringify(join(dir, 'mpesa.pdf'))}

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

c = canvas.Canvas(mpesa, pagesize=letter)
c.setFont('Helvetica-Bold', 16)
c.drawString(72, 740, 'M-PESA STATEMENT')
c.setFont('Helvetica', 11)
c.drawString(72, 720, 'Safaricom PLC')
c.drawString(72, 700, 'Customer Name: Jane Wanjiku')
c.drawString(72, 684, 'Mobile Number: 254712345678')
c.drawString(72, 668, 'Email Address: jane@example.com')
c.drawString(72, 652, 'Statement Period: 2026-01-01 to 2026-01-31')
c.drawString(40, 620, 'Receipt No.  Completion Time         Details                                   Status     Paid In  Withdrawn  Balance')
mpesa_rows = [
    ('QJ7ABC1234', '2026-01-03 08:12:44', 'Customer Transfer from 254700111222', 'Completed', '500.00', '', '12500.00'),
    ('QJ8DEF5678', '2026-01-03 09:00:11', 'Pay Bill to 888880 Acc. KPLC', 'Completed', '', '1200.00', '11300.00'),
    ('QJ9GHI9012', '2026-01-04 12:15:02', 'Merchant Payment to 654321 - SUPERMARKET', 'Completed', '', '850.00', '10450.00'),
    ('QK1JKL3456', '2026-01-05 18:40:33', 'Airtime Purchase', 'Completed', '', '50.00', '10400.00'),
    ('QK2MNO7890', '2026-01-06 07:01:09', 'Customer Transfer to 254733000111', 'Completed', '', '200.00', '10200.00'),
]
y = 600
for rec, ts, details, status, paid, withdrawn, bal in mpesa_rows:
    c.setFont('Helvetica', 8)
    c.drawString(40, y, f'{rec}  {ts}  {details:<42}  {status}  {paid:>7}  {withdrawn:>8}  {bal}')
    y -= 14
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
const parsedMpesa = join(dir, 'parsed-mpesa')
await mkdir(parsedBank, { recursive: true })
await mkdir(parsedInv, { recursive: true })
await mkdir(parsedMpesa, { recursive: true })

function py(args) {
  const out = spawnSync('python3', [extractPy, ...args], { encoding: 'utf8' })
  if (out.status !== 0) {
    throw new Error(out.stderr || out.stdout || 'extract.py failed')
  }
  return out.stdout
}

const engines = JSON.parse(py(['engines']))
if (!engines.pdftotext && !engines.pymupdf) throw new Error('need pymupdf or pdftotext')

const t0 = Date.now()
const parseOut = py(['parse', '--inp', join(dir, 'bank.pdf'), '--out-dir', parsedBank, '--engine', 'auto'])
const elapsed = Date.now() - t0
const meta = JSON.parse(parseOut.trim().split('\n').pop())
if (!meta.engine) throw new Error('parse meta missing engine')
if (elapsed > 15000) throw new Error(`parse too slow: ${elapsed}ms`)
if (engines.pymupdf && meta.elapsedMs > 2000) {
  throw new Error(`PyMuPDF path must stay under 2s, got ${meta.elapsedMs}ms engine=${meta.engine}`)
}
if (engines.pymupdf && !String(meta.engine).includes('pymupdf')) {
  throw new Error('expected pymupdf engine, got ' + meta.engine)
}

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

py(['parse', '--inp', join(dir, 'mpesa.pdf'), '--out-dir', parsedMpesa])
py(['extract-mpesa', '--parsed-dir', parsedMpesa, '--out', join(dir, 'mpesa.json')])
const mpesa = JSON.parse(await readFile(join(dir, 'mpesa.json'), 'utf8'))
if (mpesa.statement_kind !== 'mpesa') throw new Error('expected mpesa kind: ' + JSON.stringify(mpesa))
if (mpesa.msisdn !== '254712345678') throw new Error('msisdn missing: ' + JSON.stringify(mpesa))
if (!Array.isArray(mpesa.transactions) || mpesa.transactions.length < 4) {
  throw new Error('expected M-PESA lines, got ' + JSON.stringify(mpesa.transactions))
}
const receipts = mpesa.transactions.map((t) => t.receipt)
if (!receipts.includes('QJ7ABC1234')) throw new Error('missing receipt QJ7ABC1234: ' + JSON.stringify(receipts))

py(['extract-bank', '--parsed-dir', parsedMpesa, '--out', join(dir, 'bank-from-mpesa.json')])
const auto = JSON.parse(await readFile(join(dir, 'bank-from-mpesa.json'), 'utf8'))
if (auto.statement_kind !== 'mpesa') throw new Error('bank extract should auto-detect M-PESA')

const schemaPath = join(dir, 'schema.json')
await writeFile(schemaPath, JSON.stringify({ customer_name: '', mobile_number: '', email_address: '' }))
py([
  'extract-anything',
  '--parsed-dir',
  parsedMpesa,
  '--out',
  join(dir, 'anything.json'),
  '--query',
  'M-PESA receipts and closing balance',
  '--schema',
  schemaPath
])
const anything = JSON.parse(await readFile(join(dir, 'anything.json'), 'utf8'))
if (anything.detected_kind !== 'mpesa') throw new Error('extract-anything kind: ' + JSON.stringify(anything.detected_kind))
if (!anything.entities?.emails?.includes('jane@example.com')) {
  throw new Error('extract-anything missed email: ' + JSON.stringify(anything.entities))
}
if (!anything.entities?.mpesa_receipts?.includes('QJ7ABC1234')) {
  throw new Error('extract-anything missed receipts: ' + JSON.stringify(anything.entities?.mpesa_receipts))
}

await rm(dir, { recursive: true, force: true })
console.log(
  `extract local OK — parser=${meta.engine} parseMs=${meta.elapsedMs} bankTx=${bank.transactions.length} mpesaTx=${mpesa.transactions.length} invoiceTotal=${inv.total} pymupdf=${Boolean(engines.pymupdf)}`
)
