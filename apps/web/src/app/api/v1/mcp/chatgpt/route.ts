import { NextRequest } from 'next/server'

import { handleChatGptMcpRequest } from '@/lib/mcp/chatgpt-server'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  return handleChatGptMcpRequest(request)
}

export async function GET(request: NextRequest) {
  return handleChatGptMcpRequest(request)
}

export async function DELETE(request: NextRequest) {
  return handleChatGptMcpRequest(request)
}
