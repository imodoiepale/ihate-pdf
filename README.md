# LovePDF Desktop (LovePDF Studio)

A local-first desktop PDF toolbox with an iLovePDF-style interface. Merge, split, compress, convert, crop, watermark, protect, **analyze**, and batch-extract documents **on this computer**. Nothing is uploaded unless you explicitly tick **Use cloud LLM** on an extract/translate job. There is no account, no cloud quota, and no artificial file-size or file-count cap.

## Why this exists

Browser PDF sites hit three walls: upload limits, storage quotas, and RAM. LovePDF Desktop keeps every file on disk and shells out to streaming CLI tools (`qpdf`, Poppler, Ghostscript, LibreOffice, img2pdf). A 1 TB PDF is limited by **free disk space and time**, not by the JavaScript heap.

## How to run

System tools (install once):

```bash
# Debian / Ubuntu
sudo apt install qpdf poppler-utils ghostscript python3-img2pdf imagemagick libreoffice-nogui python3-reportlab python3-pikepdf zip tesseract-ocr

# Fast ~2s PDF → Markdown (optional but recommended)
pip install --user 'markitdown[pdf]' pdfplumber pypdf

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

Smoke-test the PDF CLI path and the local extract pipeline:

```bash
npm run smoke
npm run test:extract
```

## Tools

Organize: Merge, Split, Extract pages, Delete pages, Organize / reorder, Rotate  
Optimize: Compress, Repair, PDF/A  
Convert to PDF: JPG/scan to PDF, Word, Excel, PowerPoint, HTML  
Convert from PDF: JPG, Word, Excel, PowerPoint, Markdown, **embedded images**  
Edit: Watermark, page numbers, crop/margins, add text, OCR (needs Tesseract), **PDF Forms**  
Security: Protect, Unlock, Sign (image stamp), Redact, Compare  
Analyze & AI: **Analyze PDF**, **Bank extract**, **Invoice extract**, **Ask PDF**, **Summarize**, **Translate**

If a system binary is missing, the job fails with an install hint instead of a silent stub.

## Fast PDF scan, MCP, and research notes

**The ~2-second scanner we ship:** [microsoft/markitdown](https://github.com/microsoft/markitdown) (MIT). Independent parser benchmarks put MarkItDown around **0.3–2s** on born-digital PDFs (no GPU, no model download). That matches “the repository that scans PDFs in 2 seconds.” LovePDF uses it as the fast markdown path when `pip install 'markitdown[pdf]'` succeeded, then **always** writes page-accurate layout with Poppler `pdftotext -layout` in page windows so huge files stay on disk.

**Why not the heavier OCR stacks as default?** MinerU, Marker, olmOCR, DeepSeek-OCR, dots.ocr, and PDF-Extract-Kit need large model weights and usually a GPU. Docling (IBM, MIT, official `docling-mcp`) is the best layout-aware local option if you install it, and we detect it, but it is slower and pulls models. LlamaParse / Reducto / Unstructured Cloud are hosted APIs — they would upload files, which this app refuses unless you opt into **your** LLM.

**Local fallback (no MarkItDown, no API key):** `pdftotext` + optional `pdfplumber` tables + Tesseract OCR when the text layer is empty. Bank/invoice extractors then run regex + table heuristics. That path is required to work; it does.

**MCP:** LovePDF exposes the same engine tools (`parse_pdf`, `extract_bank`, `extract_invoice`, `ask_pdf`) over:

- HTTP JSON-RPC at `http://127.0.0.1:43128/mcp`
- stdio: `node mcp/lovepdf-mcp.mjs` (see `mcp/cursor-mcp.example.json`)

We wrap the engine rather than inventing a competing protocol. Optionally add Microsoft’s `markitdown-mcp` next to it for generic file→markdown.

## API keys

Settings → API keys. Connect **any** of: OpenRouter, OpenAI, Anthropic (Claude), or a generic OpenAI-compatible base URL + key (Ollama, vLLM, LM Studio, Together, Groq, Azure).

