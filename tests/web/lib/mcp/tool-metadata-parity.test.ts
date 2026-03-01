import { describe, expect, it } from 'vitest'
import { getToolDefinition, listToolsForAgent } from '@/lib/mcp/tools'

type ToolAnnotations = {
  readOnlyHint?: unknown
  openWorldHint?: unknown
  destructiveHint?: unknown
}

type ToolSecurityScheme = {
  type: string
  scopes?: string[]
}

const EXPECTED_READ_SCOPE = (process.env.MCP_OAUTH_SCOPES_READ || 'analoglabor.read').trim() || 'analoglabor.read'
const EXPECTED_WRITE_SCOPE = (process.env.MCP_OAUTH_SCOPES_WRITE || 'analoglabor.write').trim() || 'analoglabor.write'

describe('MCP tool metadata parity', () => {
  it('ensures every canonical tool has complete annotations', () => {
    const allTools = listToolsForAgent({
      apiKeyId: 'key',
      agentId: 'agent',
      keyPrefix: 'prefix',
      scopes: ['write'],
    })

    const failures: string[] = []

    for (const listedTool of allTools) {
      const definition = getToolDefinition(listedTool.name)
      if (!definition) {
        failures.push(`${listedTool.name}: missing canonical definition`)
        continue
      }

      const annotations = (definition.tool.annotations || {}) as ToolAnnotations

      if (typeof annotations.readOnlyHint !== 'boolean') {
        failures.push(`${definition.tool.name}: missing annotations.readOnlyHint`)
      }
      if (typeof annotations.openWorldHint !== 'boolean') {
        failures.push(`${definition.tool.name}: missing annotations.openWorldHint`)
      }
      if (typeof annotations.destructiveHint !== 'boolean') {
        failures.push(`${definition.tool.name}: missing annotations.destructiveHint`)
      }

      if (definition.access === 'read') {
        if (annotations.readOnlyHint !== true) {
          failures.push(`${definition.tool.name}: read tool must set annotations.readOnlyHint=true`)
        }
        if (annotations.destructiveHint !== false) {
          failures.push(`${definition.tool.name}: read tool must set annotations.destructiveHint=false`)
        }
      }

      if (definition.access === 'write' && annotations.readOnlyHint !== false) {
        failures.push(`${definition.tool.name}: write tool must set annotations.readOnlyHint=false`)
      }
    }

    expect(failures, failures.join('\n')).toEqual([])
  })

  it('ensures every canonical tool has OAuth securitySchemes mirrored in _meta', () => {
    const allTools = listToolsForAgent({
      apiKeyId: 'key',
      agentId: 'agent',
      keyPrefix: 'prefix',
      scopes: ['write'],
    })

    const failures: string[] = []

    for (const listedTool of allTools) {
      const definition = getToolDefinition(listedTool.name)
      if (!definition) {
        failures.push(`${listedTool.name}: missing canonical definition`)
        continue
      }

      const tool = definition.tool as typeof definition.tool & {
        securitySchemes?: ToolSecurityScheme[]
        _meta?: Record<string, unknown>
      }

      const schemes = tool.securitySchemes
      if (!Array.isArray(schemes) || schemes.length === 0) {
        failures.push(`${tool.name}: missing securitySchemes`)
        continue
      }

      const expectedScope = definition.access === 'read' ? EXPECTED_READ_SCOPE : EXPECTED_WRITE_SCOPE
      const scheme = schemes[0]
      if (scheme.type !== 'oauth2') {
        failures.push(`${tool.name}: securitySchemes[0].type must be oauth2`)
      }

      if (!Array.isArray(scheme.scopes) || !scheme.scopes.includes(expectedScope)) {
        failures.push(`${tool.name}: securitySchemes missing expected scope ${expectedScope}`)
      }

      const metaSchemes = tool._meta?.securitySchemes as ToolSecurityScheme[] | undefined
      if (!Array.isArray(metaSchemes) || metaSchemes.length === 0) {
        failures.push(`${tool.name}: missing _meta.securitySchemes`)
      } else if (JSON.stringify(metaSchemes) !== JSON.stringify(schemes)) {
        failures.push(`${tool.name}: _meta.securitySchemes must mirror securitySchemes`)
      }
    }

    expect(failures, failures.join('\n')).toEqual([])
  })
})
