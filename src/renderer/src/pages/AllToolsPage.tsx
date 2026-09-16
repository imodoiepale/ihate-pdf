import { GROUPS, TOOLS } from '@shared/tools'
import { ToolCard } from '../components/ToolCard'

export function AllToolsPage() {
  return (
    <div className="mx-auto max-w-[1100px] px-5 py-12">
      <h1 className="text-center text-3xl font-bold text-ilp-dark">All PDF tools</h1>
      <p className="mx-auto mt-3 max-w-xl text-center text-[#5c5c66]">
        The full desktop toolbox. Pick a tool, drop files, and process them on disk.
      </p>
      {GROUPS.map((g) => (
        <section key={g.id} className="mt-12">
          <h2 className="mb-6 text-xl font-bold text-ilp-dark">{g.label}</h2>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-6">
            {TOOLS.filter((t) => t.group === g.id).map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
