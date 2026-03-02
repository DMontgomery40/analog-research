import type { Tool } from '@modelcontextprotocol/sdk/types.js'
import {
  MCP_TOOL_BY_NAME,
  MCP_TOOL_DEFINITIONS,
  type McpToolDefinition,
} from 'analogresearch-mcp/tools'

import { hasAgentScope, type AgentAuth } from '@/lib/api-auth'

const hasReadScope = (agent: AgentAuth) =>
  hasAgentScope(agent, 'read') || hasAgentScope(agent, 'write')

const hasWriteScope = (agent: AgentAuth) => hasAgentScope(agent, 'write')

export function getToolDefinition(name: string): McpToolDefinition | undefined {
  return MCP_TOOL_BY_NAME.get(name)
}

export function isToolAllowedForAgent(agent: AgentAuth, tool: McpToolDefinition): boolean {
  return tool.access === 'read' ? hasReadScope(agent) : hasWriteScope(agent)
}

export function listCanonicalTools(): Tool[] {
  return MCP_TOOL_DEFINITIONS.map((tool) => tool.tool)
}

export function listToolsForAgent(agent: AgentAuth): Tool[] {
  return MCP_TOOL_DEFINITIONS.filter((tool) => isToolAllowedForAgent(agent, tool))
    .map((tool) => tool.tool)
}

export type { McpToolDefinition }
