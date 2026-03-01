import { NextRequest, NextResponse } from 'next/server'

import { requireTalentConnectorAccess } from '@/lib/talent-connectors/http'
import { listTalentProviders } from '@/lib/talent-connectors/service'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const guard = await requireTalentConnectorAccess(request, 'read')
  if (!guard.ok) return guard.response
  const { actingAgentId, serviceClient } = guard.context

  const providers = await listTalentProviders(serviceClient, actingAgentId)
  return NextResponse.json({ success: true, data: providers })
}