- Keys are stored with Electron `safeStorage` (OS keychain) when available, otherwise AES-256-GCM in a `0600` sidecar under the app userData folder.
- The renderer never receives the raw key after save (only `••••last4`).
- **Default provider** is a toggle. **Test connection** sends `ping`/`pong` — no PDF.
- Files are **not** sent to the cloud unless you tick **Use cloud LLM** on an extract, summarize, ask, or translate job. Even then, only extracted text/passages are sent, never the PDF bytes.

## Bulk bank / invoice extract

Drop many PDFs on **Bank extract** or **Invoice extract**. Each file is parsed locally, then structured to JSON. Failures are recorded per file; the batch continues. Combined `statements.csv` / `invoices.csv` plus per-file JSON land in your output folder. Tick **Use cloud LLM** only if you want the default provider to refine the local parse.

Ask PDF indexes chunks on disk and retrieves top passages. A 1 TB file is never loaded into the model context; set a page range (or the auto cap of ~200 pages) for huge documents.

## iLovePDF gaps this slice closed (locally)

| iLovePDF.com | LovePDF Desktop | Honest limit |
| --- | --- | --- |
| Analyze / AI summarizer | Analyze + Summarize (local extractive; optional LLM) | LLM needs your key |
| Translate PDF | Translate extracted markdown | Not a layout-preserving PDF rewrite |
| PDF Forms | List / fill / flatten AcroForm fields | No AI field-detection on flattened scans |
| Workflows / Smart split | Not cloned | Would be a fake without a document-type model |
| Extract images | `pdfimages` | Missing binary → install hint |
| Cloud OCR reconstruction | Tesseract page-by-page | Quality ≠ iLovePDF’s cloud OCR |

## 1 TB / huge-file strategy (honest)

- The renderer never reads file bytes into `Buffer` / `ArrayBuffer` for processing. It sends **paths**.
- `qpdf` concatenates and splits using the page tree; it does not load all pages into Node.
- Analyze writes `pages/NNNNN.txt` and `chunks/` on disk; retrieval scores those files. The default index cap is 200 pages unless you pass a range or tick “entire document”.
- Intermediate work lives in the OS temp directory and is deleted when the job finishes.
- Outputs go to `~/Documents/LovePDF Studio` (changeable per tool).
- Ghostscript (lossy compress, PDF/A, some crop paths) can use more RAM. Files over ~2 GB stay on the qpdf path when that is safer.
- img2pdf wraps JPEG/PNG without decoding them into a giant bitmap.
- LibreOffice conversions are **best-effort** and need LibreOffice installed. Scanned PDFs will not become perfect Word/Excel files.
- Page thumbnails are not generated for huge documents; use page ranges.
- Processing a 1 TB file still needs roughly that much **free disk** for the output (and sometimes a temporary sibling). There is no magic that writes a 1 TB result onto a 200 GB disk.

## Architecture

```
Electron main  →  HTTP engine on 127.0.0.1:43128  →  qpdf / gs / pdftotext / markitdown / soffice / img2pdf
React renderer →  Vite on 127.0.0.1:43127         →  iLovePDF-like UI, IPC-free fetch + SSE progress
MCP            →  /mcp JSON-RPC or mcp/lovepdf-mcp.mjs stdio
```

Queue: jobs run with limited concurrency so a batch of hundreds of PDFs does not fork hundreds of processes at once.

## Limitations

- OCR needs `tesseract-ocr`.
- PDF → Office layout is LibreOffice’s importer, not a cloud reconstruction.
- Image-stamp signatures are not PAdES certificates.
- HTML-from-URL printing needs the Electron window (Chromium). Local HTML files use LibreOffice.
- pikepdf crop walks page boxes; it is disk-backed but not instantaneous on enormous page counts.
- Translate and cloud-refined extract need an API key; local parse still works without one.
- MarkItDown does not OCR scans. Empty text layers fall through to Tesseract (capped page count) or an install hint.
