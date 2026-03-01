import { describe, expect, it } from 'vitest'

import { dispatchMcpToolCall } from '@/lib/mcp/dispatcher'

const blockingPolicy = {
  schema_version: '1.0',
  money: {
    enabled: true,
    max_per_action_cents: 5000,
    max_daily_cents: 10000,
  },
  external_jobs: {
    enabled: false,
    allowed_providers: [],
  },
}

describe('MCP dispatcher tool-policy guards (unit)', () => {
  it('returns ok=false and does not call API when blocked by tool policy', async () => {
    let fetchCalls = 0
    const fetchFn = () => {
      fetchCalls += 1
      return Promise.resolve(new Response('should not be called', { status: 500 }))
    }

    const serviceClient = {
      from(table: string) {
        if (table === 'agent_tool_policies') {
          return {
            select() {
              return {
                eq() {
                  return {
                    async maybeSingle() {
                      return { data: { schema_version: '1.0', policy: blockingPolicy }, error: null }
                    },
                  }
                },
              }
            },
          }
        }

        if (table === 'agent_tool_audit_log') {
          return {
            async insert() {
              return { data: null, error: null }
            },
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      },
    }

    const result = await dispatchMcpToolCall(
      'create_field_check',
      {
        instructions: 'Drive by and photograph frontage',
        address: '123 Main St, Austin, TX',
        provider: 'proxypics',
      },
      {
        agent: { apiKeyId: 'key-1', agentId: 'agent-123', keyPrefix: 'prefix', scopes: ['write'] } as any,
        apiKey: 'analoglabor_test_key',
        baseUrl: 'https://example.com/api/v1',
        fetchFn,
        serviceClient,
      }
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Action blocked by tool policy')
    }
    expect(fetchCalls).toBe(0)
  })
})

