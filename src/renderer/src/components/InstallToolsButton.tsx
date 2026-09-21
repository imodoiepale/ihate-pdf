import { useState } from 'react'
import { apiPost } from '../lib/api'

export function installHint(tool = 'This tool'): string {
  return `${tool} is not installed yet. Core PDF tools (qpdf + Poppler) download automatically on first launch.`
}

export function InstallToolsButton({
  onDone,
  vendorOnly = true,
  full = false,
  label,
  compact = false
}: {
  onDone?: () => void
  vendorOnly?: boolean
  full?: boolean
  label?: string
  compact?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string | null>(null)
  const [ok, setOk] = useState<boolean | null>(null)

  async function run() {
    setBusy(true)
    setLog(null)
    setOk(null)
    try {
      const data = await apiPost<{
        ok: boolean
        message: string
        stdout?: string
        stderr?: string
      }>('/api/install-tools', full ? { full: true } : { vendorOnly })
      setOk(data.ok)
      setLog(data.message || (data.ok ? 'Tools ready.' : 'Could not finish.'))
      onDone?.()
    } catch (e) {
      setOk(false)
      setLog(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={compact ? 'inline-flex items-center gap-2' : 'mt-3 text-left'}>
      <button className="ilp-btn h-10 px-4 text-sm" disabled={busy} onClick={() => void run()}>
        {busy ? 'Downloading…' : label || 'Download qpdf + Poppler'}
      </button>
      {busy && !compact && (
        <p className="mt-2 text-xs text-ilp-muted">Downloading PDF tools…</p>
      )}
      {log && !compact && (
        <p className={`mt-2 text-xs ${ok === false ? 'text-[#5c1a16]' : 'text-[#5c5c66]'}`}>{log}</p>
      )}
    </div>
  )
}
