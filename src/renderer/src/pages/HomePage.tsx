import { TOOLS } from '@shared/tools'
import { ToolCard } from '../components/ToolCard'

export function HomePage() {
  return (
    <div>
      <section className="mx-auto max-w-[760px] px-5 pb-6 pt-14 text-center">
        <h1 className="text-[34px] font-bold leading-tight text-ilp-dark sm:text-[40px]">
          Every tool you need to work with PDFs in one place
        </h1>
        <p className="mx-auto mt-5 max-w-[640px] text-[16px] leading-relaxed text-[#5c5c66]">
          Every tool you need to use PDFs, at your fingertips. Merge, split, compress, convert, rotate, unlock and
          watermark PDFs with just a few clicks — 100% on this computer. No upload caps, no page limits, no cloud
          storage. Built for huge documents and batch jobs.
        </p>
      </section>

      <section className="mx-auto grid max-w-[1100px] grid-cols-2 gap-x-8 gap-y-10 px-5 pb-16 sm:grid-cols-3 lg:grid-cols-6">
        {TOOLS.map((tool) => (
          <ToolCard key={tool.id} tool={tool} />
        ))}
      </section>

      <section className="bg-[#fff7f6] py-14">
        <div className="mx-auto grid max-w-[1100px] gap-8 px-5 md:grid-cols-3">
          <Feature
            title="Work offline on the desktop"
            body="Batch edit and manage documents locally, with no internet and no file-size ceiling besides your disk."
          />
          <Feature
            title="Margins, storage, many PDFs"
            body="Crop or add margins in millimetres. Process hundreds of files in a queue. Outputs land in your LovePDF folder — not someone else’s cloud."
          />
          <Feature
            title="Huge documents stay on disk"
            body="A 1 TB PDF is streamed and concatenated with qpdf. The app never tries to load the whole file into JavaScript memory."
          />
        </div>
      </section>
    </div>
  )
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h2 className="text-lg font-bold text-ilp-dark">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-[#5c5c66]">{body}</p>
    </div>
  )
}
