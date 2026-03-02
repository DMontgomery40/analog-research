import {
  MCP_TOOL_DEFINITIONS,
  MCP_UI_RESOURCE_URIS,
  getMcpToolUiResourceUri,
  type McpUiResourceUri,
} from 'analogresearch-mcp/tools'

export { MCP_UI_RESOURCE_URIS as CHATGPT_UI_RESOURCE_URIS }

export const CHATGPT_TOOL_UI_RESOURCE_MAP = new Map<string, McpUiResourceUri>(
  MCP_TOOL_DEFINITIONS.map((definition) => [
    definition.tool.name,
    getMcpToolUiResourceUri(definition.tool.name),
  ])
)

export function getChatGptToolResourceUri(toolName: string): McpUiResourceUri {
  return CHATGPT_TOOL_UI_RESOURCE_MAP.get(toolName) ?? MCP_UI_RESOURCE_URIS.generic
}

export function listChatGptUiResourceUris(): McpUiResourceUri[] {
  return Array.from(new Set(CHATGPT_TOOL_UI_RESOURCE_MAP.values()))
}
