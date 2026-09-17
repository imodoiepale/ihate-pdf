import { Link } from 'react-router-dom'
import { GROUPS, TOOLS } from '@shared/tools'
import { Logo } from './Logo'

export function Footer() {
  return (
    <footer className="mt-auto border-t border-[#efeef3] bg-[#fafafa] pt-12 pb-8 text-sm text-[#5c5c66]">
      <div className="mx-auto grid max-w-[1180px] gap-10 px-5 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-[13.5px] leading-relaxed">
            Desktop PDF tools that run on your disk. Merge, split, compress, convert, crop, and batch hundreds of
            files — including documents too large for a browser tab.
          </p>
        </div>
        {GROUPS.slice(0, 3).map((g) => (
          <div key={g.id}>
            <p className="mb-3 text-[13px] font-bold tracking-tight text-ilp-dark">{g.label}</p>
            <ul className="space-y-2">
              {TOOLS.filter((t) => t.group === g.id)
                .slice(0, 6)
                .map((t) => (
                  <li key={t.id}>
                    <Link className="text-[13.5px] hover:text-ilp-red" to={`/tool/${t.id}`}>
                      {t.title}
                    </Link>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-10 flex max-w-[1180px] flex-col gap-2 px-5 text-[12px] text-[#8a8a93] sm:flex-row sm:items-center sm:justify-between">
        <p>i hate pdf processes files locally with qpdf, Ghostscript, Poppler, LibreOffice, and Tesseract.</p>
        <p>
          <Link to="/settings" className="hover:text-ilp-red">
            Settings
          </Link>
          <span className="mx-2">·</span>
          Independent open-source software. Not affiliated with iLovePDF.
        </p>
      </div>
    </footer>
  )
}
