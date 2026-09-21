import { PRODUCT_NAME, WORDMARK_LEAD, WORDMARK_REST } from '@shared/brand'

/** Product wordmark: red lowercase i, then dark “ hate pdf”. */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span
      className={`font-extrabold tracking-tight leading-none ${className}`}
      style={{ textTransform: 'none' }}
      data-testid="wordmark"
      aria-label={PRODUCT_NAME}
    >
      <span className="text-ilp-red">{WORDMARK_LEAD}</span>
      <span className="text-ilp-dark">{WORDMARK_REST}</span>
    </span>
  )
}
