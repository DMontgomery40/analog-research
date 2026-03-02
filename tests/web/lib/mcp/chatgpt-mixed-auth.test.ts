import { describe, expect, it } from 'vitest'

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS === 'true'
const integrationDescribe = RUN_INTEGRATION_TESTS ? describe : describe.skip

const API_BASE_URL = (
  process.env.TEST_API_BASE_URL
  || process.env.NEXT_PUBLIC_SITE_URL
  || process.env.NEXT_PUBLIC_APP_URL
  || 'https://analog-research.org'
).replace(/\/$/, '')

const EXPECTED_READ_SCOPE = (process.env.MCP_OAUTH_SCOPES_READ || 'analogresearch.read').trim() || 'analogresearch.read'
const EXPECTED_WRITE_SCOPE = (process.env.MCP_OAUTH_SCOPES_WRITE || 'analogresearch.write').trim() || 'analogresearch.write'

function buildUrl(path: string) {
  return `${API_BASE_URL}${path}`
}

function expectNetlifyRuntime(response: Response) {
  expect(response.headers.get('x-nf-request-id')).toBeTruthy()
}

function unwrapResult(json: any): any {
  return json?.result ?? json
}

function extractWwwAuthenticateChallenges(payload: any): string[] {
  const result = unwrapResult(payload)
  const meta = result?._meta || payload?._meta
  const raw = meta?.['mcp/www_authenticate']

  if (Array.isArray(raw)) {
    return raw.filter((entry) => typeof entry === 'string') as string[]
  }

  if (typeof raw === 'string') {
    return [raw]
  }

  return []
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

integrationDescribe('ChatGPT MCP mixed auth tool calls (deployed invariants)', () => {
  it('returns OAuth challenge metadata for unauthenticated protected tool call', async () => {
    const response = await fetch(buildUrl('/api/v1/mcp/chatgpt'), {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
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
    const result = unwrapResult(json)

    expect(result?.structuredContent?.tool).toBe('list_bounties')
    expect(result?.structuredContent?.status).toBe('error')
    expect(result?.structuredContent?.error).toBe('Authentication required')

    const challenges = extractWwwAuthenticateChallenges(result)
    expect(challenges.length).toBeGreaterThan(0)
    expect(challenges[0]).toContain('.well-known/oauth-protected-resource')
    expect(challenges[0]).toContain('resource_metadata="')
    expect(challenges[0]).toContain('scope="')
    expect(challenges[0]).toContain(EXPECTED_READ_SCOPE)
  })

  it('requires write scope metadata for unauthenticated write tool call', async () => {
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
          name: 'create_bounty',
          arguments: {
            title: 'Test',
            description: 'Test',
            skills_required: ['qa'],
            budget_min: 1000,
            budget_max: 2000,
          },
        },
      }),
    })

    expectNetlifyRuntime(response)
    expect(response.status).toBe(200)

    const json = await readMcpTransportPayload(response)
    const result = unwrapResult(json)

    expect(result?.structuredContent?.tool).toBe('create_bounty')
    expect(result?.structuredContent?.status).toBe('error')
    expect(typeof result?.structuredContent?.error).toBe('string')

    const challenges = extractWwwAuthenticateChallenges(result)
    expect(challenges.length).toBeGreaterThan(0)
    expect(challenges[0]).toContain('scope="')
    expect(challenges[0]).toContain(EXPECTED_WRITE_SCOPE)
  })
})

