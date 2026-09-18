import { useState } from 'react'
import { apiPost } from '../lib/api'

export function installHint(tool = 'This tool'): string {
  return `${tool} needs a local CLI that is missing. Use Install missing tools, or run scripts/install-pending.sh (macOS/Linux) / scripts/install-pending.ps1 (Windows). The app searches bundled resources, then ~/.local/share/ihate-pdf/bin (Linux), %LOCALAPPDATA%\\ihate-pdf\\bin (Windows), or ~/Library/Application Support/ihate-pdf/bin (macOS), then PATH.`
}

export function InstallToolsButton({
  onDone,
  vendorOnly = false,
  label
}: {
  onDone?: () => void
  vendorOnly?: boolean
  label?: string
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
      }>('/api/install-tools', { vendorOnly })
      setOk(data.ok)
      const parts = [data.message, data.stdout, data.stderr].filter(Boolean)
      setLog(parts.join('\n').trim())
      onDone?.()
    } catch (e) {
      setOk(false)
      setLog(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 text-left">
      <button className="ilp-btn h-10 px-4 text-sm" disabled={busy} onClick={() => void run()}>
        {busy ? 'Installing…' : label || 'Install missing tools'}
      </button>
      {busy && (
        <p className="mt-2 text-xs text-ilp-muted">
          Downloading vendor binaries and installing only what is missing. This can take a few minutes.
        </p>
      )}
      {log && (
        <pre
          className={`mt-3 max-h-48 overflow-auto rounded-xl p-3 font-mono text-[11px] leading-relaxed ${
            ok === false ? 'bg-[#fff3f2] text-[#5c1a16]' : 'bg-[#f6f6f8] text-[#333]'
          }`}
        >
          {log}
        </pre>
      )}
    </div>
  )
}
