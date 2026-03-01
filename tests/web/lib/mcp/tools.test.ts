import { describe, expect, it } from 'vitest'

import {
  getToolDefinition,
  isToolAllowedForAgent,
  listToolsForAgent,
} from '@/lib/mcp/tools'

describe('MCP tool permissions', () => {
  it('exposes new external job aliases in tool definitions', () => {
    expect(getToolDefinition('list_external_jobs')).toBeDefined()
    expect(getToolDefinition('create_external_job')).toBeDefined()
    expect(getToolDefinition('refresh_external_job')).toBeDefined()
  })

  it('allows read-only external job aliases for read scope and blocks write aliases', () => {
    const agent = {
      apiKeyId: 'key-1',
      agentId: 'agent-1',
      keyPrefix: 'prefix',
      scopes: ['read'],
    }

    const readTool = getToolDefinition('list_external_jobs')
    const writeTool = getToolDefinition('create_external_job')
    expect(readTool).toBeDefined()
    expect(writeTool).toBeDefined()

    expect(isToolAllowedForAgent(agent, readTool!)).toBe(true)
    expect(isToolAllowedForAgent(agent, writeTool!)).toBe(false)
  })

  it('returns write aliases in tool list for write scope', () => {
    const writeAgent = {
      apiKeyId: 'key-1',
      agentId: 'agent-1',
      keyPrefix: 'prefix',
      scopes: ['write'],
    }

    const toolNames = new Set(listToolsForAgent(writeAgent).map((tool) => tool.name))
    expect(toolNames.has('list_external_jobs')).toBe(true)
    expect(toolNames.has('create_external_job')).toBe(true)
    expect(toolNames.has('refresh_external_job')).toBe(true)
  })
})
