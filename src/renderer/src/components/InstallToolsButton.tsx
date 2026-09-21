import { useState } from 'react'
import { apiPost } from '../lib/api'

export function installHint(tool = 'This tool'): string {
  return `${tool} is not installed yet. Use Settings → PDF tools → Install PDF tools, or wait for the first-launch download.`
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
  const [script, setScript] = useState<string | null>(null)
  const status = busy ? 'running' : ok === true ? 'ok' : ok === false ? 'error' : 'idle'

  async function run() {
    setBusy(true)
    setLog(null)
    setOk(null)
    try {
      const data = await apiPost<{
        ok: boolean
        message: string
        script?: string | null
        stdout?: string
        stderr?: string
        command?: string
        argv?: string[]
        status?: string
      }>('/api/install-tools', full ? { full: true } : { vendorOnly })
      setOk(data.ok)
      setScript(data.script || null)
      const bits = [data.message]
      if (data.script) bits.push(data.script)
      if (!data.ok && data.stderr) bits.push(data.stderr.slice(-280))
      else if (data.stdout) bits.push(data.stdout.trim().split('\n').slice(-4).join('\n'))
      setLog(bits.filter(Boolean).join('\n'))
      onDone?.()
    } catch (e) {
      setOk(false)
      setLog(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={compact ? 'inline-flex flex-wrap items-center gap-2' : 'mt-3 text-left'}>
      <button
        type="button"
        className="ilp-btn h-10 px-4 text-sm"
        disabled={busy}
        aria-busy={busy}
        data-install-status={status}
        onClick={() => void run()}
      >
        {busy ? 'Running…' : label || 'Install PDF tools'}
      </button>
      {status !== 'idle' && (
        <p
          className={`text-xs font-semibold uppercase tracking-wide ${
            status === 'running' ? 'text-ilp-muted' : status === 'ok' ? 'text-emerald-800' : 'text-[#5c1a16]'
          } ${compact ? '' : 'mt-2'}`}
          data-testid="install-tools-status"
        >
          {status === 'running' ? 'Status: running' : status === 'ok' ? 'Status: ok' : 'Status: error'}
        </p>
      )}
      {busy && !compact && (
        <p className="mt-2 text-xs text-ilp-muted">Silent vendor install (qpdf + Poppler). No wizard.</p>
      )}
      {script && !compact && (
        <p className="mt-2 break-all font-mono text-[11px] text-ilp-muted">{script}</p>
      )}
      {log && !compact && (
        <p className={`mt-2 whitespace-pre-wrap text-xs ${ok === false ? 'text-[#5c1a16]' : 'text-[#5c5c66]'}`}>{log}</p>
      )}
    </div>
  )
}
