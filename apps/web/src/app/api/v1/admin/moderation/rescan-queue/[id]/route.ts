import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { requireModerationAdmin } from '@/lib/moderation/admin-auth'
import { logAdminAction } from '@/lib/admin/audit'
import { logger } from '@/lib/logger'
import { parseZodJsonBody } from '@/lib/request-body'

const updateSchema = z.object({
  action: z.enum(['retry_now', 'mark_failed', 'mark_completed']),
  resetAttempts: z.boolean().optional().default(false),
  notes: z.string().max(500).optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const log = logger.withContext('api/v1/admin/moderation/rescan-queue/[id]/route.ts', 'PATCH')
  const admin = await requireModerationAdmin()
  if (!admin.ok) {
    return NextResponse.json({ success: false, error: admin.error }, { status: admin.status })
  }

  const { id } = await params
  const parsed = await parseZodJsonBody(request, updateSchema)
  if (!parsed.ok) return parsed.response

  const supabase = await createServiceClient()

  const { data: beforeRow, error: beforeError } = await supabase
    .from('moderation_rescan_queue')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (beforeError) {
    log.error('Failed to fetch queue item', { queueItemId: id }, { message: beforeError.message, code: beforeError.code })
    return NextResponse.json({ success: false, error: beforeError.message }, { status: 500 })
  }

  if (!beforeRow) {
    log.warn('Queue item not found', { queueItemId: id })
    return NextResponse.json({ success: false, error: 'Queue item not found' }, { status: 404 })
  }

  const now = new Date().toISOString()
  const update: Record<string, unknown> = {}
  let auditAction:
    | 'moderation.rescan_queue.retry'
    | 'moderation.rescan_queue.mark_failed'
    | 'moderation.rescan_queue.mark_completed'

  if (parsed.data.action === 'retry_now') {
    auditAction = 'moderation.rescan_queue.retry'
    update.status = 'pending'
    update.next_run_at = now
    update.last_error = null
    if (parsed.data.resetAttempts) update.attempt_count = 0
  } else if (parsed.data.action === 'mark_failed') {
    auditAction = 'moderation.rescan_queue.mark_failed'
    update.status = 'failed'
  } else {
    auditAction = 'moderation.rescan_queue.mark_completed'
    update.status = 'completed'
  }

  const { data: afterRow, error: updateError } = await supabase
    .from('moderation_rescan_queue')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()

  if (updateError) {
    log.error('Failed to update queue item', { queueItemId: id, action: parsed.data.action }, { message: updateError.message, code: updateError.code })
    return NextResponse.json({ success: false, error: updateError.message }, { status: 500 })
  }

  if (admin.email && admin.userId) {
    await logAdminAction({
      action: auditAction,
      adminEmail: admin.email,
      adminUserId: admin.userId,
      targetType: 'moderation_rescan_queue',
      targetId: id,
      beforeState: beforeRow as Record<string, unknown>,
      afterState: afterRow as Record<string, unknown>,
      notes: parsed.data.notes,
    })
  }

  return NextResponse.json({ success: true, data: afterRow })
}
