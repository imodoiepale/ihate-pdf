import { Link } from 'react-router-dom'
import type { ToolDef } from '@shared/types'
import { ToolIcon } from './ToolIcon'

export function ToolCard({ tool }: { tool: ToolDef }) {
  return (
    <Link to={`/tool/${tool.id}`} className="group flex flex-col items-start rounded-xl p-2 text-left hover:bg-[#fafafa]">
      <ToolIcon id={tool.id} color={tool.color} />
      <h3 className="mt-3 text-[16px] font-bold text-ilp-dark group-hover:text-ilp-red">{tool.title}</h3>
      <p className="mt-1 text-[13px] leading-snug text-[#7a7a82]">{tool.tagline}</p>
    </Link>
  )
}
