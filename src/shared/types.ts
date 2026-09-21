export type ToolId =
  | 'merge'
  | 'split'
  | 'extract'
  | 'delete-pages'
  | 'compress'
  | 'pdf-to-word'
  | 'pdf-to-ppt'
  | 'pdf-to-excel'
  | 'word-to-pdf'
  | 'ppt-to-pdf'
  | 'excel-to-pdf'
  | 'edit-pdf'
  | 'pdf-to-jpg'
  | 'jpg-to-pdf'
  | 'sign-pdf'
  | 'watermark'
  | 'rotate'
  | 'html-to-pdf'
  | 'unlock'
  | 'protect'
  | 'organize'
  | 'pdf-to-pdfa'
  | 'repair'
  | 'page-numbers'
  | 'scan-to-pdf'
  | 'ocr'
  | 'compare'
  | 'redact'
  | 'crop'
  | 'pdf-to-markdown'
  | 'parse-pdf'
  | 'extract-bank'
  | 'extract-mpesa'
  | 'extract-invoice'
  | 'extract-anything'
  | 'ask-pdf'
  | 'summarize-pdf'
  | 'translate-pdf'
  | 'pdf-forms'
  | 'extract-images'

export type ToolGroup = 'organize' | 'optimize' | 'to-pdf' | 'from-pdf' | 'edit' | 'security' | 'ai'

export type OptionField =
  | {
      key: string
      label: string
      type: 'text' | 'password' | 'textarea' | 'number' | 'file'
      placeholder?: string
      min?: number
      max?: number
      hint?: string
    }
  | {
      key: string
      label: string
      type: 'select' | 'radio'
      options: { value: string; label: string; hint?: string }[]
    }
  | { key: string; label: string; type: 'checkbox' }
  | {
      key: string
      label: string
      type: 'margins'
      keys: { top: string; right: string; bottom: string; left: string }
    }

export interface ToolDef {
  id: ToolId
  title: string
  tagline: string
  description: string
  color: string
  group: ToolGroup
  accept: string[]
  acceptLabel: string
  minFiles: number
  maxFiles?: number
  action: string
  options: OptionField[]
  nav?: 'header' | 'convert'
}

export interface FileRef {
  id: string
  path: string
  name: string
  size: number
  ext: string
  pages?: number
  pageSize?: string
  encrypted?: boolean
  error?: string
}

export interface JobRequest {
  id: string
  tool: ToolId
  files: FileRef[]
  options: Record<string, string | number | boolean>
  outputDir?: string
}

export interface JobProgress {
  jobId: string
  percent: number
  message: string
  current?: number
  total?: number
}

export interface JobFileResult {
  path: string
  name: string
  size: number
}

export interface JobResult {
  jobId: string
  ok: boolean
  message: string
  outputs: JobFileResult[]
  extra?: Record<string, unknown>
}

export interface EngineStatus {
  ok: boolean
  binaries: Record<string, string | null>
  tmp: string
  outputDir: string
  concurrency: number
  diskFreeBytes: number
  extract?: Record<string, boolean | string>
  vendor?: { bin: string; platform: string }
  vendorInstall?: { inFlight: boolean }
  installTools?: {
    inFlight: boolean
    script: string | null
    exists: boolean
    name: string
    packaged: boolean
    resourcesPath: string | null
    command: string
    argv: string[]
    vendorOnlyDefault: boolean
    bundled?: Array<{ name: string; path: string | null; exists: boolean }>
  }
  llm?: {
    defaultProvider: string | null
    configured: string[]
    encryption: string
  }
}

export const API_PORT = 43128
export const API_ORIGIN = `http://127.0.0.1:${API_PORT}`
export const RENDERER_PORT = 43127
