import { Link } from 'react-router-dom'
import { GROUPS, TOOLS } from '@shared/tools'
import { Logo } from './Logo'

export function Footer() {
  return (
    <footer className="mt-auto border-t border-[#efeef3] bg-[#fafafa] pt-12 pb-8 text-sm text-[#5c5c66]">
      <div className="mx-auto grid max-w-[1180px] gap-10 px-5 md:grid-cols-4">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs leading-relaxed">
            Desktop PDF tools that run on your disk. Merge, split, compress, convert, crop margins, and batch
            hundreds of files — including documents too large for a browser upload.
          </p>
        </div>
        {GROUPS.slice(0, 3).map((g) => (
          <div key={g.id}>
            <p className="mb-3 font-semibold text-ilp-dark">{g.label}</p>
            <ul className="space-y-2">
              {TOOLS.filter((t) => t.group === g.id)
                .slice(0, 6)
                .map((t) => (
                  <li key={t.id}>
                    <Link className="hover:text-ilp-red" to={`/tool/${t.id}`}>
                      {t.title}
                    </Link>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mx-auto mt-10 max-w-[1180px] px-5 text-xs text-[#8a8a93]">
        LovePDF Desktop processes files locally with qpdf, Ghostscript, Poppler, LibreOffice and Tesseract. Nothing
        is uploaded. Inspired by iLovePDF’s product layout.
      </p>
    </footer>
  )
}
