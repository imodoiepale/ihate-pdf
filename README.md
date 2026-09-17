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

**i hate pdf** is an independent, open-source Electron app. It is a PDF studio that drops iLovePDF-style upload caps, quotas, and accounts. Nothing is uploaded unless you explicitly tick **Use cloud LLM** on an extract, summarize, ask, or translate job. A 1&nbsp;TB PDF is limited by **free disk and time**, not by a browser heap.

It is **not affiliated with iLovePDF**.

The npm package slug is `ihate-pdf`. The name on screen is three lowercase words: a red **i**, then ` hate pdf`. App id: `com.ihatepdf.app`.

---

## Install (one-click)

Installers are built by [GitHub Actions](https://github.com/imodoiepale/ihate-pdf/actions/workflows/release.yml) (`windows-latest`, `macos-latest`, `ubuntu-latest`) and attached to [GitHub Releases](https://github.com/imodoiepale/ihate-pdf/releases) on tags `v*`.

| OS | Download | One-click |
| --- | --- | --- |
| **Windows x64** | `ihate-pdf-*-win-x64-setup.exe` (NSIS) | Double-click and go. Per-user, no option maze. A portable `*-win-x64-portable.exe` is on the same release if you do not want an installer. |
| **macOS** | `ihate-pdf-*-mac-universal.dmg` | Open the DMG, drag **i hate pdf** to Applications. CI ships an **unsigned** DMG (Apple notarization needs a paid Developer ID — see below). First launch: right-click → Open. |
| **Linux** | `*.AppImage`, `.deb`, `.rpm` | AppImage: `chmod +x ihate-pdf-*.AppImage && ./ihate-pdf-*.AppImage`. Debian/Ubuntu: `sudo apt install ./ihate-pdf-*.deb` (apt also installs `qpdf` + `poppler-utils`). |

From a clone:

```bash
# Linux / macOS — download the latest Release asset for this OS
./scripts/install.sh

# Windows (PowerShell) — download NSIS setup.exe and run it
powershell -ExecutionPolicy Bypass -File scripts/install.ps1
```

### PDF engines are not inside the .exe

The Electron app **does not bundle qpdf, Poppler, Ghostscript, LibreOffice, or Tesseract**. qpdf is Apache-2.0 (we could ship a portable copy later); this build does not, so the installer never pretends those binaries live in the package.

| Need | Tool | How |
| --- | --- | --- |
| Merge / split / organize / rotate / protect | **qpdf** | Required |
| Analyze, PDF→JPG, extract images | **Poppler** (`pdftotext`, `pdftoppm`, `pdfimages`) | Required for those tools |
| Lossy compress, PDF/A, repair rewrite | Ghostscript | Optional |
| Office ↔ PDF | LibreOffice | Optional |
| OCR | Tesseract | Optional |
| Fast Analyze / bank extract | Python 3 + `pip install -r resources/requirements-extract.txt` | Optional (PyMuPDF) |

One-click deps:

```bash
./scripts/install-deps.sh      # apt / dnf / pacman / Homebrew
```

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-deps.ps1
# Official qpdf Windows zip (Apache-2.0) + Poppler → %LOCALAPPDATA%\ihate-pdf\bin
```

Debian `.deb` already `Depends:` on `qpdf`, `poppler-utils`, and `python3`. Missing binaries fail with an install hint — they are not silent stubs.

### Build installers from source

```bash
npm install
npm run dist          # this OS
npm run dist:win      # NSIS + portable .exe (x64) — run on Windows or CI
npm run dist:mac      # universal DMG — run on macOS or CI
npm run dist:linux    # AppImage + .deb + .rpm
```

Windows `.exe` artifacts come from GitHub Actions, not from a Linux checkout.

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

Missing binaries fail with an install hint instead of a silent stub.

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

System tools (once):

```bash
# Debian / Ubuntu
sudo apt install qpdf poppler-utils ghostscript python3-img2pdf imagemagick \
  libreoffice-nogui python3-reportlab python3-pikepdf zip tesseract-ocr

# Fast local parse + extract (PyMuPDF is the sub-2s engine)
pip install --user -r resources/requirements-extract.txt

# macOS
brew install qpdf poppler ghostscript img2pdf imagemagick
# LibreOffice: https://www.libreoffice.org/
```

Then:

```bash
npm install
npm run dev
# packaged installers: npm run dist / dist:win / dist:mac / dist:linux
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
