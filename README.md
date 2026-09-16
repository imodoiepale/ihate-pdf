<p align="center">
  <img src="docs/screenshots/studio-window.jpg" alt="LovePDF Studio desktop window" width="920" />
</p>

<h1 align="center">LovePDF Studio</h1>

<p align="center">
  <strong>A local-first desktop PDF studio.</strong><br />
  Merge, split, compress, convert, crop, protect, analyze, and batch-extract — on this computer.
</p>

<p align="center">
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-e42722" />
  <img alt="Platform" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-1c1c24" />
  <img alt="Local-first" src="https://img.shields.io/badge/files-stay%20on%20disk-e42722" />
  <img alt="BYO LLM" src="https://img.shields.io/badge/LLM-bring%20your%20own%20keys-6b4eff" />
  <img alt="MCP" src="https://img.shields.io/badge/MCP-HTTP%20%2B%20stdio-10a37f" />
  <img alt="No upload cap" src="https://img.shields.io/badge/file%20size-disk%20limited-f4a025" />
</p>

LovePDF Studio is an independent, open-source Electron app. Nothing is uploaded unless you explicitly tick **Use cloud LLM** on an extract, summarize, ask, or translate job. There is no account, no quota, and no artificial file-size or file-count cap. A 1&nbsp;TB PDF is limited by **free disk and time**, not by a browser heap.

It is **not affiliated with iLovePDF**.

---

## Screenshots

| Home | Settings · BYO keys |
| --- | --- |
| <img src="docs/screenshots/home.png" alt="Home tool grid" /> | <img src="docs/screenshots/settings.png" alt="API key settings" /> |

| Merge empty state | Analyze PDF |
| --- | --- |
| <img src="docs/screenshots/merge.png" alt="Merge PDF drop zone" /> | <img src="docs/screenshots/analyze.png" alt="Analyze PDF workspace" /> |

<p align="center">
  <img src="docs/screenshots/home-narrow.png" alt="LovePDF Studio in a smaller window" width="520" />
  <br /><em>The same chrome, tightened for a smaller desktop window.</em>
</p>

---

## Why a desktop studio

Browser PDF sites hit three walls: upload limits, storage quotas, and RAM. LovePDF Studio keeps every file on disk and shells out to streaming CLI tools (`qpdf`, Poppler, Ghostscript, LibreOffice, img2pdf, Tesseract). The renderer sends **paths**, not bytes.

