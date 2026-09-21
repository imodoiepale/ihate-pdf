<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/wordmark-dark.svg" />
    <img src="docs/brand/wordmark.svg" alt="i hate pdf" height="52" />
  </picture>
</h1>

<p align="center">
  <strong>A local-first desktop PDF studio.</strong><br />
  Merge, split, compress, convert, crop, protect, analyze, and batch-extract — on this computer.
</p>

<p align="center">
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-e5322d" />
  <img alt="Platform" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-1c1c24" />
  <img alt="Local-first" src="https://img.shields.io/badge/files-stay%20on%20disk-e5322d" />
  <img alt="BYO LLM" src="https://img.shields.io/badge/LLM-bring%20your%20own%20keys-6b4eff" />
  <img alt="MCP" src="https://img.shields.io/badge/MCP-HTTP%20%2B%20stdio-10a37f" />
  <img alt="No upload cap" src="https://img.shields.io/badge/file%20size-disk%20limited-f4a025" />
  <a href="https://github.com/imodoiepale/ihate-pdf/releases"><img alt="GitHub Release" src="https://img.shields.io/github/v/release/imodoiepale/ihate-pdf?include_prereleases" /></a>
  <a href="https://github.com/imodoiepale/ihate-pdf/actions/workflows/release.yml"><img alt="Release workflow" src="https://img.shields.io/github/actions/workflow/status/imodoiepale/ihate-pdf/release.yml?label=installers" /></a>
</p>

<p align="center">
  <img src="docs/screenshots/studio-window.jpg" alt="i hate pdf desktop window" width="920" />
</p>

**i hate pdf** is an independent, open-source desktop PDF studio (Electron and Tauri shells). It drops iLovePDF-style upload caps, quotas, and accounts. Nothing is uploaded unless you explicitly tick **Use cloud LLM** on an extract, summarize, ask, or translate job. A 1&nbsp;TB PDF is limited by **free disk and time**, not by a browser heap.

It is **not affiliated with iLovePDF**.

The npm package slug is `ihate-pdf`. The name on screen is three lowercase words: a red **i**, then ` hate pdf`. App id: `com.ihatepdf.app`.

---

## Install

