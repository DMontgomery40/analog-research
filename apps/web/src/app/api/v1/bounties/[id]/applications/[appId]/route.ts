import { NextRequest, NextResponse } from 'next/server'
import { requireAgentWithScope } from '@/lib/api-auth'
import { acceptApplicationAsAgent, rejectApplicationAsAgent } from '@/lib/bounties/application-actions'
import { z } from 'zod'

export const runtime = 'nodejs'

const updateApplicationSchema = z.object({
  status: z.enum(['accepted', 'rejected']),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; appId: string }> }
) {
  const { id: bountyId, appId } = await params

  const auth = await requireAgentWithScope(request, 'write')
  if (!auth.ok) return auth.response
  const { agent, supabase } = auth

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = updateApplicationSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.errors }, { status: 400 })
  }

  const targetStatus = parsed.data.status

  if (targetStatus === 'accepted') {
    const result = await acceptApplicationAsAgent({
      supabase,
      agentId: agent.agentId,
      bountyId,
      applicationId: appId,
    })

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    }

    return NextResponse.json({
      success: true,
      data: {
        application_id: appId,
        status: result.status,
        booking: result.booking,
        capacity: result.capacity,
      },
    })
  }

  // Rejected flow.
  const result = await rejectApplicationAsAgent({
    supabase,
    agentId: agent.agentId,
    bountyId,
    applicationId: appId,
  })

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status })
  }

  return NextResponse.json({ success: true, data: result.application })
}
