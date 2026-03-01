import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/admin-auth'
import { logAdminAction } from '@/lib/admin/audit'
import { logger } from '@/lib/logger'
import { handleSingleResult } from '@/lib/supabase/errors'
import { parseZodJsonBody } from '@/lib/request-body'
import { z } from 'zod'

export const runtime = 'nodejs'

const patchSchema = z.object({
  status: z.enum(['open', 'under_review', 'resolved', 'dismissed']).optional(),
  resolution: z.string().trim().min(1).max(5000).nullable().optional(),
  human_payout_percent: z.number().int().min(0).max(100).nullable().optional(),
  notes: z.string().trim().min(1).max(2000).optional(),
}).strict()

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const log = logger.withContext('api/v1/admin/disputes/[id]/route.ts', 'GET')
  const admin = await requireAdmin()
  if (!admin.ok) {
    return NextResponse.json({ success: false, error: admin.error }, { status: admin.status })
  }

  const { id } = await params
  const supabase = await createServiceClient()

  const { data, error } = await supabase
    .from('disputes')
    .select(`
      *,
      bookings (
        id,
        title,
        description,
        amount,
        currency,
        platform_fee,
        escrow_status,
        payment_method,
        status,
        created_at,
        completed_at,
        human_id,
        agent_id,
        humans (id, name, avatar_url, is_verified),
        agents (id, name, description)
      )
    `)
    .eq('id', id)
    .single()

  const disputeResult = handleSingleResult(data, error, log, 'Dispute', { disputeId: id })
  if (disputeResult.response) return disputeResult.response

  // Fetch conversation messages related to this booking if available
  let messages = null
  if (disputeResult.data.bookings?.id) {
    const { data: conversationData } = await supabase
      .from('conversations')
      .select('id')
      .eq('booking_id', disputeResult.data.bookings.id)
      .single()

    if (conversationData) {
      const { data: messagesData } = await supabase
        .from('messages')
        .select('id, sender_type, sender_id, content, created_at')
        .eq('conversation_id', conversationData.id)
        .order('created_at', { ascending: true })
        .limit(100)

      messages = messagesData
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      dispute: disputeResult.data,
      messages,
    },
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const log = logger.withContext('api/v1/admin/disputes/[id]/route.ts', 'PATCH')
  const admin = await requireAdmin()
  if (!admin.ok || !admin.userId) {
    return NextResponse.json({ success: false, error: admin.error }, { status: admin.status })
  }

  const parsed = await parseZodJsonBody(request, patchSchema)
  if (!parsed.ok) return parsed.response

  const { status, resolution, human_payout_percent: humanPayoutPercent, notes } = parsed.data
  const hasStateUpdates = !(status === undefined && resolution === undefined && humanPayoutPercent === undefined)
  const hasNotes = notes !== undefined

  if (!hasStateUpdates && !hasNotes) {
    return NextResponse.json({ success: false, error: 'No updates provided' }, { status: 400 })
  }

  const { id } = await params
  const supabase = await createServiceClient()

  const { data: beforeData, error: fetchError } = await supabase
    .from('disputes')
    .select('*')
    .eq('id', id)
    .single()

  const beforeResult = handleSingleResult(beforeData, fetchError, log, 'Dispute', { disputeId: id })
  if (beforeResult.response) return beforeResult.response
  const before = beforeResult.data

  let after = before

  if (hasStateUpdates) {
    const updates: Record<string, unknown> = {}
    if (status !== undefined) {
      updates.status = status

      const isResolved = status === 'resolved' || status === 'dismissed'
      if (isResolved) {
        updates.resolved_at = new Date().toISOString()
        updates.resolved_by = admin.userId
      } else {
        updates.resolved_at = null
        updates.resolved_by = null
        if (resolution === undefined) updates.resolution = null
        if (humanPayoutPercent === undefined) updates.human_payout_percent = null
      }
    }

    if (resolution !== undefined) updates.resolution = resolution
    if (humanPayoutPercent !== undefined) updates.human_payout_percent = humanPayoutPercent

    const { data: updated, error: updateError } = await supabase
      .from('disputes')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()

    if (updateError) {
      log.error('Failed to update dispute', { disputeId: id }, { message: updateError.message, code: updateError.code })
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 })
    }

    after = updated
  }

  if (admin.email) {
    const action = status === 'resolved' || status === 'dismissed'
      ? 'dispute.resolve'
      : 'dispute.update_status'

    try {
      await logAdminAction({
        action,
        adminEmail: admin.email,
        adminUserId: admin.userId,
        targetType: 'dispute',
        targetId: id,
        beforeState: {
          status: (before as any).status,
          resolution: (before as any).resolution,
          resolved_by: (before as any).resolved_by,
          resolved_at: (before as any).resolved_at,
          human_payout_percent: (before as any).human_payout_percent,
        },
        afterState: {
          status: (after as any).status,
          resolution: (after as any).resolution,
          resolved_by: (after as any).resolved_by,
          resolved_at: (after as any).resolved_at,
          human_payout_percent: (after as any).human_payout_percent,
        },
        notes: notes ?? undefined,
      })
    } catch (error) {
      log.error('Failed to log admin action (non-blocking)', { disputeId: id }, error instanceof Error ? { message: error.message } : { message: String(error) })
    }
  }

  return NextResponse.json({ success: true, data: after })
}
