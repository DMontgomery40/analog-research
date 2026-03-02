import { describe, expect, it } from 'vitest'

const API_BASE_URL = (
  process.env.TEST_API_BASE_URL
  || process.env.NEXT_PUBLIC_SITE_URL
  || process.env.NEXT_PUBLIC_APP_URL
  || 'https://analog-research.org'
).replace(/\/$/, '')

function buildUrl(path: string) {
  return `${API_BASE_URL}${path}`
}

function expectNetlifyRuntime(response: Response) {
  expect(response.headers.get('x-nf-request-id')).toBeTruthy()
}

function unwrapToolsList(json: any): any[] {
  const tools = json?.result?.tools ?? json?.tools
  return Array.isArray(tools) ? tools : []
}

async function readMcpTransportPayload(response: Response): Promise<any> {
  const contentType = (response.headers.get('content-type') || '').toLowerCase()
  const text = await response.text()
  const trimmed = text.trim()

  const looksLikeSse = contentType.includes('text/event-stream') || trimmed.startsWith('event:')
  if (!looksLikeSse) {
    return JSON.parse(trimmed)
  }

  const messages: any[] = []
  for (const chunk of text.split(/\r?\n\r?\n+/)) {
    const dataLines = chunk
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trim())

    if (dataLines.length === 0) continue

    const data = dataLines.join('\n')
    try {
      messages.push(JSON.parse(data))
    } catch {
      // Ignore non-JSON data payloads.
    }
  }

  if (messages.length === 0) {
    throw new Error(`Expected MCP transport JSON payload, got: ${trimmed.slice(0, 120)}`)
  }

  return messages[messages.length - 1]
}

describe('ChatGPT MCP endpoint (deployed invariants)', () => {
  it('allows unauthenticated tools/list requests (Netlify runtime)', async () => {
    const response = await fetch(buildUrl('/api/v1/mcp/chatgpt'), {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      }),
    })

    expectNetlifyRuntime(response)
    expect(response.status).toBe(200)

    const json = await readMcpTransportPayload(response)
    const tools = unwrapToolsList(json)
    expect(tools.length).toBeGreaterThan(0)
  })

  it('returns a structured auth error for unauthenticated tools/call requests', async () => {
    const response = await fetch(buildUrl('/api/v1/mcp/chatgpt'), {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'list_bounties',
          arguments: {},
        },
      }),
    })

    expectNetlifyRuntime(response)
    expect(response.status).toBe(200)

    const json = await readMcpTransportPayload(response)
    const result = json?.result ?? json
    expect(result?.structuredContent?.tool).toBe('list_bounties')
    expect(result?.structuredContent?.status).toBe('error')
    expect(result?.structuredContent?.error).toBe('Authentication required')
  })
})
