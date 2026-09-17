/** Product wordmark: red I, dark remainder. Use for chrome — not body copy. */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-extrabold tracking-tight leading-none ${className}`}>
      <span className="text-ilp-red">I</span>
      <span className="text-ilp-dark">HATE PDF</span>
    </span>
  )
}
