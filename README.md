# LovePDF Desktop

A local **Electron** PDF toolbox with an iLovePDF-style UI. Files never leave this computer. There is no upload cap, page cap, or cloud storage quota — the only limit is disk space.

## Why this exists

Browser PDF sites choke on three things this app is built for:

- **Margins** — crop millimetres off a PDF, or wrap scans/images onto A4/Letter with small, big, or custom borders.
- **Storage** — output goes to `~/Documents/LovePDF` (or any folder you pick). Nothing is uploaded.
- **Many / huge PDFs** — merge is batched through `qpdf` so you are not blocked by a command-line length limit or by loading a file into JavaScript. A 1 TB document is streamed and rewritten on disk; it is never read into the renderer heap.

## Tools

Merge, split, compress, rotate, organize, repair, crop, page numbers, watermark, edit (text overlay), sign, protect, unlock, redact, compare, OCR, JPG/scan to PDF, PDF to JPG, Word/PowerPoint/Excel to PDF, PDF to Word/PPT/Excel/Markdown/PDF-A, HTML to PDF.

## Run

Needs Node 20+, and on Linux: `qpdf`, `poppler-utils`, `ghostscript`, LibreOffice, `tesseract-ocr`, and `img2pdf` (`pip install img2pdf reportlab pikepdf`).

```bash
npm install
npm run dev
```

That starts:

- the desktop window (Electron)
- the renderer at [http://127.0.0.1:43127](http://127.0.0.1:43127)
- a local engine API at `http://127.0.0.1:43128`

On Linux containers Electron needs `--no-sandbox` (already in `npm run dev`). If there is no display, run under Xvfb.

```bash
npx electron-vite build
```

## How large files are handled

- The UI sends **file paths**, not file bytes. Use **Add by absolute path** for archives that should not pass through a picker.
- Merge/split/rotate/encrypt call **qpdf**, which maps objects instead of buffering the whole document in Node.
- Many files are merged in groups of 30, then those groups are merged, so argv and RAM stay bounded.
- Image wrapping uses **img2pdf** (lossless, optional `--from-file` with NUL-separated paths).
- Office conversion uses headless **LibreOffice** with an isolated user profile per job.
- Temp files live under the OS temp dir and are deleted when a job finishes.
- Processing a 1 TB PDF needs roughly **another 1 TB free** for the output (and sometimes a temp copy). The home screen and each tool show free disk space.

## Keyboard / batch

Drop many files onto a tool, reorder with ↑ ↓, and run. Compress, rotate, protect, unlock, and office conversions process the list as a queue (two jobs at a time by default).
