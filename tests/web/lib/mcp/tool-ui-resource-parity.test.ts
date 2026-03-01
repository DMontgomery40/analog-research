import { describe, expect, it } from 'vitest'

import {
  MCP_APP_HTML_MIME,
  listChatGptResources,
  readChatGptResource,
} from '@/lib/mcp/chatgpt-resources'
import { getToolDefinition, listCanonicalTools } from '@/lib/mcp/tools'

describe('MCP tool UI resource parity', () => {
  it('ensures each canonical tool has a UI resource URI and output template alias', () => {
    const failures: string[] = []
    const canonical = listCanonicalTools()

    for (const tool of canonical) {
      const definition = getToolDefinition(tool.name)
      if (!definition) {
        failures.push(`${tool.name}: missing canonical tool definition`)
        continue
      }

      const meta = (definition.tool as typeof definition.tool & {
        _meta?: Record<string, unknown>
      })._meta
      const ui = meta?.ui as { resourceUri?: unknown } | undefined
      const resourceUri = ui?.resourceUri
      const outputTemplate = meta?.['openai/outputTemplate']

      if (typeof resourceUri !== 'string' || resourceUri.length === 0) {
        failures.push(`${tool.name}: missing _meta.ui.resourceUri`)
      }

      if (outputTemplate !== resourceUri) {
        failures.push(`${tool.name}: _meta["openai/outputTemplate"] must mirror _meta.ui.resourceUri`)
      }
    }

    expect(failures, failures.join('\n')).toEqual([])
  })

  it('ensures every referenced resource URI is resolvable via resources/list and resources/read', () => {
    const failures: string[] = []
    const listedResourceUris = new Set(listChatGptResources().map((resource) => resource.uri))
    const canonical = listCanonicalTools()

    for (const tool of canonical) {
      const definition = getToolDefinition(tool.name)
      const meta = (definition?.tool as typeof definition.tool & {
        _meta?: Record<string, unknown>
      })?._meta
      const resourceUri = (meta?.ui as { resourceUri?: string } | undefined)?.resourceUri

      if (!resourceUri) {
        failures.push(`${tool.name}: no resource URI`)
        continue
      }

      if (!listedResourceUris.has(resourceUri)) {
        failures.push(`${tool.name}: resource URI ${resourceUri} missing from resources/list`)
        continue
      }

      const content = readChatGptResource(resourceUri)
      if (!content) {
        failures.push(`${tool.name}: resource URI ${resourceUri} unreadable`)
        continue
      }

      if (content.mimeType !== MCP_APP_HTML_MIME) {
        failures.push(`${tool.name}: resource URI ${resourceUri} has wrong mime type ${content.mimeType}`)
      }
    }

    expect(failures, failures.join('\n')).toEqual([])
  })
})
