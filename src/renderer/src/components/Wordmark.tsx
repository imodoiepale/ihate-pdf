/** Product wordmark: red i, then dark “ hate pdf”. Lowercase, three words. */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span
      className={`font-extrabold tracking-tight leading-none ${className}`}
      style={{ textTransform: 'none' }}
    >
      <span className="text-ilp-red">i</span>
      <span className="text-ilp-dark"> hate pdf</span>
    </span>
  )
}
