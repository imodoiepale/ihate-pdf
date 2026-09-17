/** Research catalog of PDF / document-intelligence libraries. Surfaced in Settings → Parsers. */

export type LibraryKind = 'local-fast' | 'local-layout' | 'local-tables' | 'local-ocr' | 'cloud-extract' | 'schema-llm'
export type LibraryStatus = 'shipped' | 'optional' | 'cloud'

export interface ParserLibrary {
  id: string
  name: string
  kind: LibraryKind
  status: LibraryStatus
  url: string
  speed: string
  what: string
  notes: string
  detectKey?: string
}

export interface LibraryRuntime extends ParserLibrary {
  installed: boolean
  activeDefault: boolean
}

export const PARSER_LIBRARIES: ParserLibrary[] = [
  {
    id: 'pymupdf',
    name: 'PyMuPDF (MuPDF)',
    kind: 'local-fast',
    status: 'shipped',
    url: 'https://github.com/pymupdf/PyMuPDF',
    speed: 'Typically 5–200 ms for a born-digital 10-page PDF. This is the sub-2-second path.',
    what: 'Native C library. Page text, blocks, tables, images. Iterates pages; does not load a 1 TB file into Python.',
    notes: 'Default Analyze engine in IHATE PDF when `import pymupdf` works. Measured ~5 ms on an 8-page digital PDF in this environment.',
    detectKey: 'pymupdf'
  },
  {
    id: 'markitdown',
    name: 'Microsoft MarkItDown',
    kind: 'local-fast',
    status: 'optional',
    url: 'https://github.com/microsoft/markitdown',
    speed: '~1–3 s markdown for modest born-digital PDFs (pdfminer backend, no GPU).',
    what: 'Turns PDF/Office into LLM-ready markdown. Second path when you want headings.',
    notes: 'The “~2 second scanner” people mention. Optional: `pip install markitdown[pdf]`. We still page-extract with PyMuPDF/Poppler for line-accurate ledgers.',
    detectKey: 'markitdown'
  },
  {
    id: 'poppler',
    name: 'Poppler pdftotext',
    kind: 'local-fast',
    status: 'shipped',
    url: 'https://poppler.freedesktop.org/',
    speed: 'Streaming windows of 40 pages. Safe for huge files.',
    what: 'Fallback layout text when PyMuPDF is missing or the file is enormous.',
    notes: 'System package `poppler-utils`. Always the huge-file safety net.',
    detectKey: 'pdftotext'
  },
  {
    id: 'pdfplumber',
    name: 'pdfplumber',
    kind: 'local-tables',
    status: 'shipped',
    url: 'https://github.com/jsvine/pdfplumber',
    speed: 'Fast on digital tables; we cap pages so it is never used as a 1 TB loader.',
    what: 'Character-level layout and table extraction for bank / M-Pesa ledgers.',
    notes: 'Installed with IHATE PDF when pip is available. Complements PyMuPDF `find_tables()`.',
    detectKey: 'pdfplumber'
  },
  {
    id: 'pypdf',
    name: 'pypdf',
    kind: 'local-fast',
    status: 'shipped',
    url: 'https://github.com/py-pdf/pypdf',
    speed: 'Form-field list/fill. Not the bulk text path.',
    what: 'AcroForm fields for PDF Forms.',
    notes: 'Used by PDF Forms, not Analyze.',
    detectKey: 'pypdf'
  },
  {
    id: 'extractous',
    name: 'Extractous',
    kind: 'local-fast',
    status: 'optional',
    url: 'https://github.com/yobix-ai/extractous',
    speed: 'Rust/Apache Tika native — often faster and leaner than JVM Tika for Office/email.',
    what: 'PDF, Office, HTML, email, images+OCR. Broad format coverage.',
    notes: 'This is the library people usually mean by “Extract”. Optional `pip install extractous`. Detected if importable; not bundled.',
    detectKey: 'extractous'
  },
  {
    id: 'reducto',
    name: 'Reducto Parse + Extract',
    kind: 'cloud-extract',
    status: 'cloud',
    url: 'https://reducto.ai/parse',
    speed: 'Hosted VLM; seconds per complex page, not a local 2 s path.',
    what: 'Parse (layout JSON) and Extract (schema-typed fields). Strong commercial table/scan OCR.',
    notes:
      'This is the product commonly misheard as “Razer / Extract”. IHATE PDF implements the same *idea* locally: Parse (Analyze PDF) + Extract (Bank / M-Pesa / Invoice / Extract anything). Point Settings → OpenAI-compatible at a Reducto-compatible proxy if you have a key; we do not upload PDFs by default.',
    detectKey: 'reducto'
  },
  {
    id: 'azure-di',
    name: 'Azure Document Intelligence',
    kind: 'cloud-extract',
    status: 'cloud',
    url: 'https://learn.microsoft.com/azure/ai-services/document-intelligence/',
    speed: 'Cloud OCR + prebuilt bank/invoice models. Not sub-2 s locally.',
    what: 'Prebuilt statement, invoice, receipt, ID models. Another name that sounds like “Razer”.',
    notes: 'Use Extract anything + your Azure OpenAI-compatible endpoint on *extracted text*, or a custom base URL. PDFs stay on disk unless you opt in.',
    detectKey: 'azure'
  },
  {
    id: 'marker',
    name: 'Marker 2 (datalab-to/marker)',
    kind: 'local-layout',
    status: 'optional',
    url: 'https://github.com/datalab-to/marker',
    speed: 'Fast no-OCR CPU: ~23 pages/s. A 20-page digital PDF is well under 2 s in no-OCR mode.',
    what: 'Best open pipeline on olmOCR-bench among Marker / MinerU / Docling. Markdown, JSON, HTML, math, tables.',
    notes: 'Heavy models. Not bundled. Install `marker-pdf` yourself.',
    detectKey: 'marker'
  },
  {
    id: 'docling',
    name: 'IBM Docling',
    kind: 'local-layout',
    status: 'optional',
    url: 'https://github.com/docling-project/docling',
    speed: '~0.5 s/page on GPU, ~1–3 s/page on CPU (layout models).',
    what: 'MIT-licensed layout + TableFormer. Strong CPU default for structured conversion.',
    notes: 'Optional. We detect `import docling` but do not download models at install time.',
    detectKey: 'docling'
  },
  {
    id: 'mineru',
    name: 'MinerU',
    kind: 'local-layout',
    status: 'optional',
    url: 'https://github.com/opendatalab/MinerU',
    speed: 'GPU pipeline ~0.2–0.5 s/page. Best at formulas, CJK, messy tables.',
    what: 'PDF/Office → markdown/JSON with VLM+OCR. Has its own MCP server.',
    notes: 'Large. Not bundled.',
    detectKey: 'mineru'
  },
  {
    id: 'llamaparse',
    name: 'LlamaParse (LlamaIndex)',
    kind: 'cloud-extract',
    status: 'cloud',
    url: 'https://github.com/run-llama/llama_parse',
    speed: 'Cloud; agentic modes slower, higher fidelity.',
    what: 'Managed parser for RAG. Agentic OCR for nasty layouts.',
    notes: 'Needs a LlamaCloud key. Not local-first. Pair with LlamaExtract for schema fields.',
    detectKey: 'llama_parse'
  },
  {
    id: 'llama-extract',
    name: 'LlamaExtract',
    kind: 'schema-llm',
    status: 'cloud',
    url: 'https://www.llamaindex.ai/llamaextract',
    speed: 'Cloud schema extract on parsed docs.',
    what: 'Typed extraction (“extract anything”) from a JSON schema.',
    notes: 'IHATE PDF Extract anything does the local equivalent: regex/entities + optional BYO LLM schema fill.',
    detectKey: 'llama_extract'
  },
  {
    id: 'unstructured',
    name: 'Unstructured',
    kind: 'local-layout',
    status: 'optional',
    url: 'https://github.com/Unstructured-IO/unstructured',
    speed: 'Seconds per page locally; also a paid SaaS.',
    what: 'Element types (title, table, narrative). OSS + paid pipeline.',
    notes: 'Optional. Heavy system deps.',
    detectKey: 'unstructured'
  },
  {
    id: 'camelot-tabula',
    name: 'Camelot / Tabula',
    kind: 'local-tables',
    status: 'optional',
    url: 'https://github.com/camelot-dev/camelot',
    speed: 'Per-page table lattice/stream. Java needed for Tabula.',
    what: 'Classic bank-statement and M-Pesa table extractors (mpesa2csv uses Tabula).',
    notes: 'We parse M-Pesa with layout lines + pdfplumber/PyMuPDF first so Java is not required.',
    detectKey: 'camelot'
  },
  {
    id: 'tesseract',
    name: 'Tesseract OCR',
    kind: 'local-ocr',
    status: 'shipped',
    url: 'https://github.com/tesseract-ocr/tesseract',
    speed: 'Seconds per scanned page. Capped in IHATE PDF.',
    what: 'Scans with almost no text layer.',
    notes: 'System package `tesseract-ocr`. Used automatically when pages look empty.',
    detectKey: 'tesseract'
  },
  {
    id: 'ocrmypdf',
    name: 'OCRmyPDF',
    kind: 'local-ocr',
    status: 'optional',
    url: 'https://github.com/ocrmypdf/OCRmyPDF',
    speed: 'Adds a hidden text layer with Tesseract; then PyMuPDF is sub-2 s again.',
    what: 'Production OCR PDF writer. The OCR PDF tool in IHATE PDF is the lightweight cousin.',
    notes: 'Optional. Run OCR PDF in IHATE PDF, then Analyze / extract.',
    detectKey: 'ocrmypdf'
  },
  {
    id: 'textract',
    name: 'Amazon Textract / Google Document AI',
    kind: 'cloud-extract',
    status: 'cloud',
    url: 'https://aws.amazon.com/textract/',
    speed: 'Cloud OCR+forms. Not sub-2 s locally.',
    what: 'Enterprise form/table APIs.',
    notes: 'Analyze locally, then send extracted text to your LLM instead of uploading PDFs.',
    detectKey: 'textract'
  },
  {
    id: 'ragie',
    name: 'Ragie',
    kind: 'cloud-extract',
    status: 'cloud',
    url: 'https://www.ragie.ai/',
    speed: 'Hosted RAG ingest.',
    what: 'Document RAG API. Another name that sounds like “Razer”.',
    notes: 'Not bundled. IHATE PDF already indexes chunks on disk for Ask PDF.',
    detectKey: 'ragie'
  },
  {
    id: 'tika',
    name: 'Apache Tika',
    kind: 'local-fast',
    status: 'optional',
    url: 'https://tika.apache.org/',
    speed: 'JVM server; Extractous is the native port we prefer.',
    what: 'Kitchen-sink file text extraction (email, Office, PDF).',
    notes: 'Not bundled. Use Extractous if you need Tika coverage without Java.',
    detectKey: 'tika'
  },
  {
    id: 'grobid',
    name: 'GROBID',
    kind: 'local-layout',
    status: 'optional',
    url: 'https://github.com/kermitt2/grobid',
    speed: 'Academic PDF structure (headers, references).',
    what: 'Best for papers, not bank statements.',
    notes: 'Not bundled. Ask PDF + Analyze cover general documents.',
    detectKey: 'grobid'
  },
  {
    id: 'paddleocr',
    name: 'PaddleOCR / EasyOCR / Surya',
    kind: 'local-ocr',
    status: 'optional',
    url: 'https://github.com/PaddlePaddle/PaddleOCR',
    speed: 'GPU-friendly OCR. Surya is Marker’s detector.',
    what: 'Scanned ledgers when Tesseract is not enough.',
    notes: 'Optional. IHATE PDF ships Tesseract; these are upgrades you can install yourself.',
    detectKey: 'paddleocr'
  }
]

export function mergeLibraryStatus(
  engines: Record<string, boolean | string | undefined>
): LibraryRuntime[] {
  const defaultParser = String(engines.defaultParser || '')
  return PARSER_LIBRARIES.map((lib) => {
    const key = lib.detectKey || lib.id
    const raw = engines[key]
    const installed =
      lib.status === 'cloud'
        ? false
        : raw === true || raw === 'true' || raw === lib.id || (typeof raw === 'string' && raw.length > 0 && raw !== 'false')
    return {
      ...lib,
      installed,
      activeDefault: defaultParser === lib.id || defaultParser === key
    }
  })
}