[Download](https://github.com/imodoiepale/ihate-pdf/releases/tag/v1.2.0) `ihate-pdf-1.2.0-win-x64-setup.exe`, double-click, done. First launch fetches qpdf + Poppler into `%LOCALAPPDATA%\ihate-pdf\bin` in the background.

macOS: open the [DMG](https://github.com/imodoiepale/ihate-pdf/releases/download/v1.2.0/ihate-pdf-1.2.0-mac-universal.dmg) (unsigned — right-click → Open). Linux: `chmod +x` the [AppImage](https://github.com/imodoiepale/ihate-pdf/releases/download/v1.2.0/ihate-pdf-1.2.0-linux-x86_64.AppImage).

| OS | File |
| --- | --- |
| Windows x64 | [setup.exe](https://github.com/imodoiepale/ihate-pdf/releases/download/v1.2.0/ihate-pdf-1.2.0-win-x64-setup.exe) · [portable](https://github.com/imodoiepale/ihate-pdf/releases/download/v1.2.0/ihate-pdf-1.2.0-win-x64-portable.exe) |
| macOS | [universal DMG](https://github.com/imodoiepale/ihate-pdf/releases/download/v1.2.0/ihate-pdf-1.2.0-mac-universal.dmg) |
| Linux | [AppImage](https://github.com/imodoiepale/ihate-pdf/releases/download/v1.2.0/ihate-pdf-1.2.0-linux-x86_64.AppImage) · [deb](https://github.com/imodoiepale/ihate-pdf/releases/download/v1.2.0/ihate-pdf-1.2.0-linux-amd64.deb) · [rpm](https://github.com/imodoiepale/ihate-pdf/releases/download/v1.2.0/ihate-pdf-1.2.0-linux-x86_64.rpm) |
| Tauri | [Windows](https://github.com/imodoiepale/ihate-pdf/releases/download/v1.2.0/ihate-pdf-1.2.0-tauri-win-x64-setup.exe) · [macOS](https://github.com/imodoiepale/ihate-pdf/releases/download/v1.2.0/ihate-pdf-1.2.0-tauri-mac-arm64.dmg) · [Linux](https://github.com/imodoiepale/ihate-pdf/releases/download/v1.2.0/ihate-pdf-1.2.0-tauri-linux-x86_64.AppImage) |

NSIS is one-click (per-user). LibreOffice, Tesseract, and Ghostscript stay optional (`./scripts/install-pending.sh --full`).

### Build from source

```bash
npm install
npm run dist          # this OS  (dist:win / dist:mac / dist:linux on CI)
npm run tauri:build   # lighter native shell
```

Windows `.exe` artifacts come from GitHub Actions (`windows-latest`), not from a Linux checkout.

### macOS notarization


CI sets `CSC_IDENTITY_AUTO_DISCOVERY=false` and `mac.identity: null`, so the DMG is **unsigned**. To notarize, add a Developer ID certificate to the repo (`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`) and turn `notarize` on in `electron-builder.yml`.

---

## Screenshots

| Home | Settings · BYO keys |
| --- | --- |
| <img src="docs/screenshots/home.png" alt="Home tool grid" /> | <img src="docs/screenshots/settings.png" alt="API key settings" /> |

| Merge empty state | Analyze PDF |
| --- | --- |
| <img src="docs/screenshots/merge.png" alt="Merge PDF drop zone" /> | <img src="docs/screenshots/analyze.png" alt="Analyze PDF workspace" /> |

<p align="center">
  <img src="docs/screenshots/home-narrow.png" alt="i hate pdf in a smaller window" width="520" />
  <br /><em>The same chrome, tightened for a smaller desktop window.</em>
</p>

---

## TikTok

9:16 stills (1080×1920) and overlay copy live in [`docs/marketing/tiktok/`](docs/marketing/tiktok/). Captions: [`docs/marketing/tiktok/CAPTIONS.md`](docs/marketing/tiktok/CAPTIONS.md). Wordmark in overlays: red lowercase **i**, then dark **hate pdf**.

---

## Why a desktop studio

Browser PDF sites hit three walls: upload limits, storage quotas, and RAM. **i hate pdf** keeps every file on disk and shells out to streaming CLI tools (`qpdf`, Poppler, Ghostscript, LibreOffice, img2pdf, Tesseract). The renderer sends **paths**, not bytes.

| You get | How |
| --- | --- |
| Merge / split / organize / rotate | `qpdf` page tree — does not load the document into Node |
| Compress / PDF/A / repair | `qpdf` streams; Ghostscript only when you ask for a rewrite |
| Office ↔ PDF | Local LibreOffice |
| JPG / scans → PDF | `img2pdf` without decoding a giant bitmap |
| Analyze in well under 2 s | [PyMuPDF](https://github.com/pymupdf/PyMuPDF) by default (often tens of milliseconds); [MarkItDown](https://github.com/microsoft/markitdown) for markdown; Poppler for huge files |
| Bank, M-PESA, invoice extract | Line-by-line tables + regex; M-PESA auto-detect; optional LLM refine of **extracted text only** |
| Extract anything | Local entities + your JSON schema or plain-English request (Reducto Extract-style, on disk) |
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
| stdio | `node mcp/ihate-pdf-mcp.mjs` (example: [`mcp/cursor-mcp.example.json`](mcp/cursor-mcp.example.json)) |

Tools: `parse_pdf`, `extract_bank`, `extract_mpesa`, `extract_invoice`, `extract_anything`, `ask_pdf`. Paths stay on this machine. Optionally run Microsoft’s `markitdown-mcp` beside it for generic file → markdown. The stdio bridge reads `IHATEPDF_ENGINE` (or `IHATE_PDF_ENGINE`) and optional `IHATEPDF_MCP_URL`.

---

## Architecture

```mermaid
flowchart LR
  UI["React UI<br/>127.0.0.1:43127"] -->|fetch + SSE| Engine["i hate pdf engine<br/>127.0.0.1:43128"]
  MCP["MCP HTTP / stdio"] --> Engine
  Engine --> CLI["qpdf · Ghostscript · Poppler<br/>LibreOffice · img2pdf · Tesseract"]
  Engine --> Parse["PyMuPDF · MarkItDown · pdftotext<br/>pdfplumber · pypdf"]
  Engine --> LLM["BYO OpenRouter / OpenAI<br/>Anthropic / compatible"]
  Engine --> Disk["~/Documents/IHATE PDF"]
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
**Analyze & AI** — Analyze PDF, Bank extract, M-PESA extract, Invoice extract, Extract anything, Ask PDF, Summarize, Translate

Missing binaries show a short status line while qpdf/Poppler download; optional CLIs (LibreOffice, Tesseract) stay optional.

---

## Huge files, honestly

- The renderer never reads file bytes into `Buffer` / `ArrayBuffer` for processing.
- Analyze writes `pages/` and `chunks/` on disk. Retrieval scores those files. Default index cap is 200 pages unless you pass a range or tick “entire document”.
- Intermediate work lives in the OS temp directory and is deleted when the job finishes.
- Outputs land in `~/Documents/IHATE PDF` (changeable in Settings).
- Ghostscript (lossy compress, PDF/A) can use more RAM; files over ~2&nbsp;GB stay on the `qpdf` path when that is safer.
- Processing a 1&nbsp;TB file still needs roughly that much **free disk** for the output.

---

## Run from source

PDF tools (vendor-only qpdf + Poppler; pass `--full` for LibreOffice/tesseract):

```bash
./scripts/install-pending.sh
```

Then:

```bash
npm install
npm run dev
# packaged installers: npm run dist / dist:win / dist:mac / dist:linux
# Tauri shell: npm run tauri:dev / npm run tauri:build
# engine only (no window): npm run engine
```

That starts:

- Vite renderer at **http://127.0.0.1:43127**
- Engine API at **http://127.0.0.1:43128**
- an Electron window (`--no-sandbox` is already in the npm script)

```bash
npm run smoke          # qpdf merge/split path
npm run test:extract   # PyMuPDF speed + bank / M-PESA / invoice / extract-anything
npm run mcp            # stdio MCP bridge (engine must be running)
```

Renderer-only: `npm run dev:web` — the engine still has to be up for picking files and jobs.

---

## Parsers we researched (and how i hate pdf uses them)

Open **Settings → Parsers** in the app for live install status. “Razer / Extract” is [Reducto Parse + Extract](https://reducto.ai/parse) (also sometimes Azure Document Intelligence or Ragie). **i hate pdf** implements the same split locally: **Parse** (Analyze PDF) and **Extract** (Bank / M-PESA / Invoice / Extract anything).

| Library | Role in i hate pdf | Speed class |
| --- | --- | --- |
| **[PyMuPDF](https://github.com/pymupdf/PyMuPDF)** | **Default.** Shipped when `pip install pymupdf` is present. | Sub-2 s (often 5–200 ms) |
| **[Microsoft MarkItDown](https://github.com/microsoft/markitdown)** | Optional markdown path | ~1–3 s |
| **[Poppler pdftotext](https://poppler.freedesktop.org/)** | Huge-file streaming fallback | Windowed, disk-safe |
| **[pdfplumber](https://github.com/jsvine/pdfplumber)** | Bank / M-PESA tables | Fast on digital ledgers |
| **[pypdf](https://github.com/py-pdf/pypdf)** | PDF Forms | Form fields only |
| **[Extractous](https://github.com/yobix-ai/extractous)** | Optional “Extract” library (Rust/Tika) | Fast Office/email |
| **[Reducto Parse + Extract](https://reducto.ai/parse)** | Cloud analogue of Analyze + Extract anything | Hosted VLM |
| **[Azure Document Intelligence](https://learn.microsoft.com/azure/ai-services/document-intelligence/)** | Cloud; another “Razer” mishear | Cloud |
| **[Marker 2](https://github.com/datalab-to/marker)** | Optional layout (not bundled) | Fast no-OCR CPU |
| **[IBM Docling](https://github.com/docling-project/docling)** | Optional layout | ~0.5–3 s/page |
| **[MinerU](https://github.com/opendatalab/MinerU)** | Optional formulas/CJK | GPU |
| **[LlamaParse](https://github.com/run-llama/llama_parse) / LlamaExtract** | Cloud RAG + schema extract | Cloud |
| **[Unstructured](https://github.com/Unstructured-IO/unstructured)** | Optional elements pipeline | Seconds/page |
| **[Camelot / Tabula](https://github.com/camelot-dev/camelot)** | Classic M-PESA `mpesa2csv` stack; Java not required here | Per-page tables |
| **[Tesseract](https://github.com/tesseract-ocr/tesseract) / OCRmyPDF** | Scans | Seconds/page |
| **Amazon Textract / Google Document AI** | Cloud forms | Cloud |
| **[Ragie](https://www.ragie.ai/)** | Hosted RAG | Cloud |
| **Apache Tika** | Prefer Extractous | JVM |
| **GROBID** | Academic PDFs | Optional |
| **PaddleOCR / EasyOCR / Surya** | Optional OCR upgrades | GPU-friendly |

Bank extract reads **every ledger line**. M-PESA extract keeps receipt, completion time, details, status, Paid In, Withdrawn, and Balance. Extract anything accepts a JSON schema or a sentence like “all till numbers and the closing balance”, and can refine with your LLM key without uploading the PDF.

---

## License

[MIT](LICENSE) © James Epale

**i hate pdf** is independent open-source software. Not affiliated with, endorsed by, or a substitute name for iLovePDF.
