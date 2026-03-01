import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  getModerationRuntimeConfig,
  moderateContent,
  moderationColumnsFromResult,
  persistModerationEvent,
  toModerationResponse,
} from '@/lib/moderation'
import { logger } from '@/lib/logger'
import { createErrorResponse } from '@/lib/supabase/errors'

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback
  const parsed = parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get('Authorization') === `Bearer ${secret}`
}

function nextRetryTime(attemptCount: number): string {
  const minutes = Math.min(60, Math.max(1, 2 ** attemptCount))
  return new Date(Date.now() + minutes * 60 * 1000).toISOString()
}

export async function POST(request: NextRequest) {
  const log = logger.withContext('api/v1/moderation/rescan/route.ts', 'POST')

  if (!isAuthorized(request)) {
    return createErrorResponse('Unauthorized', 401)
  }

  const limit = Math.min(Math.max(parsePositiveInt(request.nextUrl.searchParams.get('limit'), 25), 1), 100)

  const supabase = await createServiceClient()
  let config
  try {
    config = await getModerationRuntimeConfig(supabase)
  } catch (error) {
    log.error(
      'Failed to load moderation runtime config',
      {},
      error instanceof Error ? error : { message: String(error) }
    )
    return createErrorResponse('Failed to load moderation configuration', 500)
  }

  const { data: jobs, error } = await supabase
    .from('moderation_rescan_queue')
    .select('*')
    .eq('status', 'pending')
    .lte('next_run_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    log.error('Failed to fetch rescan jobs', {}, { message: error.message, code: error.code })
    return createErrorResponse(error.message, 500, error.code)
  }

  const processed: Array<Record<string, unknown>> = []

  for (const job of jobs || []) {
    const attemptNumber = Number(job.attempt_count || 0) + 1

    try {
      // Claim the job so concurrent workers don't process it twice.
      const { data: claimedJob, error: claimError } = await supabase
        .from('moderation_rescan_queue')
        .update({
          status: 'processing',
          attempt_count: attemptNumber,
        })
        .eq('id', job.id)
        .eq('status', 'pending')
        .select('*')
        .maybeSingle()

      if (claimError) {
        throw new Error(claimError.message)
      }

      if (!claimedJob) {
        // Another worker claimed this job first.
        continue
      }

      let completionNote: string | null = null
      const result = await moderateContent({
        supabase,
        config,
        input: {
          surface: claimedJob.surface,
          actorType: claimedJob.actor_type,
          actorId: claimedJob.actor_id,
          contentType: claimedJob.content_type,
          contentId: claimedJob.content_id || undefined,
          content: claimedJob.content_text,
          metadata: {
            rescan: {
              job_id: claimedJob.id,
              attempt: attemptNumber,
              reason: claimedJob.reason,
            },
          },
        },
      })

      const decisionId = await persistModerationEvent(supabase, {
        surface: claimedJob.surface,
        contentType: claimedJob.content_type,
        contentId: claimedJob.content_id,
        actorType: claimedJob.actor_type,
        actorId: claimedJob.actor_id,
        result,
      })

      if (claimedJob.content_id && (claimedJob.content_type === 'bounty' || claimedJob.content_type === 'application' || claimedJob.content_type === 'message')) {
        const tableName = claimedJob.content_type === 'bounty'
          ? 'bounties'
          : claimedJob.content_type === 'application'
            ? 'applications'
            : 'messages'

        const updatePayload: Record<string, unknown> = {
          ...moderationColumnsFromResult(result),
        }

        if (tableName === 'bounties') {
          updatePayload.is_spam_suppressed = result.spamAction === 'suppress'
        }

        const { data: updatedRows, error: contentUpdateError } = await supabase
          .from(tableName)
          .update(updatePayload)
          .eq('id', claimedJob.content_id)
          .select('id')

        if (contentUpdateError) {
          throw new Error(contentUpdateError.message)
        }

        if (Array.isArray(updatedRows) && updatedRows.length === 0) {
          completionNote = 'content_not_found'
        }
      }

      await supabase
        .from('moderation_rescan_queue')
        .update({
          status: 'completed',
          last_error: completionNote,
        })
        .eq('id', claimedJob.id)
        .eq('status', 'processing')

      processed.push({
        id: claimedJob.id,
        status: 'completed',
        ...(completionNote ? { note: completionNote } : {}),
        moderation: toModerationResponse(result, {
          contentType: claimedJob.content_type,
          contentId: claimedJob.content_id,
          decisionId,
        }),
      })
    } catch (scanError) {
      const willFail = attemptNumber >= 5

      const { error: queueUpdateError } = await supabase
        .from('moderation_rescan_queue')
        .update({
          status: willFail ? 'failed' : 'pending',
          attempt_count: attemptNumber,
          next_run_at: willFail ? job.next_run_at : nextRetryTime(attemptNumber),
          last_error: scanError instanceof Error ? scanError.message : 'Unknown rescan error',
        })
        .eq('id', job.id)
        .eq('status', 'processing')

      if (queueUpdateError) {
        log.error(
          'Failed to update moderation rescan queue job after error',
          { jobId: job.id },
          { message: queueUpdateError.message, code: queueUpdateError.code }
        )
      }

      processed.push({
        id: job.id,
        status: willFail ? 'failed' : 'pending',
      })
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      selected: (jobs || []).length,
      processed,
    },
  })
}
