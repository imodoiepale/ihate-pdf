export function Logo({
  size = 28,
  word = true,
  studio = true
}: {
  size?: number
  word?: boolean
  studio?: boolean
}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 32 28" aria-hidden="true">
        <path
          fill="#e42722"
          d="M16.1 26.4C7.4 20.2 2 14.4 2 8.7 2 4.7 5.1 2 8.8 2c2.3 0 4.3 1.2 5.5 3.1C15.5 3.2 17.5 2 19.9 2 23.6 2 26.8 4.7 26.8 8.7c0 5.7-5.4 11.5-14.1 17.7-.4.3-1 .3-1.4 0z"
        />
        <path
          fill="#fff"
          d="M16.1 22.6c-6.6-4.8-10.7-9.2-10.7-13.4 0-2.6 1.9-4.3 4.3-4.3 1.6 0 3 .9 3.8 2.4.3.6 1.1.6 1.4 0 .8-1.5 2.2-2.4 3.8-2.4 2.4 0 4.3 1.7 4.3 4.3 0 4.2-4.1 8.6-10.7 13.4-.4.3-.8.3-1.2 0z"
          opacity=".2"
        />
      </svg>
      {word && (
        <span className="flex items-baseline gap-1.5 leading-none">
          <span className="text-[20px] font-extrabold tracking-tight text-ilp-dark sm:text-[21px]">
            Love<span className="text-ilp-red">PDF</span>
          </span>
          {studio && (
            <span className="translate-y-[-1px] text-[10px] font-bold uppercase tracking-[0.18em] text-ilp-red">
              Studio
            </span>
          )}
        </span>
      )}
    </span>
  )
}
