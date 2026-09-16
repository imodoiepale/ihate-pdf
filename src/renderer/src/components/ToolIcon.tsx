import { useId, type ReactNode } from 'react'
import type { ToolId } from '@shared/types'

function glyph(id: ToolId): ReactNode {
  if (id.includes('word')) return <DocLines mark="W" />
  if (id.includes('ppt')) return <DocLines mark="P" />
  if (id.includes('excel')) return <GridIcon />
  if (id === 'pdf-to-jpg' || id === 'jpg-to-pdf') return <ImageIcon />
  if (id === 'pdf-to-markdown') return <MdIcon />
  if (id === 'pdf-to-pdfa') return <ArchiveIcon />
  if (id === 'page-numbers') return <NumbersIcon />
  if (id === 'html-to-pdf') return <CodeIcon />
  if (id === 'edit-pdf') return <EditIcon />
  if (id === 'scan-to-pdf') return <ScanIcon />
  if (id === 'sign-pdf') return <SignIcon />
  switch (id) {
    case 'merge':
      return <MergeIcon />
    case 'split':
      return <SplitIcon />
    case 'compress':
      return <CompressIcon />
    case 'extract':
      return <ExtractIcon />
    case 'delete-pages':
      return <DeleteIcon />
    case 'watermark':
      return <WatermarkIcon />
    case 'rotate':
      return <RotateIcon />
    case 'unlock':
      return <UnlockIcon />
    case 'protect':
      return <ProtectIcon />
    case 'organize':
      return <OrganizeIcon />
    case 'repair':
      return <RepairIcon />
    case 'ocr':
      return <OcrIcon />
    case 'compare':
      return <CompareIcon />
    case 'redact':
      return <RedactIcon />
    case 'crop':
      return <CropIcon />
    case 'parse-pdf':
      return <SearchIcon />
    case 'extract-bank':
      return <BankIcon />
    case 'extract-mpesa':
      return <MpesaIcon />
    case 'extract-invoice':
      return <InvoiceIcon />
    case 'extract-anything':
      return <AnythingIcon />
    case 'ask-pdf':
      return <ChatIcon />
    case 'summarize-pdf':
      return <SummaryIcon />
    case 'translate-pdf':
      return <TranslateIcon />
    case 'pdf-forms':
      return <FormIcon />
    case 'extract-images':
      return <ImageIcon />
    default:
      return <MergeIcon />
  }
}

const stroke = {
  fill: 'none',
  stroke: '#fff',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const
}

function MergeIcon() {
  return (
    <g {...stroke}>
      <path d="M7 10h11M7 16h15" />
      <path d="M20 7.5l5 3.5-5 3.5" />
    </g>
  )
}

function SplitIcon() {
  return (
    <g {...stroke}>
      <rect x="7" y="7" width="8" height="18" rx="1.4" />
      <rect x="17.5" y="7" width="8" height="8" rx="1.4" />
      <rect x="17.5" y="17" width="8" height="8" rx="1.4" />
    </g>
  )
}

function CompressIcon() {
  return (
    <g {...stroke}>
      <rect x="8" y="6" width="16" height="5" rx="1.2" />
      <rect x="10" y="13" width="12" height="5" rx="1.2" />
      <rect x="12" y="20" width="8" height="5" rx="1.2" />
    </g>
  )
}

function ExtractIcon() {
  return (
    <g {...stroke}>
      <rect x="7" y="7" width="12" height="18" rx="1.4" />
      <path d="M21 12v8M18 17l3 3 3-3" />
    </g>
  )
}

function DeleteIcon() {
  return (
    <g {...stroke}>
      <path d="M9 10h14l-1.4 13H10.4z" />
      <path d="M12 10V8h8v2M7 10h18" />
    </g>
  )
}

function DocLines({ mark }: { mark: string }) {
  return (
    <g>
      <rect x="8" y="6" width="16" height="20" rx="2" fill="none" stroke="#fff" strokeWidth="1.7" />
      <path d="M11 14h10M11 18h8" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
      <text x="16" y="12" textAnchor="middle" fill="#fff" fontSize="7" fontWeight="700" fontFamily="inherit">
        {mark}
      </text>
    </g>
  )
}

function GridIcon() {
  return (
    <g {...stroke}>
      <rect x="8" y="8" width="16" height="16" rx="1.5" />
      <path d="M8 13.3h16M8 18.7h16M13.3 8v16M18.7 8v16" />
    </g>
  )
}

function ImageIcon() {
  return (
    <g {...stroke}>
      <rect x="7" y="9" width="18" height="14" rx="2" />
      <circle cx="12" cy="14" r="1.6" fill="#fff" stroke="none" />
      <path d="M10 20l4-5 3 3 2-2 4 4" />
    </g>
  )
}

function MdIcon() {
  return (
    <g {...stroke}>
      <rect x="7" y="8" width="18" height="16" rx="2" />
      <path d="M11 13l2 5 2-5 2 6" />
    </g>
  )
}

function ArchiveIcon() {
  return (
    <g {...stroke}>
      <rect x="8" y="7" width="16" height="18" rx="2" />
      <path d="M12 12h8M12 16h8M12 20h5" />
    </g>
  )
}

function NumbersIcon() {
  return (
    <g {...stroke}>
      <rect x="8" y="7" width="5" height="5" rx="1" />
      <path d="M16 8.5h8" />
      <rect x="8" y="16" width="5" height="5" rx="1" />
      <path d="M16 17.5h8" />
    </g>
  )
}