| You get | How |
| --- | --- |
| Merge / split / organize / rotate | `qpdf` page tree — does not load the document into Node |
| Compress / PDF/A / repair | `qpdf` streams; Ghostscript only when you ask for a rewrite |
| Office ↔ PDF | Local LibreOffice |
| JPG / scans → PDF | `img2pdf` without decoding a giant bitmap |
| Analyze in ~2s | [Microsoft MarkItDown](https://github.com/microsoft/markitdown) when installed, else `pdftotext` |
| Bank & invoice extract | Local tables + regex; optional LLM refine of **extracted text only** |
| Ask / summarize / translate | On-disk chunks + your key, never the PDF bytes |
| Huge batches | A job queue with bounded concurrency |

---

## Bring your own LLM keys

Open **Settings → API keys** and connect any of:

- **OpenRouter** — one key for GPT, Claude, Gemini, Llama, …
- **OpenAI**
- **Anthropic**
- **OpenAI-compatible** — Ollama, vLLM, LM Studio, Together, Groq, Azure, or anything that speaks `/v1/chat/completions`

Keys are encrypted with Electron `safeStorage` (OS keychain) when available, otherwise AES-256-GCM in a `0600` sidecar under the app user-data folder. The UI never shows a raw key after save (only `••••last4`). **Test connection** sends `ping` / `pong` — no PDF.

Environment fallbacks (optional): `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_COMPATIBLE_API_KEY`, `OPENAI_COMPATIBLE_BASE_URL`.

---

## MCP

The same engine is available to Cursor, Claude Desktop, and other MCP clients.

| Transport | How |
| --- | --- |
| HTTP JSON-RPC | Enable **Settings → MCP**, then `http://127.0.0.1:43128/mcp` |
| stdio | `node mcp/lovepdf-mcp.mjs` (example: [`mcp/cursor-mcp.example.json`](mcp/cursor-mcp.example.json)) |

Tools: `parse_pdf`, `extract_bank`, `extract_invoice`, `ask_pdf`. Paths stay on this machine. Optionally run Microsoft’s `markitdown-mcp` beside it for generic file → markdown.

---

## Architecture

```mermaid
flowchart LR
  UI["React UI<br/>127.0.0.1:43127"] -->|fetch + SSE| Engine["LovePDF Studio engine<br/>127.0.0.1:43128"]
  MCP["MCP HTTP / stdio"] --> Engine
  Engine --> CLI["qpdf · Ghostscript · Poppler<br/>LibreOffice · img2pdf · Tesseract"]
  Engine --> Parse["MarkItDown / pdftotext<br/>pdfplumber · pypdf"]
  Engine --> LLM["BYO OpenRouter / OpenAI<br/>Anthropic / compatible"]
  Engine --> Disk["~/Documents/LovePDF Studio"]
```

Jobs are queued so a folder of hundreds of PDFs does not fork hundreds of processes.

---

## Tools

**Organize** — Merge, Split, Extract pages, Delete pages, Organize / reorder, Rotate  
**Optimize** — Compress, Repair, PDF/A  
**Convert to PDF** — JPG / scan, Word, Excel, PowerPoint, HTML  
**Convert from PDF** — JPG, Word, Excel, PowerPoint, Markdown, embedded images  
**Edit** — Watermark, page numbers, crop / margins, add text, OCR, PDF Forms  
**Security** — Protect, Unlock, Sign (image stamp), Redact, Compare  
**Analyze & AI** — Analyze PDF, Bank extract, Invoice extract, Ask PDF, Summarize, Translate

Missing binaries fail with an install hint instead of a silent stub.

---

## Huge files, honestly

- The renderer never reads file bytes into `Buffer` / `ArrayBuffer` for processing.
- Analyze writes `pages/` and `chunks/` on disk. Retrieval scores those files. Default index cap is 200 pages unless you pass a range or tick “entire document”.
- Intermediate work lives in the OS temp directory and is deleted when the job finishes.
- Outputs land in `~/Documents/LovePDF Studio` (changeable in Settings).
- Ghostscript (lossy compress, PDF/A) can use more RAM; files over ~2&nbsp;GB stay on the `qpdf` path when that is safer.
- Processing a 1&nbsp;TB file still needs roughly that much **free disk** for the output.

---

## Run it

System tools (once):

```bash
# Debian / Ubuntu
sudo apt install qpdf poppler-utils ghostscript python3-img2pdf imagemagick \
  libreoffice-nogui python3-reportlab python3-pikepdf zip tesseract-ocr

# Fast ~2s PDF → Markdown (optional, recommended)
pip install --user -r resources/requirements-extract.txt

# macOS
brew install qpdf poppler ghostscript img2pdf imagemagick
# LibreOffice: https://www.libreoffice.org/
```

Then:

```bash
npm install
npm run dev
```

That starts:

- Vite renderer at **http://127.0.0.1:43127**
- Engine API at **http://127.0.0.1:43128**
- an Electron window (`--no-sandbox` is already in the npm script)

```bash
npm run smoke          # qpdf merge/split path
npm run test:extract   # local bank/invoice parse
npm run mcp            # stdio MCP bridge (engine must be running)
```

Renderer-only: `npm run dev:web` — the engine still has to be up for picking files and jobs.

---

## License

[MIT](LICENSE) © James Epale

LovePDF Studio is independent open-source software. Not affiliated with, endorsed by, or a substitute name for iLovePDF.
