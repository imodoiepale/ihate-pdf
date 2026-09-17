import { Link } from 'react-router-dom'
import { GROUPS, TOOLS } from '@shared/tools'
import { ToolCard } from '../components/ToolCard'

export function HomePage() {
  return (
    <div>
      <section className="mx-auto max-w-[760px] px-5 pb-4 pt-12 text-center sm:pt-16">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-ilp-red">IHATE PDF</p>
        <h1 className="mt-3 text-[30px] font-extrabold leading-[1.12] tracking-tightest text-ilp-dark sm:text-[42px]">
          Every PDF tool you need, on this computer
        </h1>
        <p className="mx-auto mt-4 max-w-[600px] text-[15px] leading-relaxed text-[#5c5c66] sm:text-[16px]">
          A local-first PDF studio that drops iLovePDF-style upload caps, quotas, and accounts. Merge, split,
          compress, convert, crop, protect, and batch-process documents on disk. A 1&nbsp;TB file is limited by disk
          space and time — not by a browser heap.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-[12px] font-semibold text-[#5c5c66]">
          <Pill>On-device</Pill>
          <Pill>No file-size cap</Pill>
          <Pill>BYO LLM keys</Pill>
          <Pill>MCP-ready</Pill>
        </div>
      </section>

      <nav className="mx-auto mb-6 flex max-w-[1100px] flex-wrap justify-center gap-1.5 px-5">
        {GROUPS.map((g) => (
          <a
            key={g.id}
            href={`#group-${g.id}`}
            className="rounded-full border border-[#ececef] bg-white px-3 py-1 text-[12px] font-semibold text-[#5c5c66] transition hover:border-ilp-red/40 hover:text-ilp-red"
          >
            {g.label.replace(' PDF', '')}
          </a>
        ))}
      </nav>

      {GROUPS.map((g) => {
        const tools = TOOLS.filter((t) => t.group === g.id)
        if (!tools.length) return null
        return (
          <section key={g.id} id={`group-${g.id}`} className="mx-auto max-w-[1100px] px-5 pb-10">
            <h2 className="mb-4 text-[13px] font-bold uppercase tracking-[0.14em] text-ilp-muted">{g.label}</h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-6">
              {tools.map((tool) => (
                <ToolCard key={tool.id} tool={tool} />
              ))}
            </div>
          </section>
        )
      })}

      <section className="bg-ilp-wash py-14">
        <div className="mx-auto grid max-w-[1100px] gap-8 px-5 md:grid-cols-3">
          <Feature
            title="Work offline on the desktop"
            body="Batch edit and manage documents locally, with no internet and no file-size ceiling besides your disk."
          />
          <Feature
            title="Margins, storage, many PDFs"
            body="Crop or add margins in millimetres. Process hundreds of files in a queue. Outputs land in your IHATE PDF folder — not someone else’s cloud."
          />
          <Feature
            title="Huge documents stay on disk"
            body="A 1 TB PDF is streamed and concatenated with qpdf. The app never tries to load the whole file into JavaScript memory."
          />
        </div>
        <div className="mx-auto mt-10 max-w-[1100px] px-5">
          <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-[#f0d2cf] bg-white px-6 py-5 sm:flex-row sm:items-center">
            <div>
              <p className="text-[15px] font-bold text-ilp-dark">Bring your own models</p>
              <p className="mt-1 max-w-xl text-[13.5px] text-[#5c5c66]">
                OpenRouter, OpenAI, Anthropic, or any OpenAI-compatible endpoint. Keys stay on this machine and
                power analysis tools without an IHATE PDF account.
              </p>
            </div>
            <Link to="/settings" className="btn-primary shrink-0">
              Open Settings
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}

function Pill({ children }: { children: string }) {
  return (
    <span className="rounded-full border border-[#ececef] bg-white px-3 py-1 shadow-sm">{children}</span>
  )
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h2 className="text-[16px] font-bold tracking-tight text-ilp-dark">{title}</h2>
      <p className="mt-2 text-[13.5px] leading-relaxed text-[#5c5c66]">{body}</p>
    </div>
  )
}
