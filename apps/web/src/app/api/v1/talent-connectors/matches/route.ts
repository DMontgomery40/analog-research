import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { requireTalentConnectorAccess, parseTalentBody } from '@/lib/talent-connectors/http'
import { listTalentMatches, createTalentMatch } from '@/lib/talent-connectors/service'
import { isTalentProvider, TALENT_ERROR_CODES } from '@/lib/talent-connectors/types'
import type { TalentProvider } from '@/lib/talent-connectors/types'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const guard = await requireTalentConnectorAccess(request, 'read')
  if (!guard.ok) return guard.response
  const { actingAgentId, serviceClient } = guard.context

  const url = new URL(request.url)
  const provider = url.searchParams.get('provider') ?? undefined
  const status = url.searchParams.get('status') ?? undefined
  const bountyId = url.searchParams.get('bounty_id') ?? undefined
  const bookingId = url.searchParams.get('booking_id') ?? undefined
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '20', 10) || 20, 1), 100)
  const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10) || 0, 0)

  if (provider && !isTalentProvider(provider)) {
    return NextResponse.json(
      { success: false, error: `Unknown talent provider: ${provider}`, code: TALENT_ERROR_CODES.TALENT_PROVIDER_UNKNOWN },
      { status: 400 },
    )
  }

  const result = await listTalentMatches(serviceClient, actingAgentId, {
    provider: provider as TalentProvider,
    status,
    bountyId,
    bookingId,
    limit,
    offset,
  })

  if (!result.ok) return result.response

  return NextResponse.json({
    success: true,
    data: result.data,
    pagination: { total: result.total, limit, offset },
  })
}

const createSchema = z.object({
  provider: z.string(),
  env: z.enum(['live', 'sandbox']).default('live'),
  worker_id: z.string().uuid(),
  bounty_id: z.string().uuid().optional(),
  booking_id: z.string().uuid().optional(),
  conversation_id: z.string().uuid().optional(),
  match_reason: z.string().max(2000).optional(),
})

export async function POST(request: NextRequest) {
  const guard = await requireTalentConnectorAccess(request, 'write')
  if (!guard.ok) return guard.response
  const { actingAgentId, serviceClient } = guard.context

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = parseTalentBody(rawBody, createSchema)
  if (!parsed.ok) return parsed.response
  const body = parsed.body

  const result = await createTalentMatch(serviceClient, actingAgentId, {
    provider: body.provider as TalentProvider,
    env: body.env,
    workerId: body.worker_id,
    bountyId: body.bounty_id,
    bookingId: body.booking_id,
    conversationId: body.conversation_id,
    matchReason: body.match_reason,
  })

  if (!result.ok) return result.response

  return NextResponse.json({ success: true, data: result.data }, { status: 201 })
}