function CodeIcon() {
  return (
    <g {...stroke}>
      <path d="M13 8l-6 8 6 8M19 8l6 8-6 8" />
    </g>
  )
}

function EditIcon() {
  return (
    <g {...stroke}>
      <path d="M8 22l13-13 3 3-13 13H8v-3z" />
      <path d="M18 12l3 3" />
    </g>
  )
}

function ScanIcon() {
  return (
    <g {...stroke}>
      <rect x="7" y="10" width="18" height="12" rx="2" />
      <path d="M10 7h12M11 16h10" />
    </g>
  )
}

function SignIcon() {
  return (
    <g {...stroke}>
      <path d="M7 20c4-8 8-8 12-2 2 3 5 3 8 0" />
      <path d="M8 23h16" />
    </g>
  )
}

function WatermarkIcon() {
  return (
    <g {...stroke}>
      <rect x="8" y="7" width="16" height="18" rx="2" />
      <path d="M12 16h8M16 12v8" opacity="0.9" />
    </g>
  )
}

function RotateIcon() {
  return (
    <g {...stroke}>
      <path d="M16 8a8 8 0 1 1-7.5 5" />
      <path d="M9 7v5h5" />
    </g>
  )
}

function UnlockIcon() {
  return (
    <g {...stroke}>
      <rect x="9" y="15" width="14" height="9" rx="1.6" />
      <path d="M12 15v-3.2a4 4 0 0 1 7.6-1.6" />
    </g>
  )
}

function ProtectIcon() {
  return (
    <g {...stroke}>
      <path d="M16 6l10 4v7c0 6-4.5 9-10 11C10.5 26 6 23 6 17V10z" />
    </g>
  )
}

function OrganizeIcon() {
  return (
    <g {...stroke}>
      <rect x="7" y="7" width="8" height="8" rx="1.4" />
      <rect x="17" y="17" width="8" height="8" rx="1.4" />
      <rect x="7" y="17" width="7" height="7" rx="1.4" />
    </g>
  )
}

function RepairIcon() {
  return (
    <g {...stroke}>
      <path d="M20 8l4 4-9 9-4-4 9-9z" />
      <path d="M8 23h8" />
    </g>
  )
}

function OcrIcon() {
  return (
    <g {...stroke}>
      <rect x="8" y="7" width="16" height="18" rx="2" />
      <path d="M12 13h8M12 17h6" />
    </g>
  )
}

function CompareIcon() {
  return (
    <g {...stroke}>
      <rect x="6" y="7" width="9" height="18" rx="1.4" />
      <rect x="17" y="7" width="9" height="18" rx="1.4" />
    </g>
  )
}

function RedactIcon() {
  return (
    <g {...stroke}>
      <rect x="7" y="8" width="18" height="16" rx="2" />
      <path d="M10 16h12" strokeWidth="3" />
    </g>
  )
}

function CropIcon() {
  return (
    <g {...stroke}>
      <rect x="9" y="10" width="13" height="12" rx="1.2" />
      <path d="M6 7v6h6M21 17h5v6" />
    </g>
  )
}

function SearchIcon() {
  return (
    <g {...stroke}>
      <circle cx="14" cy="14" r="6" />
      <path d="M18.5 18.5L24 24" />
    </g>
  )
}

function BankIcon() {
  return (
    <g {...stroke}>
      <path d="M16 7l10 5H6z" />
      <path d="M8 14v7M13 14v7M19 14v7M24 14v7M7 22h18" />
    </g>
  )
}

function MpesaIcon() {
  return (
    <g {...stroke}>
      <rect x="7" y="8" width="18" height="16" rx="2" />
      <path d="M10 13h12M10 17h8" />
      <circle cx="22" cy="20" r="1.4" fill="#fff" stroke="none" />
    </g>
  )
}

function AnythingIcon() {
  return (
    <g {...stroke}>
      <circle cx="16" cy="16" r="8" />
      <path d="M16 10v12M10 16h12" />
    </g>
  )
}

function InvoiceIcon() {
  return (
    <g {...stroke}>
      <path d="M10 7h12v18H10z" />
      <path d="M13 12h6M13 16h6M13 20h4" />
    </g>
  )
}

function ChatIcon() {
  return (
    <g {...stroke}>
      <rect x="7" y="8" width="14" height="10" rx="2" />
      <path d="M11 18l-2 5 6-5h8" />
    </g>
  )
}

function SummaryIcon() {
  return (
    <g {...stroke}>
      <rect x="8" y="7" width="16" height="18" rx="2" />
      <path d="M12 12h8M12 16h8M12 20h5" />
    </g>
  )
}

function TranslateIcon() {
  return (
    <g {...stroke}>
      <path d="M8 12h16M16 8v14" />
      <path d="M10 20c2-6 10-6 12 0" />
    </g>
  )
}

function FormIcon() {
  return (
    <g {...stroke}>
      <rect x="8" y="7" width="16" height="18" rx="2" />
      <path d="M12 12h8M12 16l2 2 4-4" />
    </g>
  )
}

export function ToolIcon({ id, color, size = 56 }: { id: ToolId; color: string; size?: number }) {
  const gid = useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.08" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={color} />
      <rect width="32" height="32" rx="9" fill={`url(#${gid})`} />
      {glyph(id)}
    </svg>
  )
}
