# LovePDF Desktop

A local-first desktop PDF toolbox with an iLovePDF-style interface. Merge, split, compress, convert, crop, watermark, protect, and batch-process documents **on this computer**. Nothing is uploaded. There is no account, no cloud quota, and no artificial file-size or file-count cap.

## Why this exists

Browser PDF sites hit three walls: upload limits, storage quotas, and RAM. LovePDF Desktop keeps every file on disk and shells out to streaming CLI tools (`qpdf`, Poppler, Ghostscript, LibreOffice, img2pdf). A 1 TB PDF is limited by **free disk space and time**, not by the JavaScript heap.

## How to run

System tools (install once):

```bash
# Debian / Ubuntu
sudo apt install qpdf poppler-utils ghostscript python3-img2pdf imagemagick libreoffice-nogui python3-reportlab python3-pikepdf zip

# macOS
brew install qpdf poppler ghostscript img2pdf imagemagick
# LibreOffice from https://www.libreoffice.org/
```

Then:

```bash
npm install
npm run dev
```

That starts:

- the Vite renderer at **http://127.0.0.1:43127**
- the local engine API at **http://127.0.0.1:43128**
- an Electron window (use `--no-sandbox` automatically in this project)

Renderer-only (UI without the desktop window):

```bash
npm run dev:web
```

The engine still has to be running for file picking and jobs. Prefer `npm run dev`.

Smoke-test the PDF CLI path:

```bash
npm run smoke
```

## Tools

Organize: Merge, Split, Extract pages, Delete pages, Organize / reorder, Rotate  
Optimize: Compress, Repair, PDF/A  
Convert to PDF: JPG/scan to PDF, Word, Excel, PowerPoint, HTML  
Convert from PDF: JPG, Word, Excel, PowerPoint, Markdown  
Edit: Watermark, page numbers, crop/margins, add text, OCR (needs Tesseract)  
Security: Protect, Unlock, Sign (image stamp), Redact, Compare

If a system binary is missing, the job fails with an install hint instead of a silent stub.

## 1 TB / huge-file strategy (honest)

- The renderer never reads file bytes into `Buffer` / `ArrayBuffer` for processing. It sends **paths**.
- `qpdf` concatenates and splits using the page tree; it does not load all pages into Node.
- Intermediate work lives in the OS temp directory and is deleted when the job finishes.
- Outputs go to `~/Documents/LovePDF` (changeable per tool).
- Ghostscript (lossy compress, PDF/A, some crop paths) can use more RAM. Files over ~2 GB stay on the qpdf path when that is safer.
- img2pdf wraps JPEG/PNG without decoding them into a giant bitmap.
- LibreOffice conversions are **best-effort** and need LibreOffice installed. Scanned PDFs will not become perfect Word/Excel files.
- Page thumbnails are not generated for huge documents; use page ranges.
- Processing a 1 TB file still needs roughly that much **free disk** for the output (and sometimes a temporary sibling). There is no magic that writes a 1 TB result onto a 200 GB disk.

## Architecture

```
Electron main  →  HTTP engine on 127.0.0.1:43128  →  qpdf / gs / pdftoppm / soffice / img2pdf
React renderer →  Vite on 127.0.0.1:43127         →  iLovePDF-like UI, IPC-free fetch + SSE progress
```

Queue: jobs run with limited concurrency so a batch of hundreds of PDFs does not fork hundreds of processes at once.

## Limitations

- OCR needs `tesseract-ocr`.
- PDF → Office layout is LibreOffice’s importer, not a cloud reconstruction.
- Image-stamp signatures are not PAdES certificates.
- HTML-from-URL printing needs the Electron window (Chromium). Local HTML files use LibreOffice.
- pikepdf crop walks page boxes; it is disk-backed but not instantaneous on enormous page counts.
