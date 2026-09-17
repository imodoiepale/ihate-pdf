export function Logo({
  size = 28,
  word = true
}: {
  size?: number
  word?: boolean
}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <path
          fill="#e42722"
          d="M8 2h11l7 7v19a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3z"
        />
        <path fill="#fff" d="M19 2v7h7" opacity=".35" />
        <rect x="9" y="14" width="14" height="2.2" rx="1.1" fill="#fff" />
        <rect x="9" y="18.5" width="14" height="2.2" rx="1.1" fill="#fff" />
        <rect x="9" y="23" width="9" height="2.2" rx="1.1" fill="#fff" />
      </svg>
      {word && (
        <span className="flex items-baseline leading-none">
          <span className="text-[20px] font-extrabold tracking-tight text-ilp-dark sm:text-[21px]">
            IHATE<span className="text-ilp-red"> PDF</span>
          </span>
        </span>
      )}
    </span>
  )
}
