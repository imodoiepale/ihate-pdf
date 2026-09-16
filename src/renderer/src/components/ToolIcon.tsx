import type { ToolId } from '@shared/types'

const icons: Record<string, string> = {
  merge: 'M6 8h10v3H6zM6 13h14v3H6zM6 18h8v3H6z M20 7l5 4-5 4',
  split: 'M7 6h8v16H7zM17 6h8v7h-8zM17 15h8v7h-8z',
  compress: 'M8 4h16v5H8zM10 11h12v5H10zM12 18h8v5H12z',
  word: 'M7 5h18v18H7z M11 10l2.2 10 2.3-7 2.3 7L20 10',
  ppt: 'M7 5h18v18H7z M12 12h6l-3 8',
  excel: 'M7 5h18v18H7z M12 11h8M12 16h8M12 21h5',
  edit: 'M8 20l12-12 3 3-12 12H8v-3z',
  jpg: 'M6 8h20v14H6z M9 18l4-5 3 4 2-2 5 3',
  sign: 'M6 20c4-8 8-8 12-2 2 3 5 3 8 0 M8 22h16',
  watermark: 'M8 7h16v14H8z M12 14h8',
  rotate: 'M16 7a9 9 0 1 1-8 4 M8 6v5h5',
  html: 'M8 6l-2 10 10 6 10-6-2-10H8z',
  unlock: 'M10 14V10a6 6 0 1 1 12 0v1 M8 15h16v9H8z',
  protect: 'M16 5l10 4v7c0 6-4.5 9-10 11C10.5 25 6 22 6 16V9z',
  organize: 'M8 7h8v8H8zM16 17h8v8h-8zM8 17h6v6H8z',
  pdfa: 'M8 5h16v20H8z M12 10h8M12 15h8',
  repair: 'M20 8l4 4-8 8-4-4 8-8zM8 22h8',
  numbers: 'M8 6h4v4H8zM16 6h8v3h-8zM8 14h4v4H8zM16 14h8v3h-8z',
  scan: 'M7 9h18v12H7z M10 6h12 M11 13h10',
  ocr: 'M8 7h16v14H8z M12 12h8M12 16h6',
  compare: 'M6 7h9v18H6zM17 7h9v18h-9z',
  redact: 'M7 8h18v12H7z M10 14h12',
  crop: 'M8 10h14v12H8z M6 6v6h6 M20 16h6v6',
  md: 'M7 8h18v14H7z M11 12l2 4 2-4 2 6'
}

function glyph(id: ToolId): string {
  if (id.includes('word')) return icons.word
  if (id.includes('ppt')) return icons.ppt
  if (id.includes('excel')) return icons.excel
  if (id === 'pdf-to-jpg' || id === 'jpg-to-pdf') return icons.jpg
  if (id === 'pdf-to-markdown') return icons.md
  if (id === 'pdf-to-pdfa') return icons.pdfa
  if (id === 'page-numbers') return icons.numbers
  if (id === 'html-to-pdf') return icons.html
  if (id === 'edit-pdf') return icons.edit
  if (id === 'scan-to-pdf') return icons.scan
  if (id === 'sign-pdf') return icons.sign
  return icons[id] || icons.merge
}

export function ToolIcon({ id, color, size = 64 }: { id: ToolId; color: string; size?: number }) {
  const d = glyph(id)
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill={color} />
      <path
        d={d}
        fill="none"
        stroke="#fff"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="scale(.72) translate(6 5)"
      />
    </svg>
  )
}
