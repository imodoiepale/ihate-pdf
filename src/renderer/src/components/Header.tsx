import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { TOOLS } from '@shared/tools'
import { Logo } from './Logo'

export function Header() {
  const [convertOpen, setConvertOpen] = useState(false)
  const [mobile, setMobile] = useState(false)
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

  const convertTo = TOOLS.filter((t) => t.group === 'to-pdf')
  const convertFrom = TOOLS.filter((t) => t.group === 'from-pdf')

  return (
    <header className="sticky top-0 z-40 border-b border-[#efeef3] bg-white">
      <div className="mx-auto flex h-[70px] max-w-[1180px] items-center justify-between px-5">
        <Link to="/" className="shrink-0" aria-label="LovePDF home">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-7 text-[14px] font-medium text-[#4b4b53] lg:flex">
          <NavLink
            to="/tool/merge"
            className={({ isActive }) => (isActive ? 'text-ilp-red' : 'hover:text-ilp-red')}
          >
            Merge PDF
          </NavLink>
          <NavLink
            to="/tool/split"
            className={({ isActive }) => (isActive ? 'text-ilp-red' : 'hover:text-ilp-red')}
          >
            Split PDF
          </NavLink>
          <NavLink
            to="/tool/compress"
            className={({ isActive }) => (isActive ? 'text-ilp-red' : 'hover:text-ilp-red')}
          >
            Compress PDF
          </NavLink>
          <div className="relative" ref={panel}>
            <button
              className={`inline-flex items-center gap-1 hover:text-ilp-red ${convertOpen ? 'text-ilp-red' : ''}`}
              onClick={() => setConvertOpen((v) => !v)}
            >
              Convert PDF
              <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
                <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </button>
            {convertOpen && (
              <div className="absolute left-1/2 top-[42px] z-50 w-[520px] -translate-x-1/2 rounded-xl border border-[#ececef] bg-white p-5 shadow-drop">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ilp-muted">
                      Convert to PDF
                    </p>
                    <ul className="space-y-2">
                      {convertTo.map((t) => (
                        <li key={t.id}>
                          <Link to={`/tool/${t.id}`} className="text-[14px] text-ilp-dark hover:text-ilp-red">
                            {t.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ilp-muted">
                      Convert from PDF
                    </p>
                    <ul className="space-y-2">
                      {convertFrom.map((t) => (
                        <li key={t.id}>
                          <Link to={`/tool/${t.id}`} className="text-[14px] text-ilp-dark hover:text-ilp-red">
                            {t.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
          <NavLink
            to="/tools"
            className={({ isActive }) => (isActive ? 'text-ilp-red' : 'hover:text-ilp-red')}
          >
            All PDF Tools
          </NavLink>
        </nav>

        <div className="flex items-center gap-3">
          <span className="hidden rounded-full bg-[#fff3f2] px-3 py-1 text-xs font-semibold text-ilp-red sm:inline">
            Local · No limits
          </span>
          <button className="lg:hidden" aria-label="Menu" onClick={() => setMobile((v) => !v)}>
            <svg width="22" height="16" viewBox="0 0 22 16">
              <path d="M0 1h22M0 8h22M0 15h22" stroke="#33333b" strokeWidth="1.8" />
            </svg>
          </button>
        </div>
      </div>
      {mobile && (
        <div className="space-y-3 border-t border-[#efeef3] px-5 py-4 lg:hidden">
          <Link className="block" to="/tool/merge">
            Merge PDF
          </Link>
          <Link className="block" to="/tool/split">
            Split PDF
          </Link>
          <Link className="block" to="/tool/compress">
            Compress PDF
          </Link>
          <Link className="block" to="/tools">
            All PDF Tools
          </Link>
        </div>
      )}
    </header>
  )
}
