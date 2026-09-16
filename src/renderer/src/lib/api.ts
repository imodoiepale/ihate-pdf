export const API = 'http://127.0.0.1:43128'

async function parse<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { error?: string }
  if (!res.ok) throw new Error(data.error || res.statusText)
  return data
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(API + path)
  return parse<T>(res)
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : '{}'
  })
  return parse<T>(res)
}

export async function importBrowserFile(file: File): Promise<import('@shared/types').FileRef> {
  const res = await fetch(API + '/api/import?name=' + encodeURIComponent(file.name), {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file.stream(),
    // @ts-expect-error duplex is required for streaming request bodies
    duplex: 'half'
  })
  const data = await parse<{ file: import('@shared/types').FileRef }>(res)
  return data.file
}

export function subscribeJob(jobId: string, onEvent: (e: import('@shared/types').JobProgress) => void): () => void {
  const es = new EventSource(API + `/api/jobs/${jobId}/events`)
  es.onmessage = (m) => {
    try {
      onEvent(JSON.parse(m.data) as import('@shared/types').JobProgress)
    } catch {
      /* ignore */
    }
  }
  return () => es.close()
}
