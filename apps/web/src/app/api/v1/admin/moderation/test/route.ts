import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireModerationAdmin } from '@/lib/moderation/admin-auth'
import {
  getModerationRuntimeConfig,
  moderateContent,
  persistModerationEvent,
  queueModerationRescan,
  toModerationResponse,
} from '@/lib/moderation'
import { parseZodJsonBody } from '@/lib/request-body'
import { z } from 'zod'

const testSchema = z.object({
  content: z.string().min(1).max(12000),
  surface: z.enum(['bounty', 'application', 'message', 'conversation_initial']).optional().default('message'),
  actorType: z.enum(['human', 'agent']).optional().default('human'),
  actorId: z.string().uuid().optional().default('00000000-0000-0000-0000-000000000001'),
  persist: z.boolean().optional().default(false),
})

export async function POST(request: NextRequest) {
  const admin = await requireModerationAdmin()
  if (!admin.ok) {
    return NextResponse.json({ success: false, error: admin.error }, { status: admin.status })
  }

  const parsed = await parseZodJsonBody(request, testSchema)
  if (!parsed.ok) return parsed.response

  const supabase = await createServiceClient()
  const config = await getModerationRuntimeConfig(supabase)

  const result = await moderateContent({
    supabase,
    config,
    input: {
      surface: parsed.data.surface,
      actorType: parsed.data.actorType,
      actorId: parsed.data.actorId,
      contentType: 'moderation_test',
      content: parsed.data.content,
    },
  })

  let decisionId: string | null = null

  if (parsed.data.persist) {
    decisionId = await persistModerationEvent(supabase, {
      surface: parsed.data.surface,
      contentType: 'moderation_test',
      contentId: null,
      actorType: parsed.data.actorType,
      actorId: parsed.data.actorId,
      result,
    })

    if (result.needsRescan) {
      await queueModerationRescan(supabase, {
        surface: parsed.data.surface,
        contentType: 'moderation_test',
        contentId: null,
        actorType: parsed.data.actorType,
        actorId: parsed.data.actorId,
        contentText: parsed.data.content,
        reason: result.timedOut ? 'timeout' : 'provider_error',
      })
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      result,
      moderation: toModerationResponse(result, {
        contentType: 'moderation_test',
        contentId: null,
        decisionId,
      }),
      persisted: parsed.data.persist,
      decision_id: decisionId,
    },
  })
}
