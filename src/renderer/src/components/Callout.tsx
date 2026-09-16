import type { ReactNode } from 'react'

export function Callout({
  tone = 'info',
  title,
  children
}: {
  tone?: 'info' | 'warn' | 'danger' | 'ok'
  title?: string
  children: ReactNode
}) {
  const styles = {
    info: 'border-sky-200 bg-white text-sky-950',
    warn: 'border-amber-200 bg-amber-50 text-amber-950',
    danger: 'border-red-200 bg-white text-red-800',
    ok: 'border-emerald-200 bg-white text-emerald-950'
  }[tone]
  return (
    <div className={`rounded-2xl border px-4 py-3 text-[13.5px] leading-relaxed ${styles}`}>
      {title && <p className="mb-0.5 font-semibold">{title}</p>}
      {children}
    </div>
  )
}

export function EmptyDrop({
  icon,
  action,
  hint,
  extra
}: {
  icon: ReactNode
  action: ReactNode
  hint: string
  extra?: ReactNode
}) {
  return (
    <div className="drop-dash rounded-2xl px-6 py-14 text-center">
      <div className="mx-auto mb-5 flex justify-center">{icon}</div>
      {action}
      <p className="mt-3 text-sm text-ilp-muted">{hint}</p>
      {extra}
    </div>
  )
}

export function LoadingBar({ message, percent }: { message: string; percent: number }) {
  return (
    <div className="surface mt-6 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ilp-dark">{message}</p>
        <span className="text-xs font-bold tabular-nums text-ilp-muted">{Math.round(percent)}%</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#ececef]">
        <div className="h-full rounded-full bg-ilp-red transition-all" style={{ width: `${Math.max(6, percent)}%` }} />
      </div>
    </div>
  )
}
