import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { deliverNotification } from './notification-delivery'
import { AppError, normalizeError } from './errors'
import { logger } from './logger'

export type NotificationRecipientType = 'human' | 'agent'

export type NotificationType =
  | 'new_application'
  | 'application_accepted'
  | 'application_rejected'
  | 'new_message'
  | 'booking_created'
  | 'escrow_funded'
  | 'payment_refunded'
  | 'payment_failed'
  | 'external_job_created'
  | 'external_job_updated'
  | 'external_job_completed'
  | 'external_job_failed'
  | 'proof_submitted'
  | 'proof_approved'
  | 'proof_rejected'
  | 'review_received'
  | 'dispute_opened'
  | 'dispute_resolved'
  | 'autopilot_action'

export interface CreateNotificationArgs {
  recipientType: NotificationRecipientType
  recipientId: string
  type: NotificationType
  title: string
  body?: string
  data?: Record<string, unknown>
}

export interface CreateAgentWorkflowNotificationArgs {
  supabase: SupabaseClient
  agentId: string
  type: NotificationType
  title: string
  body?: string
  data?: Record<string, unknown>
  ownerTitle?: string
  ownerBody?: string
}

export interface AgentWorkflowNotificationResult {
  agentNotificationId: string | null
  ownerHumanId: string | null
  ownerNotificationId: string | null
}

const createNotificationLog = logger.withContext('lib/notifications.ts', 'createNotification')
const ownerFanoutLog = logger.withContext(
  'lib/notifications.ts',
  'createAgentWorkflowNotificationWithOwnerFanout'
)

/**
 * Create a notification and deliver it to configured channels.
 * This is the preferred way to create notifications - it handles both
 * database insertion and delivery in one call.
 *
 * Delivery is non-blocking - if delivery fails, the notification is still
 * created in the database.
 */
export async function createNotification(
  supabase: SupabaseClient,
  args: CreateNotificationArgs
): Promise<{ id: string } | null> {
  const { recipientType, recipientId, type, title, body, data } = args

  const { data: notification, error } = await supabase
    .from('notifications')
    .insert({
      recipient_type: recipientType,
      recipient_id: recipientId,
      type,
      title,
      body: body ?? null,
      data: data ?? {},
    })
    .select('id, recipient_type, recipient_id, type, title, body, data, created_at')
    .single()

  if (error || !notification) {
    createNotificationLog.error(
      'Failed to create notification',
      {
        recipientType,
        recipientId,
        notificationType: type,
      },
      normalizeError(
        error ?? new AppError('Notification insert returned no row', {
          operatorHint: 'check notifications insert',
        }),
        {
          operatorHint: 'check notifications insert',
        }
      )
    )
    return null
  }

  // Deliver to configured channels (non-blocking)
  // Fire and forget - don't wait for delivery
  void deliverNotification({
    id: notification.id,
    recipient_type: notification.recipient_type,
    recipient_id: notification.recipient_id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    data: (notification.data ?? {}) as Record<string, unknown>,
    created_at: notification.created_at,
  }).catch((err) => {
    createNotificationLog.error(
      'Notification delivery failed',
      {
        notificationId: notification.id,
        recipientType: notification.recipient_type,
        recipientId: notification.recipient_id,
        notificationType: notification.type,
      },
      normalizeError(err, {
        operatorHint: 'check channel delivery',
      })
    )
  })

  return { id: notification.id }
}

/**
 * Create a workflow-critical notification for a ResearchAgent and fan it out to the
 * owner human (if configured via agents.owner_human_id).
 */
export async function createAgentWorkflowNotificationWithOwnerFanout(
  args: CreateAgentWorkflowNotificationArgs
): Promise<AgentWorkflowNotificationResult> {
  const {
    supabase,
    agentId,
    type,
    title,
    body,
    data,
    ownerTitle,
    ownerBody,
  } = args

  const agentNotification = await createNotification(supabase, {
    recipientType: 'agent',
    recipientId: agentId,
    type,
    title,
    body,
    data,
  })

  const { data: ownerAgent, error: ownerAgentError } = await supabase
    .from('agents')
    .select('owner_human_id')
    .eq('id', agentId)
    .maybeSingle()

  if (ownerAgentError) {
    ownerFanoutLog.error(
      'Failed to look up owner human for notification fanout',
      {
        agentId,
        notificationType: type,
      },
      normalizeError(ownerAgentError, {
        operatorHint: 'check owner_human_id lookup',
      })
    )

    return {
      agentNotificationId: agentNotification?.id || null,
      ownerHumanId: null,
      ownerNotificationId: null,
    }
  }

  const ownerHumanId = ownerAgent?.owner_human_id || null
  if (!ownerHumanId) {
    return {
      agentNotificationId: agentNotification?.id || null,
      ownerHumanId: null,
      ownerNotificationId: null,
    }
  }

  const ownerNotification = await createNotification(supabase, {
    recipientType: 'human',
    recipientId: ownerHumanId,
    type,
    title: ownerTitle || title,
    body: ownerBody || body,
    data,
  })

  return {
    agentNotificationId: agentNotification?.id || null,
    ownerHumanId,
    ownerNotificationId: ownerNotification?.id || null,
  }
}

