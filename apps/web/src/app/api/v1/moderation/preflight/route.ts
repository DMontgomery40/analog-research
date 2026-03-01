import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAgentWithScope } from '@/lib/api-auth'
import {
  getModerationRuntimeConfig,
  moderateContent,
  persistModerationEvent,
  queueModerationRescan,
  toModerationResponse,
} from '@/lib/moderation'

export const runtime = 'nodejs'

const moderationSurfaceSchema = z.enum(['bounty', 'application', 'message', 'conversation_initial'])

const preflightSchema = z.object({
  surface: moderationSurfaceSchema,
  content: z.string().min(1).max(20000),
  metadata: z.record(z.unknown()).optional(),
  content_type: z.string().min(1).optional(),
  content_id: z.string().min(1).optional(),
})

export async function POST(request: NextRequest) {
  const auth = await requireAgentWithScope(request, 'write')
  if (!auth.ok) return auth.response
  const { agent, supabase } = auth

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = preflightSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.errors }, { status: 400 })
  }

  const { surface, content, metadata, content_type: contentTypeOverride, content_id: contentIdOverride } = parsed.data
  const contentType = contentTypeOverride || surface
  const contentId = contentIdOverride || null

  const moderationConfig = await getModerationRuntimeConfig(supabase)

  try {
    const result = await moderateContent({
      supabase,
      config: moderationConfig,
      input: {
        surface,
        actorType: 'agent',
        actorId: agent.agentId,
        contentType,
        contentId: contentIdOverride,
        content,
        metadata,
      },
    })

    const decisionId = await persistModerationEvent(supabase, {
      surface,
      contentType,
      contentId,
      actorType: 'agent',
      actorId: agent.agentId,
      result,
    })

    if (result.needsRescan) {
      await queueModerationRescan(supabase, {
        surface,
        contentType,
        contentId,
        actorType: 'agent',
        actorId: agent.agentId,
        contentText: content,
        reason: result.timedOut ? 'timeout' : 'provider_error',
      })

      return NextResponse.json(
        {
          success: false,
          error: 'Moderation unavailable. Please retry later.',
          code: 'MODERATION_UNAVAILABLE',
          retryable: true,
          moderation: toModerationResponse(result, {
            contentType,
            contentId,
            decisionId,
          }),
        },
        { status: 503 }
      )
    }

    if (result.spamAction === 'cooldown') {
      return NextResponse.json(
        {
          success: false,
          error: 'Too many similar requests. Please wait before retrying.',
          code: 'SPAM_COOLDOWN',
          moderation: toModerationResponse(result, {
            contentType,
            contentId,
            decisionId,
          }),
        },
        { status: 429 }
      )
    }

    if (result.decision === 'fail') {
      return NextResponse.json(
        {
          success: false,
          error: 'Content blocked for safety or spam risk.',
          code: 'CONTENT_BLOCKED',
          moderation: toModerationResponse(result, {
            contentType,
            contentId,
            decisionId,
          }),
        },
        { status: 422 }
      )
    }

    return NextResponse.json({
      success: true,
      moderation: toModerationResponse(result, {
        contentType,
        contentId,
        decisionId,
      }),
      decision_id: decisionId,
      summary: result.summary,
    })
  } catch (error) {
    await queueModerationRescan(supabase, {
      surface,
      contentType,
      contentId,
      actorType: 'agent',
      actorId: agent.agentId,
      contentText: content,
      reason: 'preflight_error',
    })

    console.error('Moderation preflight failed', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Moderation unavailable. Please retry later.',
        code: 'MODERATION_UNAVAILABLE',
        retryable: true,
      },
      { status: 503 }
    )
  }
}
