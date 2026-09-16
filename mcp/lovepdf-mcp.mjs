#!/usr/bin/env node
/**
 * LovePDF Studio MCP stdio bridge.
 * Forwards JSON-RPC to the local engine at http://127.0.0.1:43128/mcp
 * Enable MCP in Settings first, and keep `npm run dev` running.
 */
import { stdin, stdout, stderr } from 'node:process'

const ENGINE = (process.env.LOVEPDF_ENGINE || 'http://127.0.0.1:43128').replace(/\/+$/, '')
const ENDPOINT = process.env.LOVEPDF_MCP_URL || ENGINE + '/mcp'

function writeMessage(obj) {
  const json = JSON.stringify(obj)
  const payload = Buffer.from(json, 'utf8')
  stdout.write(`Content-Length: ${payload.length}\r\n\r\n`)
  stdout.write(payload)
}

async function rpc(body) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', ...body })
  })
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return { jsonrpc: '2.0', id: body.id ?? null, error: { code: -32000, message: text.slice(0, 400) } }
  }
}

let buffer = Buffer.alloc(0)

stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk])
  void drain()
})

async function drain() {
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n')
    if (headerEnd < 0) return
    const header = buffer.subarray(0, headerEnd).toString('utf8')
    const match = header.match(/Content-Length:\s*(\d+)/i)
    if (!match) {
      buffer = buffer.subarray(headerEnd + 4)
      continue
    }
    const len = Number(match[1])
    const start = headerEnd + 4
    if (buffer.length < start + len) return
    const json = buffer.subarray(start, start + len).toString('utf8')
    buffer = buffer.subarray(start + len)
    let msg
    try {
      msg = JSON.parse(json)
    } catch (e) {
      writeMessage({ jsonrpc: '2.0', id: null, error: { code: -32700, message: String(e) } })
      continue
    }
    try {
      const result = await rpc(msg)
      writeMessage(result)
    } catch (e) {
      writeMessage({
        jsonrpc: '2.0',
        id: msg.id ?? null,
        error: { code: -32000, message: e instanceof Error ? e.message : String(e) }
      })
    }
  }
}

stdin.on('end', () => process.exit(0))
stderr.write('LovePDF Studio MCP stdio bridge → ' + ENDPOINT + '\n')