export interface ListNotificationsArgs {
  recipientType: NotificationRecipientType
  recipientId: string
  unreadOnly: boolean
  limit: number
  offset: number
  types?: string[]
}

export interface ListNotificationsResult<TNotification = unknown> {
  notifications: TNotification[]
  total: number
  unread_count: number
}

export interface MarkNotificationsReadArgs {
  recipientType: NotificationRecipientType
  recipientId: string
  notificationIds?: string[]
  markAll: boolean
  nowIso?: string
}

export function splitTypesParam(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

const markReadRequestSchema = z.object({
  notification_ids: z.array(z.string().uuid()).min(1).max(100).optional(),
  mark_all: z.boolean().optional(),
  mark_all_read: z.boolean().optional(),
}).refine(
  (data) => data.notification_ids || data.mark_all || data.mark_all_read,
  { message: 'Either notification_ids or mark_all/mark_all_read must be provided' }
)

export type ParseMarkReadRequestResult =
  | {
      ok: true
      notificationIds?: string[]
      markAll: boolean
    }
  | {
      ok: false
      status: 400
      error: string
      operatorHint: string
      details?: unknown
    }

export async function parseMarkReadRequest(request: Request): Promise<ParseMarkReadRequestResult> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return {
      ok: false,
      status: 400,
      error: 'Invalid JSON body',
      operatorHint: 'check notifications payload',
    }
  }

  const parsed = markReadRequestSchema.safeParse(body)
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      error: 'Invalid request body',
      operatorHint: 'check notifications payload',
      details: parsed.error.flatten(),
    }
  }

  return {
    ok: true,
    notificationIds: parsed.data.notification_ids,
    markAll: Boolean(parsed.data.mark_all || parsed.data.mark_all_read),
  }
}

export async function listNotifications(
  supabase: any,
  args: ListNotificationsArgs
): Promise<ListNotificationsResult> {
  const { recipientType, recipientId, unreadOnly, limit, offset, types } = args

  let query = supabase
    .from('notifications')
    .select('*', { count: 'exact' })
    .eq('recipient_type', recipientType)
    .eq('recipient_id', recipientId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (unreadOnly) {
    query = query.eq('is_read', false)
  }

  if (types && types.length > 0) {
    query = query.in('type', types)
  }

  const { data: notifications, error, count } = await query

  if (error) {
    throw new AppError(error.message, {
      code: error.code,
      status: 500,
      operatorHint: 'check notifications query',
    })
  }

  // Separate query so we always have an accurate badge count, independent of list filters.
  const { count: unreadCount, error: unreadError } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('recipient_type', recipientType)
    .eq('recipient_id', recipientId)
    .eq('is_read', false)

  if (unreadError) {
    throw new AppError(unreadError.message, {
      code: unreadError.code,
      status: 500,
      operatorHint: 'check unread_count query',
    })
  }

  return {
    notifications: notifications || [],
    total: count || 0,
    unread_count: unreadCount || 0,
  }
}

export async function markNotificationsRead(
  supabase: any,
  args: MarkNotificationsReadArgs
): Promise<void> {
  const { recipientType, recipientId, notificationIds, markAll } = args
  const now = args.nowIso || new Date().toISOString()

  if (markAll) {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: now })
      .eq('recipient_type', recipientType)
      .eq('recipient_id', recipientId)
      .eq('is_read', false)

    if (error) {
      throw new AppError(error.message, {
        code: error.code,
        status: 500,
        operatorHint: 'check notifications update',
      })
    }

    return
  }

  if (!notificationIds || notificationIds.length === 0) {
    throw new AppError('No notification_ids provided', {
      status: 400,
      operatorHint: 'check notifications payload',
    })
  }

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, read_at: now })
    .eq('recipient_type', recipientType)
    .eq('recipient_id', recipientId)
    .in('id', notificationIds)

  if (error) {
    throw new AppError(error.message, {
      code: error.code,
      status: 500,
      operatorHint: 'check notifications update',
    })
  }
}
