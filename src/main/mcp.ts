import { resolve as resolvePath } from 'node:path'
import { existsSync } from 'node:fs'
import { defaultOutputDir, defaultTmp } from './paths'
import { askParsed, extractEngines } from './extract'

export const MCP_TOOLS = [
  {
    name: 'parse_pdf',
    description:
      'Fast local PDF parse. Default engine is PyMuPDF (typically well under 2 seconds). Writes markdown, layout, tables, and chunks on disk. Does not upload files.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to a PDF' },
        pages: { type: 'string', description: 'Optional page range, e.g. 1-10' },
        engine: { type: 'string', description: 'auto | pymupdf | markitdown | pdftotext' },
        outputDir: { type: 'string' }
      },
      required: ['path']
    }
  },
  {
    name: 'extract_bank',
    description:
      'Line-by-line extract of accounts, dates, and transactions from bank-statement PDFs. Auto-detects M-PESA. Local by default; set useLlm true to send extracted text to the configured provider.',
    inputSchema: {
      type: 'object',
      properties: {
        paths: { type: 'array', items: { type: 'string' } },
        path: { type: 'string' },
        pages: { type: 'string' },
        useLlm: { type: 'boolean' },
        outputDir: { type: 'string' }
      }
    }
  },
  {
    name: 'extract_mpesa',
    description:
      'Extract Safaricom M-PESA statement lines: receipt, time, details, Paid In, Withdrawn, Balance, MSISDN.',
    inputSchema: {
      type: 'object',
      properties: {
        paths: { type: 'array', items: { type: 'string' } },
        path: { type: 'string' },
        pages: { type: 'string' },
        useLlm: { type: 'boolean' },
        outputDir: { type: 'string' }
      }
    }
  },
  {
    name: 'extract_invoice',
    description:
      'Extract vendor, totals, and line items from invoice or receipt PDFs. Local by default; useLlm sends extracted text only.',
    inputSchema: {
      type: 'object',
      properties: {
        paths: { type: 'array', items: { type: 'string' } },
        path: { type: 'string' },
        pages: { type: 'string' },
        useLlm: { type: 'boolean' },
        outputDir: { type: 'string' }
      }
    }
  },
  {
    name: 'extract_anything',
    description:
      'Extract arbitrary fields from a PDF. Pass a plain-English query and/or a JSON schema. Local entities always run; useLlm fills the schema from extracted text.',
    inputSchema: {
      type: 'object',
      properties: {
        paths: { type: 'array', items: { type: 'string' } },
        path: { type: 'string' },
        query: { type: 'string' },
        schema: { type: 'string', description: 'JSON schema or instruction' },
        pages: { type: 'string' },
        useLlm: { type: 'boolean' },
        outputDir: { type: 'string' }
      }
    }
  },
  {
    name: 'ask_pdf',
    description:
      'Retrieve on-disk chunks for a parsed PDF and optionally answer with an LLM. Pass indexDir from a previous parse, or a PDF path to index first.',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        indexDir: { type: 'string' },
        path: { type: 'string' },
        useLlm: { type: 'boolean' }
      },
      required: ['question']
    }
  }
]

type JobRunner = (job: {
  tool: string
  files: Array<{ path: string }>
  options: Record<string, string>
  outputDir?: string
}) => Promise<{ ok: boolean; message: string; outputs: Array<{ path: string; name: string }>; extra?: Record<string, unknown> }>

function pathsOf(args: { path?: string; paths?: string[] }): string[] {
  const list = [...(args.paths || [])]
  if (args.path) list.unshift(args.path)
  return list.filter(Boolean)
}

function filesOf(args: { path?: string; paths?: string[] }) {
  return pathsOf(args).map((path) => ({
    id: path,
    path,
    name: path.split(/[\\/]/).pop() || path,
    size: 0,
    ext: '.pdf'
  }))
}

export async function handleMcpJsonRpc(
  body: { method?: string; id?: unknown; params?: Record<string, unknown> },
  enqueue: JobRunner,
  outputDir: string
): Promise<unknown> {
  const method = body.method || ''
  if (method === 'initialize') {
    return {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'lovepdf-studio', version: '1.0.0' }
    }
  }
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
    return null
  }
  if (method === 'tools/list' || method === 'list_tools') {
    return { tools: MCP_TOOLS }
  }
  if (method === 'tools/call') {
    const name = String((body.params as { name?: string })?.name || '')
    const args = ((body.params as { arguments?: Record<string, unknown> })?.arguments || {}) as {
      path?: string
      paths?: string[]
      pages?: string
      engine?: string
      useLlm?: boolean
      outputDir?: string
      question?: string
      indexDir?: string
      query?: string
      schema?: string
    }
    const dest = args.outputDir || outputDir
    if (name === 'parse_pdf') {
      if (!args.path) throw new Error('path is required')
      const result = await enqueue({
        tool: 'parse-pdf',
        files: filesOf({ path: args.path }),
        options: {
          ...(args.pages ? { pages: args.pages } : {}),
          ...(args.engine ? { engine: args.engine } : {})
        },
        outputDir: dest
      })
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    }
    if (name === 'extract_bank' || name === 'extract_invoice' || name === 'extract_mpesa' || name === 'extract_anything') {
      const files = filesOf(args)
      if (!files.length) throw new Error('path or paths is required')
      const tool =
        name === 'extract_bank'
          ? 'extract-bank'
          : name === 'extract_invoice'
            ? 'extract-invoice'
            : name === 'extract_mpesa'
              ? 'extract-mpesa'
              : 'extract-anything'
      const result = await enqueue({
        tool,
        files,
        options: {
          ...(args.pages ? { pages: args.pages } : {}),
          ...(args.query ? { query: args.query } : {}),
          ...(args.schema ? { schema: args.schema } : {}),
          useLlm: args.useLlm ? 'true' : 'false'
        },
        outputDir: dest
      })
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    }
    if (name === 'ask_pdf') {
      if (!args.question) throw new Error('question is required')
      let indexDir = args.indexDir
      if (!indexDir && args.path) {
        const parsed = await enqueue({
          tool: 'ask-pdf',
          files: filesOf({ path: args.path }),
          options: { question: args.question, useLlm: args.useLlm ? 'true' : 'false' },
          outputDir: dest
        })
        return { content: [{ type: 'text', text: JSON.stringify(parsed, null, 2) }] }
      }
      if (!indexDir) throw new Error('indexDir or path is required')
      const asked = await askParsed(indexDir, args.question, { useLlm: Boolean(args.useLlm) })
      return { content: [{ type: 'text', text: JSON.stringify(asked, null, 2) }] }
    }
    throw new Error(`Unknown tool: ${name}`)
  }
  if (method === 'ping') return {}
  throw new Error(`Unknown method: ${method}`)
}

export function isSafeIndexDir(dir: string, outputDir: string): boolean {
  const resolved = resolvePath(dir)
  const roots = [outputDir, defaultTmp(), defaultOutputDir()].map((r) => resolvePath(r))
  return existsSync(resolved) && roots.some((r) => resolved === r || resolved.startsWith(r + '/'))
}

export { extractEngines }
