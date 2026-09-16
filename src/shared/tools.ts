import type { ToolDef, ToolGroup, ToolId } from './types'

export const GROUPS: { id: ToolGroup; label: string }[] = [
  { id: 'organize', label: 'Organize PDF' },
  { id: 'optimize', label: 'Optimize PDF' },
  { id: 'to-pdf', label: 'Convert to PDF' },
  { id: 'from-pdf', label: 'Convert from PDF' },
  { id: 'edit', label: 'Edit PDF' },
  { id: 'security', label: 'PDF security' }
]

const pdf = ['.pdf']
const officeWord = ['.doc', '.docx', '.odt', '.rtf', '.txt']
const officePpt = ['.ppt', '.pptx', '.odp']
const officeXls = ['.xls', '.xlsx', '.ods', '.csv']
const images = ['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.bmp', '.gif', '.heic']
const html = ['.html', '.htm']
const docs = [...pdf, ...officeWord, ...officePpt, ...officeXls, ...images, ...html]

export const TOOLS: ToolDef[] = [
  {
    id: 'merge',
    title: 'Merge PDF',
    tagline: 'Combine PDFs in the order you want with the easiest PDF merger available.',
    description:
      'Merge as many PDFs as you need. Files stay on disk and are concatenated with qpdf — the original bytes are not loaded into memory.',
    color: '#e5322d',
    group: 'organize',
    accept: pdf,
    acceptLabel: 'PDF files',
    minFiles: 2,
    action: 'Merge PDF',
    options: [],
    nav: 'header'
  },
  {
    id: 'split',
    title: 'Split PDF',
    tagline: 'Separate one page or a whole set for easy conversion into independent PDF files.',
    description: 'Split by range, extract every page, or burst every N pages into a folder. Huge documents are split on disk.',
    color: '#f4a025',
    group: 'organize',
    accept: pdf,
    acceptLabel: 'PDF file',
    minFiles: 1,
    maxFiles: 1,
    action: 'Split PDF',
    options: [
      {
        key: 'mode',
        label: 'Split mode',
        type: 'radio',
        options: [
          { value: 'range', label: 'Custom ranges', hint: 'e.g. 1-3, 5, 8-10' },
          { value: 'extract', label: 'Extract all pages' },
          { value: 'fixed', label: 'Every N pages' }
        ]
      },
      { key: 'ranges', label: 'Ranges', type: 'text', placeholder: '1-3, 5, 8-10' },
      { key: 'every', label: 'Pages per file', type: 'number', min: 1, placeholder: '2' }
    ],
    nav: 'header'
  },
  {
    id: 'extract',
    title: 'Extract pages',
    tagline: 'Keep only the pages you select in a new PDF.',
    description: 'Writes a new PDF from a page range using qpdf page selection. The source file is read from disk.',
    color: '#f4a025',
    group: 'organize',
    accept: pdf,
    acceptLabel: 'PDF file',
    minFiles: 1,
    maxFiles: 1,
    action: 'Extract pages',
    options: [{ key: 'ranges', label: 'Pages to keep', type: 'text', placeholder: '1-3, 9' }]
  },
  {
    id: 'delete-pages',
    title: 'Delete pages',
    tagline: 'Drop pages you do not need and keep the rest.',
    description: 'Rebuilds the PDF without the pages you list. Originals are never overwritten unless you choose that path.',
    color: '#e07b2d',
    group: 'organize',
    accept: pdf,
    acceptLabel: 'PDF file',
    minFiles: 1,
    maxFiles: 1,
    action: 'Delete pages',
    options: [{ key: 'pages', label: 'Pages to delete', type: 'text', placeholder: '2, 5-7' }]
  },
  {
    id: 'compress',
    title: 'Compress PDF',
    tagline: 'Reduce file size while optimizing for maximal PDF quality.',
    description:
      'Recommended mode recompresses streams with qpdf (memory-light). Extreme mode rewrites with Ghostscript for smaller files.',
    color: '#3caf4f',
    group: 'optimize',
    accept: pdf,
    acceptLabel: 'PDF files',
    minFiles: 1,
    action: 'Compress PDF',
    options: [
      {
        key: 'level',
        label: 'Compression level',
        type: 'radio',
        options: [
          { value: 'recommended', label: 'Recommended compression' },
          { value: 'extreme', label: 'Extreme compression' },
          { value: 'less', label: 'Less compression (high quality)' }
        ]
      }
    ],
    nav: 'header'
  },
  {
    id: 'pdf-to-word',
    title: 'PDF to Word',
    tagline: 'Convert PDF files into easy to edit DOC and DOCX documents.',
    description: 'Uses LibreOffice locally. Layout of scanned or complex PDFs may vary; OCR first if the file is a scan.',
    color: '#2b7cd3',
    group: 'from-pdf',
    accept: pdf,
    acceptLabel: 'PDF files',
    minFiles: 1,
    action: 'Convert to Word',
    options: [
      {
        key: 'format',
        label: 'Format',
        type: 'select',
        options: [
          { value: 'docx', label: 'DOCX' },
          { value: 'doc', label: 'DOC' },
          { value: 'odt', label: 'ODT' }
        ]
      }
    ],
    nav: 'convert'
  },
  {
    id: 'pdf-to-ppt',
    title: 'PDF to PowerPoint',
    tagline: 'Turn your PDF files into easy to edit PPT and PPTX slideshows.',
    description: 'Each PDF page becomes a slide through LibreOffice on this computer.',
    color: '#d4522a',
    group: 'from-pdf',
    accept: pdf,
    acceptLabel: 'PDF files',
    minFiles: 1,
    action: 'Convert to PowerPoint',
    options: []
  },
  {
    id: 'pdf-to-excel',
    title: 'PDF to Excel',
    tagline: 'Pull data straight from PDFs into Excel spreadsheets.',
    description: 'LibreOffice conversion first, with a layout-preserving CSV fallback from extracted text.',
    color: '#1f7a46',
    group: 'from-pdf',
    accept: pdf,
    acceptLabel: 'PDF files',
    minFiles: 1,
    action: 'Convert to Excel',
    options: []
  },
  {
    id: 'word-to-pdf',
    title: 'Word to PDF',
    tagline: 'Make DOC and DOCX files easy to read by converting them to PDF.',
    description: 'Converts Word and text documents locally with LibreOffice.',
    color: '#2b7cd3',
    group: 'to-pdf',
    accept: officeWord,
    acceptLabel: 'Word files',
    minFiles: 1,
    action: 'Convert to PDF',
    options: []
  },
  {
    id: 'ppt-to-pdf',
    title: 'PowerPoint to PDF',
    tagline: 'Make PPT and PPTX slideshows easy to view by converting them to PDF.',
    description: 'Converts presentations locally with LibreOffice.',
    color: '#d4522a',
    group: 'to-pdf',
    accept: officePpt,
    acceptLabel: 'PowerPoint files',
    minFiles: 1,
    action: 'Convert to PDF',
    options: []
  },
  {
    id: 'excel-to-pdf',
    title: 'Excel to PDF',
    tagline: 'Make Excel spreadsheets easy to read by converting them to PDF.',
    description: 'Converts spreadsheets locally with LibreOffice.',
    color: '#1f7a46',
    group: 'to-pdf',
    accept: officeXls,
    acceptLabel: 'Excel files',
    minFiles: 1,
    action: 'Convert to PDF',
    options: []
  },
  {
    id: 'edit-pdf',
    title: 'Edit PDF',
    tagline: 'Add text to a PDF document. Choose size, position, and page range.',
    description: 'Adds a text overlay without rewriting page content streams in memory. For drawings, use Watermark or Sign.',
    color: '#e5322d',
    group: 'edit',
    accept: pdf,
    acceptLabel: 'PDF files',
    minFiles: 1,
    action: 'Add text',
    options: [
      { key: 'text', label: 'Text', type: 'textarea', placeholder: 'Your text' },
      {
        key: 'position',
        label: 'Position',
        type: 'select',
        options: [
          { value: 'center', label: 'Center' },
          { value: 'top', label: 'Top' },
          { value: 'bottom', label: 'Bottom' },
          { value: 'header-left', label: 'Header left' },
          { value: 'header-right', label: 'Header right' }
        ]
      },
      { key: 'fontSize', label: 'Font size', type: 'number', min: 6, max: 120, placeholder: '16' }
    ]
  },
  {
    id: 'pdf-to-jpg',
    title: 'PDF to JPG',
    tagline: 'Convert each PDF page into a JPG or extract all images contained in a PDF.',
    description: 'Renders pages with Poppler one range at a time so a giant PDF is not decoded as a whole.',
    color: '#f0c14b',
    group: 'from-pdf',
    accept: pdf,
    acceptLabel: 'PDF files',
    minFiles: 1,
    action: 'Convert to JPG',
    options: [
      {
        key: 'format',
        label: 'Image format',
        type: 'select',
        options: [
          { value: 'jpg', label: 'JPG' },
          { value: 'png', label: 'PNG' }
        ]
      },
      { key: 'dpi', label: 'DPI', type: 'number', min: 36, max: 600, placeholder: '150' },
      { key: 'pages', label: 'Pages (blank = all)', type: 'text', placeholder: '1-5' }
    ]
  },
  {
    id: 'jpg-to-pdf',
    title: 'JPG to PDF',
    tagline: 'Convert JPG images to PDF in seconds. Easily adjust orientation and margins.',
    description: 'Lossless wrap with img2pdf. Set page size, orientation, and margins without resampling pixels.',
    color: '#f0c14b',
    group: 'to-pdf',
    accept: images,
    acceptLabel: 'images',
    minFiles: 1,
    action: 'Convert to PDF',
    options: [
      {
        key: 'pageSize',
        label: 'Page size',
        type: 'select',
        options: [
          { value: 'fit', label: 'Fit to image (no extra margin)' },
          { value: 'A4', label: 'A4' },
          { value: 'Letter', label: 'US Letter' },
          { value: 'Legal', label: 'US Legal' }
        ]
      },
      {
        key: 'margin',
        label: 'Margin',
        type: 'select',
        options: [
          { value: 'none', label: 'No margin' },
          { value: 'small', label: 'Small (10 mm)' },
          { value: 'big', label: 'Big (25 mm)' },
          { value: 'custom', label: 'Custom (mm)' }
        ]
      },
      {
        key: 'customMargins',
        label: 'Custom margins (mm)',
        type: 'margins',
        keys: { top: 'mTop', right: 'mRight', bottom: 'mBottom', left: 'mLeft' }
      },
      {
        key: 'orientation',
        label: 'Orientation',
        type: 'select',
        options: [
          { value: 'auto', label: 'Auto' },
          { value: 'portrait', label: 'Portrait' },
          { value: 'landscape', label: 'Landscape' }
        ]
      }
    ]
  },
  {
    id: 'sign-pdf',
    title: 'Sign PDF',
    tagline: 'Stamp a signature image onto your PDF. Files never leave this computer.',
    description: 'Overlays a PNG/JPG signature. Pick position and scale. For certificates/PAdES, export then sign with your OS tools.',
    color: '#2bb3c0',
    group: 'security',
    accept: pdf,
    acceptLabel: 'PDF files',
    minFiles: 1,
    action: 'Sign PDF',
    options: [
      { key: 'signature', label: 'Signature image', type: 'file' },
      {
        key: 'position',
        label: 'Position',
        type: 'select',
        options: [
          { value: 'bottom-right', label: 'Bottom right' },
          { value: 'bottom-left', label: 'Bottom left' },
          { value: 'center', label: 'Center' }
        ]
      }
    ]
  },
  {
    id: 'watermark',
    title: 'Watermark',
    tagline: 'Stamp an image or text over your PDF in seconds.',
    description: 'Choose typography, transparency and position. The stamp is a small overlay; the source PDF is not slurped into RAM.',
    color: '#3caf9a',
    group: 'edit',
    accept: pdf,
    acceptLabel: 'PDF files',
    minFiles: 1,
    action: 'Add watermark',
    options: [
      { key: 'text', label: 'Watermark text', type: 'text', placeholder: 'CONFIDENTIAL' },
      { key: 'fontSize', label: 'Font size', type: 'number', min: 8, max: 200, placeholder: '48' },
      { key: 'opacity', label: 'Opacity (0-100)', type: 'number', min: 5, max: 100, placeholder: '25' },
      {
        key: 'rotation',
        label: 'Rotation',
        type: 'select',
        options: [
          { value: 'diagonal', label: 'Diagonal' },
          { value: '0', label: 'Horizontal' },
          { value: '90', label: 'Vertical' }
        ]
      }
    ]
  },
  {
    id: 'rotate',
    title: 'Rotate PDF',
    tagline: 'Rotate your PDFs the way you need them. You can even rotate multiple PDFs at once!',
    description: 'Rotation is a page-tree flag change via qpdf — fast even on very large files.',
    color: '#e07b2d',
    group: 'edit',
    accept: pdf,
    acceptLabel: 'PDF files',
    minFiles: 1,
    action: 'Rotate PDF',
    options: [
      {
        key: 'angle',
        label: 'Rotation',
        type: 'radio',
        options: [
          { value: '90', label: '90° right' },
          { value: '180', label: '180°' },
          { value: '270', label: '90° left' }
        ]
      }
    ]
  },
  {
    id: 'html-to-pdf',
    title: 'HTML to PDF',
    tagline: 'Convert webpages in HTML to PDF. Paste a URL or pick an HTML file.',
    description: 'Local HTML files go through LibreOffice. URLs are printed with Chromium inside Electron.',
    color: '#e5322d',
    group: 'to-pdf',
    accept: html,
    acceptLabel: 'HTML files',
    minFiles: 0,
    action: 'Convert to PDF',
    options: [{ key: 'url', label: 'Or convert a URL', type: 'text', placeholder: 'https://example.com' }]
  },
  {
    id: 'unlock',
    title: 'Unlock PDF',
    tagline: 'Remove PDF password security, giving you the freedom to use your PDFs as you want.',
    description: 'Decrypts with qpdf when you provide the current password. Owner-only restrictions are stripped locally.',
    color: '#3caf4f',
    group: 'security',
    accept: pdf,
    acceptLabel: 'PDF files',
    minFiles: 1,
    action: 'Unlock PDF',
    options: [{ key: 'password', label: 'Current password', type: 'password' }]
  },
  {
    id: 'protect',
    title: 'Protect PDF',
    tagline: 'Protect PDF files with a password. Encrypt PDF documents to prevent unauthorized access.',
    description: 'AES-256 encryption via qpdf. Keep the password — LovePDF cannot recover it.',
    color: '#2f8f7b',
    group: 'security',
    accept: pdf,
    acceptLabel: 'PDF files',
    minFiles: 1,
    action: 'Protect PDF',
    options: [
      { key: 'password', label: 'Password', type: 'password' },
      { key: 'password2', label: 'Confirm password', type: 'password' }
    ]
  },
  {
    id: 'organize',
    title: 'Organize PDF',
    tagline: 'Sort pages of your PDF file however you like. Delete PDF pages or add PDF pages.',
    description: 'Reorder, drop, and insert pages with qpdf page selection. Extra PDFs you add are appended in order.',
    color: '#e5322d',
    group: 'organize',
    accept: pdf,
    acceptLabel: 'PDF files',
    minFiles: 1,
    action: 'Organize PDF',
    options: [
      {
        key: 'order',
        label: 'Keep pages (blank = all, in order)',
        type: 'text',
        placeholder: '1, 3, 2, 5-8',
        hint: 'Use commas and ranges. Omitted pages are deleted.'
      }
    ]
  },
  {
    id: 'pdf-to-pdfa',
    title: 'PDF to PDF/A',
    tagline: 'Transform your PDF to PDF/A, the ISO-standardized version of PDF for long-term archiving.',
    description: 'Ghostscript PDF/A-1b conversion. Needs free disk similar to the file size.',
    color: '#c0392b',
    group: 'from-pdf',
    accept: pdf,
    acceptLabel: 'PDF files',
    minFiles: 1,
    action: 'Convert to PDF/A',
    options: []
  },
  {
    id: 'repair',
    title: 'Repair PDF',
    tagline: 'Repair a damaged PDF and recover data from corrupt PDF.',
    description: 'qpdf reconstructs the xref table; Ghostscript is used as a second-pass rewrite if needed.',
    color: '#e5322d',
    group: 'optimize',
    accept: pdf,
    acceptLabel: 'PDF files',
    minFiles: 1,
    action: 'Repair PDF',
    options: []
  },
  {
    id: 'page-numbers',
    title: 'Page numbers',
    tagline: 'Add page numbers into PDFs with ease. Choose your positions, dimensions, typography.',
    description: 'Numbers are stamped in chunks so a 100k-page file is not turned into one giant overlay PDF.',
    color: '#e07b2d',
    group: 'edit',
    accept: pdf,
    acceptLabel: 'PDF files',
    minFiles: 1,
    action: 'Add page numbers',
    options: [
      {
        key: 'position',
        label: 'Position',
        type: 'select',
        options: [
          { value: 'bottom-center', label: 'Bottom center' },
          { value: 'bottom-right', label: 'Bottom right' },
          { value: 'bottom-left', label: 'Bottom left' },
          { value: 'top-center', label: 'Top center' },
          { value: 'top-right', label: 'Top right' }
        ]
      },
      {
        key: 'format',
        label: 'Format',
        type: 'select',
        options: [
          { value: 'n', label: '1' },
          { value: 'page-n', label: 'Page 1' },
          { value: 'n-of-N', label: '1 / N' }
        ]
      },
      { key: 'start', label: 'Start from', type: 'number', min: 1, placeholder: '1' },
      { key: 'marginMm', label: 'Margin from edge (mm)', type: 'number', min: 0, placeholder: '12' }
    ]
  },
  {
    id: 'scan-to-pdf',
    title: 'Scan to PDF',
    tagline: 'Turn photos or scanner images into a clean PDF with the margins you want.',
    description: 'Same engine as JPG to PDF — A4/Letter, orientation, and margin presets. Point it at a folder of scans.',
    color: '#7a5af5',
    group: 'to-pdf',
    accept: images,
    acceptLabel: 'scan images',
    minFiles: 1,
    action: 'Create PDF',
    options: [
      {
        key: 'pageSize',
        label: 'Page size',
        type: 'select',
        options: [
          { value: 'A4', label: 'A4' },
          { value: 'Letter', label: 'US Letter' },
          { value: 'fit', label: 'Fit to image' }
        ]
      },
      {
        key: 'margin',
        label: 'Margin',
        type: 'select',
        options: [
          { value: 'small', label: 'Small (10 mm)' },
          { value: 'none', label: 'No margin' },
          { value: 'big', label: 'Big (25 mm)' }
        ]
      }
    ]
  },
  {
    id: 'ocr',
    title: 'OCR PDF',
    tagline: 'Convert scanned PDF into searchable and selectable documents.',
    description: 'Tesseract OCR, page by page, writing a hidden text layer. Process by page range on huge scans.',
    color: '#2b7cd3',
    group: 'edit',
    accept: pdf,
    acceptLabel: 'PDF files',
    minFiles: 1,
    action: 'OCR PDF',
    options: [
      { key: 'lang', label: 'Language code', type: 'text', placeholder: 'eng' },
      { key: 'pages', label: 'Pages (blank = all)', type: 'text', placeholder: '1-20' }
    ]
  },
  {
    id: 'compare',
    title: 'Compare PDF',
    tagline: 'Show a side-by-side document comparison and easily spot changes between versions.',
    description: 'Extracts text on disk and writes a readable HTML diff. Pick exactly two PDFs.',
    color: '#44546a',
    group: 'edit',
    accept: pdf,
    acceptLabel: 'PDF files',
    minFiles: 2,
    maxFiles: 2,
    action: 'Compare PDFs',
    options: []
  },
  {
    id: 'redact',
    title: 'Redact PDF',
    tagline: 'Permanently remove pages or flatten selected pages to images so content cannot be copied.',
    description: 'Blanking or rasterizing pages is done per page on disk. True word-level redaction needs flatten mode.',
    color: '#8b1e1e',
    group: 'security',
    accept: pdf,
    acceptLabel: 'PDF files',
    minFiles: 1,
    maxFiles: 1,
    action: 'Redact',
    options: [
      {
        key: 'mode',
        label: 'Mode',
        type: 'radio',
        options: [
          { value: 'blank', label: 'Replace pages with a blank page' },
          { value: 'remove', label: 'Delete pages' },
          { value: 'flatten', label: 'Rasterize pages (cannot extract text)' }
        ]
      },
      { key: 'pages', label: 'Pages', type: 'text', placeholder: '2, 5-7' }
    ]
  },
  {
    id: 'crop',
    title: 'Crop PDF',
    tagline: 'Crop margins of PDF documents or select specific areas, then apply the changes to the whole document.',
    description: 'Sets CropBox in millimetres from each edge. This is the tool to fix printer or scanner margin issues.',
    color: '#8e44ad',
    group: 'edit',
    accept: pdf,
    acceptLabel: 'PDF files',
    minFiles: 1,
    action: 'Crop PDF',
    options: [
      {
        key: 'customMargins',
        label: 'Crop margins (mm)',
        type: 'margins',
        keys: { top: 'cTop', right: 'cRight', bottom: 'cBottom', left: 'cLeft' }
      }
    ]
  },
  {
    id: 'pdf-to-markdown',
    title: 'PDF to Markdown',
    tagline: 'Turn PDFs into Markdown files. Headings, tables, lists, and links preserved when present in the text layer.',
    description: 'Uses pdftotext layout mode. For scans, run OCR first.',
    color: '#1f6feb',
    group: 'from-pdf',
    accept: pdf,
    acceptLabel: 'PDF files',
    minFiles: 1,
    action: 'Convert to Markdown',
    options: []
  }
]

export const TOOL_MAP: Record<ToolId, ToolDef> = Object.fromEntries(TOOLS.map((t) => [t.id, t])) as Record<
  ToolId,
  ToolDef
>

export function getTool(id: string | undefined): ToolDef | undefined {
  return TOOLS.find((t) => t.id === id)
}

export const ACCEPT_ALL = Array.from(new Set(docs))
