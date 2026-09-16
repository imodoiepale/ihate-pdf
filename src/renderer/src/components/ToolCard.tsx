import { Link } from 'react-router-dom'
import type { ToolDef } from '@shared/types'
import { ToolIcon } from './ToolIcon'

export function ToolCard({ tool }: { tool: ToolDef }) {
  return (
    <Link
      to={`/tool/${tool.id}`}
      className="group flex flex-col items-start rounded-2xl p-2.5 text-left transition hover:bg-[#fafafa]"
    >
      <span className="transition duration-200 group-hover:-translate-y-0.5 group-hover:shadow-card">
        <ToolIcon id={tool.id} color={tool.color} size={52} />
      </span>
      <h3 className="mt-2.5 text-[14.5px] font-bold leading-snug tracking-tight text-ilp-dark group-hover:text-ilp-red">
        {tool.title}
      </h3>
      <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-[#7a7a82]">{tool.tagline}</p>
    </Link>
  )
}
