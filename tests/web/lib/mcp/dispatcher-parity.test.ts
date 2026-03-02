import { describe, expect, it } from 'vitest'

import { dispatchMcpToolCall } from '@/lib/mcp/dispatcher'
import { listToolsForAgent } from '@/lib/mcp/tools'

type JsonSchema = {
  type?: string
  enum?: unknown[]
  minimum?: number
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema
}

const baseContext = {
  agent: { apiKeyId: 'key-1', agentId: 'agent-123', keyPrefix: 'prefix', scopes: ['write'] },
  apiKey: 'ar_live_test_key',
  baseUrl: 'https://example.com/api/v1',
}

const permissivePolicy = {
  schema_version: '1.0',
  money: {
    enabled: true,
    max_per_action_cents: 5000,
    max_daily_cents: 10000,
  },
  external_jobs: {
    enabled: true,
    allowed_providers: ['proxypics', 'wegolook'],
  },
}

function mockJsonResponse(payload: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )
}

function sampleFromSchema(schema: JsonSchema | undefined): unknown {
  if (!schema) return 'value'

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0]
  }

  if (schema.type === 'boolean') return true

  if (schema.type === 'number' || schema.type === 'integer') {
    const min = typeof schema.minimum === 'number' ? schema.minimum : 1
    return min > 0 ? min : 1
  }

  if (schema.type === 'array') {
    if (schema.items?.type === 'object') {
      return [sampleFromSchema(schema.items)]
    }
    return ['value']
  }

  if (schema.type === 'object') {
    const props = schema.properties ?? {}
    const required = schema.required ?? []
    const out: Record<string, unknown> = {}
    for (const key of required) {
      out[key] = sampleFromSchema(props[key])
    }
    return out
  }

  return 'value'
}

function createServiceClientStub(agentId: string) {
  return {
    from(table: string) {
      if (table === 'agent_tool_policies') {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return { data: { schema_version: '1.0', policy: permissivePolicy }, error: null }
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

      if (table === 'bookings') {
        return {
          select(columns: string) {
            if (columns.includes('processor_fee')) {
              return {
                eq() {
                  return this
                },
                async maybeSingle() {
                  return {
                    data: {
                      id: 'booking-1',
                      agent_id: agentId,
                      amount: 100,
                      payer_amount: 100,
                      processor_fee: 0,
                    },
                    error: null,
                  }
                },
              }
            }

            // daily spend probe
            const query: any = {
              eq() { return query },
              in() { return query },
              gte() { return query },
              lt() {
                return Promise.resolve({ data: [], error: null })
              },
            }
            return query
          },
        }
      }

      if (table === 'proofs') {
        return {
          select() {
            return {
              eq() { return this },
              async maybeSingle() {
                return { data: { status: 'pending' }, error: null }
              },
            }
          },
        }
      }

      if (table === 'external_jobs') {
        return {
          select() {
            return {
              eq() { return this },
              async maybeSingle() {
                return { data: { provider: 'proxypics', agent_id: agentId }, error: null }
              },
            }
          },
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }
}

describe('MCP dispatcher parity', () => {
  it('dispatches every canonical MCP tool definition without unknown-tool drift', async () => {
    let fetchCallCount = 0
    const fetchMock = () => {
      fetchCallCount += 1
      return mockJsonResponse({ success: true, data: [] })
    }

    const failures: string[] = []
    const canonicalTools = listToolsForAgent(baseContext.agent as any)

    const serviceClient = createServiceClientStub(baseContext.agent.agentId)

    for (const tool of canonicalTools) {
      const args = sampleFromSchema(tool.inputSchema as JsonSchema) as Record<string, unknown>
      const result = await dispatchMcpToolCall(
        tool.name,
        args,
        {
          ...baseContext,
          fetchFn: fetchMock,
          serviceClient,
        }
      )

      if (!result.ok) {
        failures.push(`${tool.name}: ${result.error}`)
      }
    }

    expect(failures, `Dispatcher parity failures:\n${failures.join('\n')}`).toEqual([])
    expect(fetchCallCount).toBeGreaterThan(0)
  })
})

