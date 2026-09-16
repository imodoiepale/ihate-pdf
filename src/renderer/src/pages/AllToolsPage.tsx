import { useMemo, useState } from 'react'
import { GROUPS, TOOLS } from '@shared/tools'
import { ToolCard } from '../components/ToolCard'

export function AllToolsPage() {
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  const groups = useMemo(() => {
    return GROUPS.map((g) => ({
      ...g,
      tools: TOOLS.filter((t) => {
        if (t.group !== g.id) return false
        if (!query) return true
        return `${t.title} ${t.tagline} ${t.description}`.toLowerCase().includes(query)
      })
    })).filter((g) => g.tools.length)
  }, [query])

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-10 sm:py-12">
      <h1 className="text-center text-[28px] font-extrabold tracking-tight text-ilp-dark sm:text-3xl">
        All PDF tools
      </h1>
      <p className="mx-auto mt-2 max-w-xl text-center text-[15px] text-[#5c5c66]">
        The full desktop studio. Pick a tool, drop files, and process them on disk.
      </p>
      <div className="mx-auto mt-6 max-w-md">
        <input
          className="field"
          placeholder="Search tools…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search tools"
        />
      </div>
      {groups.length === 0 ? (
        <p className="mt-16 text-center text-sm text-ilp-muted">No tools match “{q}”.</p>
      ) : (
        groups.map((g) => (
          <section key={g.id} className="mt-10 sm:mt-12">
            <h2 className="mb-5 text-[15px] font-bold tracking-tight text-ilp-dark">{g.label}</h2>
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
              {g.tools.map((tool) => (
                <ToolCard key={tool.id} tool={tool} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
