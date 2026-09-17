import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { TOOLS } from '@shared/tools'
import { Logo } from './Logo'
import { ToolIcon } from './ToolIcon'
import { apiGet } from '../lib/api'

export function Header() {
  const [convertOpen, setConvertOpen] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [engine, setEngine] = useState<'up' | 'down' | 'unknown'>('unknown')
  const location = useLocation()
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setConvertOpen(false)
    setMobile(false)
  }, [location.pathname])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!panel.current?.contains(e.target as Node)) setConvertOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  useEffect(() => {
    let cancelled = false
    apiGet<{ ok: boolean }>('/api/health')
      .then(() => {
        if (!cancelled) setEngine('up')
      })
      .catch(() => {
        if (!cancelled) setEngine('down')
      })
    return () => {
      cancelled = true
    }
  }, [location.pathname])

  const convertTo = TOOLS.filter((t) => t.group === 'to-pdf')
  const convertFrom = TOOLS.filter((t) => t.group === 'from-pdf')

  return (
    <header className="sticky top-0 z-40 border-b border-[#efeef3] bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-[58px] max-w-[1180px] items-center justify-between gap-4 px-4 sm:px-5">
        <Link to="/" className="shrink-0" aria-label="IHATE PDF home">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-6 lg:flex">
          <NavLink to="/tool/merge" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Merge PDF
          </NavLink>
          <NavLink to="/tool/split" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Split PDF
          </NavLink>
          <NavLink to="/tool/compress" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Compress PDF
          </NavLink>
          <div className="relative" ref={panel}>
            <button
              className={`nav-link inline-flex items-center gap-1 ${convertOpen ? 'active text-ilp-red' : ''}`}
              onClick={() => setConvertOpen((v) => !v)}
              aria-expanded={convertOpen}
            >
              Convert PDF
              <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
                <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </button>
            {convertOpen && (
              <div className="absolute left-1/2 top-[38px] z-50 w-[560px] -translate-x-1/2 rounded-2xl border border-[#ececef] bg-white p-5 shadow-drop">
                <div className="grid grid-cols-2 gap-6">
                  <ConvertCol title="Convert to PDF" tools={convertTo} />
                  <ConvertCol title="Convert from PDF" tools={convertFrom} />
                </div>
              </div>
            )}
          </div>
          <NavLink to="/tool/parse-pdf" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Analyze
          </NavLink>
          <NavLink to="/tools" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            All PDF Tools
          </NavLink>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <span className="hidden items-center gap-1.5 rounded-full bg-[#fff3f2] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-ilp-red sm:inline-flex">
            <span
              className={`h-1.5 w-1.5 rounded-full ${engine === 'up' ? 'bg-emerald-500' : engine === 'down' ? 'bg-amber-500' : 'bg-[#f0b3b0]'}`}
            />
            Local
          </span>
          <Link
            to="/settings"
            className="btn-ghost h-9 w-9 !px-0 text-[#5c5c66]"
            aria-label="Settings"
            title="Settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"
                stroke="currentColor"
                strokeWidth="1.7"
              />
              <path
                d="M19.4 13a7.8 7.8 0 0 0 .1-2l2-1.5-2-3.5-2.4.5a8 8 0 0 0-1.7-1L15 3h-6l-.4 2.5a8 8 0 0 0-1.7 1L6.5 6 4.5 9.5 6.6 11a7.8 7.8 0 0 0 0 2l-2 1.5 2 3.5 2.4-.5a8 8 0 0 0 1.7 1L9 21h6l.4-2.5a8 8 0 0 0 1.7-1l2.4.5 2-3.5-2.1-1.5z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
          <button className="lg:hidden" aria-label="Menu" onClick={() => setMobile((v) => !v)}>
            <svg width="22" height="16" viewBox="0 0 22 16">
              <path d="M0 1h22M0 8h22M0 15h22" stroke="#1c1c24" strokeWidth="1.8" />
            </svg>
          </button>
        </div>
      </div>
      {mobile && (
        <div className="space-y-1 border-t border-[#efeef3] px-5 py-3 text-sm font-medium lg:hidden">
          <Link className="block rounded-lg px-2 py-2 hover:bg-[#fafafa]" to="/tool/merge">
            Merge PDF
          </Link>
          <Link className="block rounded-lg px-2 py-2 hover:bg-[#fafafa]" to="/tool/split">
            Split PDF
          </Link>
          <Link className="block rounded-lg px-2 py-2 hover:bg-[#fafafa]" to="/tool/compress">
            Compress PDF
          </Link>
          <Link className="block rounded-lg px-2 py-2 hover:bg-[#fafafa]" to="/tool/parse-pdf">
            Analyze PDF
          </Link>
          <Link className="block rounded-lg px-2 py-2 hover:bg-[#fafafa]" to="/tools">
            All PDF Tools
          </Link>
          <Link className="block rounded-lg px-2 py-2 hover:bg-[#fafafa]" to="/settings">
            Settings
          </Link>
        </div>
      )}
    </header>
  )
}

function ConvertCol({ title, tools }: { title: string; tools: typeof TOOLS }) {
  return (
    <div>
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-ilp-muted">{title}</p>
      <ul className="space-y-1">
        {tools.map((t) => (
          <li key={t.id}>
            <Link
              to={`/tool/${t.id}`}
              className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-[13.5px] font-medium text-ilp-dark hover:bg-[#fafafa] hover:text-ilp-red"
            >
              <ToolIcon id={t.id} color={t.color} size={22} />
              {t.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
