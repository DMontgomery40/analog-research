const TALENT_TOOL_NAMES = [
  'list_talent_connectors',
  'test_talent_connector',
  'search_connector_workers',
  'create_connector_match',
  'list_connector_matches',
  'contact_connector_worker',
  'post_connector_task',
  'sync_connector_action',
]

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

describe('MCP talent connector tools (deployed invariants)', () => {
  it('exposes talent connector tool names in tools/list (Netlify runtime)', async () => {
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
    expect(Array.isArray(tools)).toBe(true)

    const names = new Set(tools.map((tool: any) => tool?.name).filter(Boolean))
    for (const name of TALENT_TOOL_NAMES) {
      expect(names.has(name), `Missing tool in deployed catalog: ${name}`).toBe(true)
    }
  })

  it('returns a structured auth error when calling a protected talent tool without auth', async () => {
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
          name: 'list_talent_connectors',
          arguments: {},
        },
      }),
    })

    expectNetlifyRuntime(response)
    expect(response.status).toBe(200)

    const json = await readMcpTransportPayload(response)
    const result = json?.result ?? json
    expect(result?.structuredContent?.tool).toBe('list_talent_connectors')
    expect(result?.structuredContent?.status).toBe('error')
    expect(result?.structuredContent?.error).toBe('Authentication required')
  })
})
