import { createServiceClient } from '@/lib/supabase/server'

export type AdminAction =
  | 'human.verify'
  | 'human.unverify'
  | 'human.update'
  | 'dispute.update_status'
  | 'dispute.resolve'
  | 'bounty.suppress'
  | 'bounty.unsuppress'
  | 'moderation.update_config'
  | 'moderation.rescan_queue.retry'
  | 'moderation.rescan_queue.mark_failed'
  | 'moderation.rescan_queue.mark_completed'
  | 'payments.toggle_pause'

export interface AuditLogInput {
  action: AdminAction
  adminEmail: string
  adminUserId: string
  targetType: 'human' | 'dispute' | 'bounty' | 'booking' | 'config' | 'moderation_rescan_queue'
  targetId: string
  beforeState?: Record<string, unknown>
  afterState?: Record<string, unknown>
  notes?: string
}

/**
 * Log an admin action to the moderation_events table.
 *
 * Uses actor_type='human' with the admin's user_id and stores
 * is_admin_action=true in the evidence JSONB to distinguish
 * admin actions from regular moderation events.
 */
export async function logAdminAction(input: AuditLogInput): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createServiceClient()

    const { error } = await supabase.from('moderation_events').insert({
      surface: 'bounty', // Using 'bounty' as a generic surface; admin actions don't fit the existing enum
      content_type: `admin.${input.action}`,
      content_id: input.targetType === 'config' ? null : input.targetId,
      actor_type: 'human',
      actor_id: input.adminUserId,
      decision: 'allow', // Admin actions are always "allowed"
      reason_codes: [],
      risk_score: 0,
      confidence: 1,
      spam_action: 'none',
      policy_version: 'admin-audit-v1',
      provider: 'admin-console',
      model: null,
      raw_content_hash: null,
      evidence: {
        is_admin_action: true,
        action: input.action,
        admin_email: input.adminEmail,
        target_type: input.targetType,
        target_id: input.targetId,
        before_state: input.beforeState || null,
        after_state: input.afterState || null,
        notes: input.notes || null,
      },
    })

    if (error) {
      console.error('Failed to log admin action:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error('Failed to log admin action:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Fetch audit log entries for a specific target.
 */
export async function getAuditLog(
  targetType: string,
  targetId: string,
  limit = 50
): Promise<{
  success: boolean
  data?: Array<{
    id: string
    action: string
    adminEmail: string
    createdAt: string
    beforeState: Record<string, unknown> | null
    afterState: Record<string, unknown> | null
    notes: string | null
  }>
  error?: string
}> {
  const supabase = await createServiceClient()

  const { data, error } = await supabase
    .from('moderation_events')
    .select('id, content_type, evidence, created_at')
    .eq('provider', 'admin-console')
    .contains('evidence', { target_type: targetType, target_id: targetId })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    return { success: false, error: error.message }
  }

  interface ModerationEventRow {
    id: string
    content_type: string
    evidence: {
      action?: string
      admin_email?: string
      before_state?: Record<string, unknown>
      after_state?: Record<string, unknown>
      notes?: string
    }
    created_at: string
  }

  return {
    success: true,
    data: (data as ModerationEventRow[]).map((row) => ({
      id: row.id,
      action: row.evidence?.action || row.content_type,
      adminEmail: row.evidence?.admin_email || 'unknown',
      createdAt: row.created_at,
      beforeState: row.evidence?.before_state || null,
      afterState: row.evidence?.after_state || null,
      notes: row.evidence?.notes || null,
    })),
  }
}

/**
 * Fetch recent admin actions across all targets.
 */
export async function getRecentAdminActions(
  limit = 50,
  offset = 0
): Promise<{
  success: boolean
  data?: Array<{
    id: string
    action: string
    adminEmail: string
    targetType: string
    targetId: string
    createdAt: string
  }>
  total?: number
  error?: string
}> {
  const supabase = await createServiceClient()

  const { data, error, count } = await supabase
    .from('moderation_events')
    .select('id, content_type, evidence, created_at', { count: 'exact' })
    .eq('provider', 'admin-console')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    return { success: false, error: error.message }
  }

  interface ModerationEventRow {
    id: string
    content_type: string
    evidence: {
      action?: string
      admin_email?: string
      target_type?: string
      target_id?: string
    }
    created_at: string
  }

  return {
    success: true,
    data: (data as ModerationEventRow[]).map((row) => ({
      id: row.id,
      action: row.evidence?.action || row.content_type,
      adminEmail: row.evidence?.admin_email || 'unknown',
      targetType: row.evidence?.target_type || 'unknown',
      targetId: row.evidence?.target_id || 'unknown',
      createdAt: row.created_at,
    })),
    total: count || 0,
  }
}
