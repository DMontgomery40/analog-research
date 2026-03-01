import { NextRequest, NextResponse } from 'next/server'
import { createHash, randomUUID } from 'crypto'
import { createServiceClient } from '@/lib/supabase/server'
import {
  evaluateAutopilotPolicy,
  safeParseAutopilotPolicy,
  type AutopilotPolicyDecision,
} from '@/lib/autopilot/policy'
import { buildPendingBountyActionKey } from '@/lib/autopilot/action-keys'
import { createAutopilotNotification } from '@/lib/autopilot/notifications'
import {
  createBountySchema,
  createBountyWithModeration,
  type CreateBountyInput,
} from '@/lib/bounties/create-bounty'
import { acceptApplicationAsAgent, rejectApplicationAsAgent } from '@/lib/bounties/application-actions'
import {
  getModerationRuntimeConfig,
  moderateContent,
  persistModerationEvent,
  queueModerationRescan,
} from '@/lib/moderation'
import { logger } from '@/lib/logger'
import { createErrorResponse } from '@/lib/supabase/errors'

export const runtime = 'nodejs'

const DEFAULT_CONFIG_LIMIT = 25
const DEFAULT_BOUNTY_LIMIT = 50
const DEFAULT_APPLICATION_LIMIT = 100

const clampLimit = (value: string | null, fallback: number, max: number) => {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(parsed, max)
}

const hashPlan = (plan: unknown) =>
  createHash('sha256').update(JSON.stringify(plan)).digest('hex')

const unique = <T,>(values: T[]) => [...new Set(values)]

const startOfUtcDay = (now: Date) => {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const day = now.getUTCDate()
  return new Date(Date.UTC(year, month, day)).toISOString()
}

type AutopilotCandidateBounty = {
  id: string
  agent_id: string
  status: string
  spots_available: number | null
  spots_filled: number | null
  created_at: string | null
  title: string | null
  skills_required: string[] | null
  pricing_mode: 'bid' | 'fixed_per_spot' | null
  fixed_spot_amount: number | null
  currency: string | null
}

type AutopilotCandidateApplication = {
  id: string
  bounty_id: string
  human_id: string
  status: string
  proposed_rate: number | null
  estimated_hours: number | null
  cover_letter: string | null
  created_at: string | null
}

type AutopilotActionDecision = 'accept' | 'reject' | 'hold' | 'requires_approval'

type AutopilotPlannedAction =
  | {
      type: 'create_bounty'
      payload: CreateBountyInput | null
      action_key: string
      validation_error?: string
    }
  | {
      type: 'review_application'
      target: {
        application_id: string
        bounty_id: string
        human_id: string
      }
      payload: {
        proposed_rate: number | null
        estimated_hours: number | null
        cover_letter: string | null
      }
      decision: AutopilotActionDecision
      policy: AutopilotPolicyDecision
      amount_cents: number | null
      required_skills: string[]
    }

type ModerationPreflightResult =
  | {
      ok: true
      decisionId: string | null
      moderation: unknown
    }
  | {
      ok: false
      reason: string
      retryable: boolean
      decisionId: string | null
      moderation?: unknown
    }

const summarizeBounties = (bounties: AutopilotCandidateBounty[]) =>
  bounties.map((bounty) => ({
    id: bounty.id,
    status: bounty.status,
    created_at: bounty.created_at,
    spots_available: bounty.spots_available,
    spots_filled: bounty.spots_filled,
    pricing_mode: bounty.pricing_mode,
    skills_required: bounty.skills_required,
    spots_remaining:
      bounty.spots_available === null || bounty.spots_filled === null
        ? null
        : Math.max(bounty.spots_available - bounty.spots_filled, 0),
  }))

const summarizeApplications = (applications: AutopilotCandidateApplication[]) =>
  applications.map((application) => ({
    id: application.id,
    bounty_id: application.bounty_id,
    human_id: application.human_id,
    status: application.status,
    proposed_rate: application.proposed_rate,
    estimated_hours: application.estimated_hours,
    created_at: application.created_at,
  }))

const buildPlanCore = (
  configId: string,
  agentId: string,
  bounties: AutopilotCandidateBounty[],
  applications: AutopilotCandidateApplication[],
  actions: AutopilotPlannedAction[]
) => ({
  config_id: configId,
  agent_id: agentId,
  candidate_bounty_ids: bounties.map((bounty) => bounty.id),
  candidate_application_ids: applications.map((application) => application.id),
  actions: actions.map((action) => {
    if (action.type === 'create_bounty') {
      return {
        type: action.type,
        action_key: action.action_key,
      }
    }

    return {
      type: action.type,
      target: action.target,
      decision: action.decision,
    }
  }),
})

const buildApplicationModerationText = (application: AutopilotCandidateApplication) => [
  application.cover_letter || '',
  application.proposed_rate != null ? `proposed_rate=${application.proposed_rate}` : '',
  application.estimated_hours != null ? `estimated_hours=${application.estimated_hours}` : '',
].filter(Boolean).join('\n')

const runModerationPreflight = async (params: {
  supabase: any
  moderationConfig: any
  surface: 'application'
  actorType: 'human' | 'agent'
  actorId: string
  contentType: string
  contentId: string | null
  content: string
  metadata?: Record<string, unknown>
}): Promise<ModerationPreflightResult> => {
  const { supabase, moderationConfig, surface, actorType, actorId, contentType, contentId, content, metadata } = params

  try {
    const result = await moderateContent({
      supabase,
      config: moderationConfig,
      input: {
        surface,
        actorType,
        actorId,
        contentType,
        contentId: contentId ?? undefined,
        content,
        metadata,
      },
    })

    const decisionId = await persistModerationEvent(supabase, {
      surface,
      contentType,
      contentId,
      actorType,
      actorId,
      result,
    })

    if (result.needsRescan) {
      await queueModerationRescan(supabase, {
        surface,
        contentType,
        contentId,
        actorType,
        actorId,
        contentText: content,
        reason: result.timedOut ? 'timeout' : 'provider_error',
      })

      return {
        ok: false,
        reason: 'moderation_unavailable',
        retryable: true,
        decisionId,
        moderation: result,
      }
    }

    if (result.spamAction === 'cooldown') {
      return {
        ok: false,
        reason: 'spam_cooldown',
        retryable: false,
        decisionId,
        moderation: result,
      }
    }

    if (result.decision === 'fail') {
      return {
        ok: false,
        reason: 'content_blocked',
        retryable: false,
        decisionId,
        moderation: result,
      }
    }

    return {
      ok: true,
      decisionId,
      moderation: result,
    }
  } catch {
    await queueModerationRescan(supabase, {
      surface,
      contentType,
      contentId,
      actorType,
      actorId,
      contentText: content,
      reason: 'preflight_error',
    })

    return {
      ok: false,
      reason: 'moderation_error',
      retryable: true,
      decisionId: null,
    }
  }
}

export async function POST(request: NextRequest) {
  const log = logger.withContext('api/v1/autopilot/tick/route.ts', 'POST')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    log.error('Missing CRON_SECRET')
    return createErrorResponse('CRON_SECRET is not configured', 503)
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return createErrorResponse('Unauthorized', 401)
  }

  const configLimit = clampLimit(
    request.nextUrl.searchParams.get('config_limit'),
    DEFAULT_CONFIG_LIMIT,
    100
  )
  const bountyLimit = clampLimit(
    request.nextUrl.searchParams.get('bounty_limit'),
    DEFAULT_BOUNTY_LIMIT,
    250
  )
  const applicationLimit = clampLimit(
    request.nextUrl.searchParams.get('application_limit'),
    DEFAULT_APPLICATION_LIMIT,
    500
  )

  const supabase = await createServiceClient()
  const moderationConfig = await getModerationRuntimeConfig(supabase)

  const { data: configs, error: configError } = await supabase
    .from('agent_autopilot_configs')
    .select('id, agent_id, schema_version, policy')
    .eq('enabled', true)
    .order('updated_at', { ascending: false })
    .limit(configLimit)

  if (configError) {
    log.error('Failed to fetch enabled autopilot configs', {}, { message: configError.message, code: configError.code })
    return createErrorResponse(configError.message, 500, configError.code)
  }

  if (!configs || configs.length === 0) {
    return NextResponse.json({
      success: true,
      data: {
        processed: 0,
        results: [],
      },
    })
  }

  const results: Array<Record<string, unknown>> = []

  for (const config of configs) {
    const actionErrors: Array<Record<string, unknown>> = []
    let runId: string | null = null

    try {
      const policyResult = safeParseAutopilotPolicy(config.policy)
      if (!policyResult.ok) {
        results.push({
          config_id: config.id,
          agent_id: config.agent_id,
          status: 'error',
          error: policyResult.error,
        })
        continue
      }

      const policy = policyResult.policy

      const { data: stateRow } = await supabase
        .from('agent_autopilot_state')
        .select('state')
        .eq('agent_id', config.agent_id)
        .maybeSingle()

      const pendingBountySeeds = Array.isArray(stateRow?.state?.pending_bounties)
        ? (stateRow?.state?.pending_bounties as unknown[])
        : []

      const { data: bounties, error: bountyError } = await supabase
        .from('bounties')
        .select('id, agent_id, status, spots_available, spots_filled, created_at, title, skills_required, pricing_mode, fixed_spot_amount, currency')
        .eq('agent_id', config.agent_id)
        .eq('status', 'open')
        .order('created_at', { ascending: true })
        .limit(bountyLimit)

      if (bountyError) {
        throw new Error(bountyError.message)
      }

      const bountyRows = (bounties || []) as AutopilotCandidateBounty[]
      const bountyIds = bountyRows.map((bounty) => bounty.id)
      const bountyById = new Map(bountyRows.map((bounty) => [bounty.id, bounty]))

      const { data: applications, error: applicationError } = await supabase
        .from('applications')
        .select('id, bounty_id, human_id, status, proposed_rate, estimated_hours, cover_letter, created_at')
        .in('bounty_id', bountyIds.length > 0 ? bountyIds : ['00000000-0000-0000-0000-000000000000'])
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(applicationLimit)

      if (applicationError) {
        throw new Error(applicationError.message)
      }

      const applicationRows = (applications || []) as AutopilotCandidateApplication[]
      const humanIds = unique(applicationRows.map((application) => application.human_id))

      const { data: humanRows, error: humanError } = await supabase
        .from('humans')
        .select('id, human_legitimacy_score')
        .in('id', humanIds.length > 0 ? humanIds : ['00000000-0000-0000-0000-000000000000'])

      if (humanError) {
        throw new Error(humanError.message)
      }

      const humanLegitimacyById = new Map(
        (humanRows || []).map((human: { id: string; human_legitimacy_score: number | null }) => [
          human.id,
          human.human_legitimacy_score,
        ])
      )

      const { data: priorBookings, error: priorBookingsError } = await supabase
        .from('bookings')
        .select('human_id')
        .eq('agent_id', config.agent_id)
        .in('human_id', humanIds.length > 0 ? humanIds : ['00000000-0000-0000-0000-000000000000'])

      if (priorBookingsError) {
        throw new Error(priorBookingsError.message)
      }

      const priorBookingHumanIds = new Set(
        (priorBookings || []).map((booking: { human_id: string }) => booking.human_id)
      )

      const dayStart = startOfUtcDay(new Date())
      const { data: dailyBookings, error: dailyBookingsError } = await supabase
        .from('bookings')
        .select('amount, created_at')
        .eq('agent_id', config.agent_id)
        .gte('created_at', dayStart)

      if (dailyBookingsError) {
        throw new Error(dailyBookingsError.message)
      }

      let projectedDailySpend = (dailyBookings || []).reduce((total: number, booking: { amount: number | null }) => {
        return total + (booking.amount ?? 0)
      }, 0)

      const recentCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      const { data: recentActions, error: recentActionsError } = await supabase
        .from('agent_autopilot_audit_log')
        .select('id')
        .eq('agent_id', config.agent_id)
        .eq('action_status', 'executed')
        .in('action_type', ['create_bounty', 'accept_application', 'reject_application'])
        .gte('created_at', recentCutoff)

      if (recentActionsError) {
        throw new Error(recentActionsError.message)
      }

      let projectedActionCount = (recentActions || []).length

      const actions: AutopilotPlannedAction[] = []

      pendingBountySeeds.forEach((seed, index) => {
        const parsed = createBountySchema.safeParse(seed)
        const actionKey = buildPendingBountyActionKey(seed, index)

        if (!parsed.success) {
          actions.push({
            type: 'create_bounty',
            payload: null,
            action_key: actionKey,
            validation_error: parsed.error.message,
          })
          return
        }

        actions.push({
          type: 'create_bounty',
          payload: parsed.data,
          action_key: actionKey,
        })
      })

      applicationRows.forEach((application) => {
        const bounty = bountyById.get(application.bounty_id)
        if (!bounty) return

        const requiredSkills = (bounty.skills_required || []).filter(Boolean)
        const missingSkill = requiredSkills.find((skill) => !policy.allowed_skills.includes(skill))
        const skillForPolicy = missingSkill ?? requiredSkills[0] ?? null

        const amountCents = bounty.pricing_mode === 'fixed_per_spot'
          ? bounty.fixed_spot_amount ?? null
          : application.proposed_rate ?? null

        const policyDecision = evaluateAutopilotPolicy(policy, {
          skill: skillForPolicy,
          amount_cents: amountCents,
          daily_spend_cents: projectedDailySpend,
          requires_off_session_autopay: false,
          has_prior_booking_with_human: priorBookingHumanIds.has(application.human_id),
          human_legitimacy_score: humanLegitimacyById.get(application.human_id) ?? null,
          recent_action_count_last_hour: projectedActionCount,
        })

        let decision: AutopilotActionDecision = 'hold'

        if (policyDecision.allowed && !policyDecision.requiresApproval) {
          decision = 'accept'
        } else if (policyDecision.requiresApproval) {
          decision = 'requires_approval'
        } else if (
          policy.allowed_skills.length > 0 &&
          (policyDecision.blockedReasons.includes('skill_not_allowed') ||
            policyDecision.blockedReasons.includes('missing_skill'))
        ) {
          decision = 'reject'
        }

        if (decision === 'accept' && amountCents != null) {
          projectedDailySpend += amountCents
          projectedActionCount += 1
        } else if (decision === 'reject') {
          projectedActionCount += 1
        }

        actions.push({
          type: 'review_application',
          target: {
            application_id: application.id,
            bounty_id: application.bounty_id,
            human_id: application.human_id,
          },
          payload: {
            proposed_rate: application.proposed_rate,
            estimated_hours: application.estimated_hours,
            cover_letter: application.cover_letter,
          },
          decision,
          policy: policyDecision,
          amount_cents: amountCents,
          required_skills: requiredSkills,
        })
      })

      const planCore = buildPlanCore(
        config.id,
        config.agent_id,
        bountyRows,
        applicationRows,
        actions
      )
      const planHash = hashPlan(planCore)

      const { data: latestRun, error: latestRunError } = await supabase
        .from('agent_autopilot_runs')
        .select('id, plan, status, result')
        .eq('config_id', config.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (latestRunError) {
        throw new Error(latestRunError.message)
      }

      const latestPlanHash = latestRun?.plan?.plan_hash
      const latestRetryable = Boolean(latestRun?.result?.retryable)
      const latestCompleted = latestRun?.status === 'completed'

      if (latestPlanHash === planHash && latestCompleted && !latestRetryable) {
        results.push({
          config_id: config.id,
          agent_id: config.agent_id,
          status: 'skipped',
          reason: 'plan_unchanged',
          run_id: latestRun.id,
        })
        continue
      }

      const { data: runningRun, error: runningRunError } = await supabase
        .from('agent_autopilot_runs')
        .select('id, created_at')
        .eq('config_id', config.id)
        .eq('status', 'running')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (runningRunError) {
        throw new Error(runningRunError.message)
      }

      if (runningRun) {
        results.push({
          config_id: config.id,
          agent_id: config.agent_id,
          status: 'skipped',
          reason: 'run_in_progress',
          run_id: runningRun.id,
        })
        continue
      }

      runId = randomUUID()
      const generatedAt = new Date().toISOString()
      const tickKey = generatedAt.slice(0, 13)

      const plan = {
        plan_hash: planHash,
        tick_key: tickKey,
        generated_at: generatedAt,
        candidate_bounties: summarizeBounties(bountyRows),
        candidate_applications: summarizeApplications(applicationRows),
        actions,
      }

      const { error: runError } = await supabase
        .from('agent_autopilot_runs')
        .insert({
          id: runId,
          agent_id: config.agent_id,
          config_id: config.id,
          status: 'running',
          plan,
          result: {},
        })

      if (runError) {
        if (runError.code === '23505') {
          const { data: concurrentRun } = await supabase
            .from('agent_autopilot_runs')
            .select('id')
            .eq('config_id', config.id)
            .eq('status', 'running')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          results.push({
            config_id: config.id,
            agent_id: config.agent_id,
            status: 'skipped',
            reason: 'run_in_progress',
            run_id: concurrentRun?.id ?? null,
          })
          continue
        }
        throw new Error(runError.message)
      }

      const plannedAuditEntries = [
        {
          agent_id: config.agent_id,
          run_id: runId,
          config_id: config.id,
          action_type: 'plan_created',
          action_status: 'planned',
          inputs: {
            tick_key: tickKey,
            candidate_bounty_ids: planCore.candidate_bounty_ids,
            candidate_application_ids: planCore.candidate_application_ids,
          },
          decision: {
            action_count: actions.length,
          },
          result_ids: {},
        },
        ...actions.map((action) => ({
          agent_id: config.agent_id,
          run_id: runId,
          config_id: config.id,
          action_type: action.type,
          action_status: 'planned',
          inputs: action.type === 'create_bounty'
            ? { action_key: action.action_key }
            : action.target,
          decision: action.type === 'create_bounty'
            ? { validation_error: action.validation_error ?? null }
            : {
              decision: action.decision,
              policy: action.policy,
              amount_cents: action.amount_cents,
              required_skills: action.required_skills,
            },
          result_ids: {},
        })),
      ]

      const { error: auditError } = await supabase
        .from('agent_autopilot_audit_log')
        .insert(plannedAuditEntries)

      if (auditError) {
        throw new Error(auditError.message)
      }

      let executedCount = 0
      let acceptedCount = 0
      let rejectedCount = 0
      let bountyCreatedCount = 0
      let blockedCount = 0
      let approvalCount = 0
      let failedCount = 0
      let retryable = false

      const notifyOwner = async (payload: {
        title: string
        body?: string | null
        data?: Record<string, unknown>
      }) => {
        await createAutopilotNotification({
          supabase,
          agentId: config.agent_id,
          title: payload.title,
          body: payload.body ?? null,
          data: payload.data ?? {},
        })
      }

      for (const action of actions) {
        if (action.type === 'create_bounty') {
          if (!action.payload) {
            blockedCount += 1
            await supabase.from('agent_autopilot_audit_log').insert({
              agent_id: config.agent_id,
              run_id: runId,
              config_id: config.id,
              action_type: 'create_bounty',
              action_status: 'blocked',
              inputs: { action_key: action.action_key },
              decision: { error: action.validation_error ?? 'invalid_payload' },
              result_ids: {},
            })
            continue
          }

          const result = await createBountyWithModeration({
            supabase,
            actor: {
              actorType: 'agent',
              actorId: config.agent_id,
              agentId: config.agent_id,
            },
            data: action.payload,
            failClosed: true,
          })

          if (result.ok) {
            executedCount += 1
            bountyCreatedCount += 1
            await supabase.from('agent_autopilot_audit_log').insert({
              agent_id: config.agent_id,
              run_id: runId,
              config_id: config.id,
              action_type: 'create_bounty',
              action_status: 'executed',
              inputs: { action_key: action.action_key },
              decision: { moderation: result.moderation },
              moderation_event_id: result.decisionId,
              result_ids: { bounty_id: result.data.id },
            })
            await notifyOwner({
              title: 'Autopilot created a bounty',
              body: action.payload.title ? `"${action.payload.title}"` : null,
              data: {
                run_id: runId,
                config_id: config.id,
                action_type: 'create_bounty',
                action_status: 'executed',
                bounty_id: result.data.id,
              },
            })
          } else {
            blockedCount += 1
            if (result.retryable) {
              retryable = true
            }
            const actionStatus = result.status >= 500 ? 'failed' : 'blocked'
            await supabase.from('agent_autopilot_audit_log').insert({
              agent_id: config.agent_id,
              run_id: runId,
              config_id: config.id,
              action_type: 'create_bounty',
              action_status: actionStatus,
              inputs: { action_key: action.action_key },
              decision: {
                error: result.error,
                code: result.code,
                moderation: result.moderation ?? null,
              },
              moderation_event_id: result.decisionId ?? null,
              result_ids: {},
            })
            if (actionStatus === 'failed') {
              await notifyOwner({
                title: 'Autopilot bounty creation failed',
                body: result.error,
                data: {
                  run_id: runId,
                  config_id: config.id,
                  action_type: 'create_bounty',
                  action_status: actionStatus,
                  error: result.error,
                  code: result.code,
                },
              })
            }
          }

          continue
        }

        if (action.decision === 'requires_approval') {
          approvalCount += 1
          await supabase.from('agent_autopilot_audit_log').insert({
            agent_id: config.agent_id,
            run_id: runId,
            config_id: config.id,
            action_type: 'review_application',
            action_status: 'requires_approval',
            inputs: action.target,
            decision: {
              policy: action.policy,
              reason: 'requires_approval',
            },
            result_ids: {},
          })
          await notifyOwner({
            title: 'Autopilot needs approval',
            body: 'Review a pending application.',
            data: {
              run_id: runId,
              config_id: config.id,
              action_type: 'review_application',
              action_status: 'requires_approval',
              ...action.target,
            },
          })
          continue
        }

        if (action.decision === 'hold') {
          blockedCount += 1
          await supabase.from('agent_autopilot_audit_log').insert({
            agent_id: config.agent_id,
            run_id: runId,
            config_id: config.id,
            action_type: 'review_application',
            action_status: 'blocked',
            inputs: action.target,
            decision: {
              policy: action.policy,
              reason: 'blocked',
            },
            result_ids: {},
          })
          continue
        }

        const application = applicationRows.find((row) => row.id === action.target.application_id)
        const bounty = bountyById.get(action.target.bounty_id)

        if (!application || !bounty) {
          blockedCount += 1
          await supabase.from('agent_autopilot_audit_log').insert({
            agent_id: config.agent_id,
            run_id: runId,
            config_id: config.id,
            action_type: 'review_application',
            action_status: 'blocked',
            inputs: action.target,
            decision: { error: 'missing_application_or_bounty' },
            result_ids: {},
          })
          continue
        }

        const moderationText = buildApplicationModerationText(application)
        const moderationOutcome = await runModerationPreflight({
          supabase,
          moderationConfig,
          surface: 'application',
          actorType: 'human',
          actorId: application.human_id,
          contentType: 'application',
          contentId: application.id,
          content: moderationText,
          metadata: {
            bounty_id: application.bounty_id,
            bounty_agent_id: config.agent_id,
            bounty_currency: bounty.currency,
            pricing_mode: bounty.pricing_mode,
          },
        })

        if (!moderationOutcome.ok) {
          blockedCount += 1
          if (moderationOutcome.retryable) {
            retryable = true
          }
          await supabase.from('agent_autopilot_audit_log').insert({
            agent_id: config.agent_id,
            run_id: runId,
            config_id: config.id,
            action_type: action.decision === 'accept' ? 'accept_application' : 'reject_application',
            action_status: 'blocked',
            inputs: action.target,
            decision: {
              reason: moderationOutcome.reason,
              policy: action.policy,
            },
            moderation_event_id: moderationOutcome.decisionId ?? null,
            result_ids: {},
          })
          continue
        }

        if (action.decision === 'accept') {
          const result = await acceptApplicationAsAgent({
            supabase,
            agentId: config.agent_id,
            bountyId: action.target.bounty_id,
            applicationId: action.target.application_id,
          })

          if (!result.ok) {
            failedCount += 1
            actionErrors.push({
              action: 'accept_application',
              application_id: action.target.application_id,
              error: result.error,
            })
            await supabase.from('agent_autopilot_audit_log').insert({
              agent_id: config.agent_id,
              run_id: runId,
              config_id: config.id,
              action_type: 'accept_application',
              action_status: 'failed',
              inputs: action.target,
              decision: { error: result.error },
              moderation_event_id: moderationOutcome.decisionId ?? null,
              result_ids: {},
            })
            await notifyOwner({
              title: 'Autopilot failed to accept an application',
              body: result.error,
              data: {
                run_id: runId,
                config_id: config.id,
                action_type: 'accept_application',
                action_status: 'failed',
                ...action.target,
              },
            })
            continue
          }

          executedCount += 1
          acceptedCount += 1
          await supabase.from('agent_autopilot_audit_log').insert({
            agent_id: config.agent_id,
            run_id: runId,
            config_id: config.id,
            action_type: 'accept_application',
            action_status: 'executed',
            inputs: action.target,
            decision: { policy: action.policy },
            moderation_event_id: moderationOutcome.decisionId ?? null,
            result_ids: {
              application_id: action.target.application_id,
              booking_id: result.booking?.id,
            },
          })
          await notifyOwner({
            title: 'Autopilot accepted an application',
            body: bounty?.title ? `"${bounty.title}"` : null,
            data: {
              run_id: runId,
              config_id: config.id,
              action_type: 'accept_application',
              action_status: 'executed',
              ...action.target,
              booking_id: result.booking?.id,
            },
          })
          continue
        }

        const rejectResult = await rejectApplicationAsAgent({
          supabase,
          agentId: config.agent_id,
          bountyId: action.target.bounty_id,
          applicationId: action.target.application_id,
        })

        if (!rejectResult.ok) {
          failedCount += 1
          actionErrors.push({
            action: 'reject_application',
            application_id: action.target.application_id,
            error: rejectResult.error,
          })
          await supabase.from('agent_autopilot_audit_log').insert({
            agent_id: config.agent_id,
            run_id: runId,
            config_id: config.id,
            action_type: 'reject_application',
            action_status: 'failed',
            inputs: action.target,
            decision: { error: rejectResult.error },
            moderation_event_id: moderationOutcome.decisionId ?? null,
            result_ids: {},
          })
          await notifyOwner({
            title: 'Autopilot failed to reject an application',
            body: rejectResult.error,
            data: {
              run_id: runId,
              config_id: config.id,
              action_type: 'reject_application',
              action_status: 'failed',
              ...action.target,
            },
          })
          continue
        }

        executedCount += 1
        rejectedCount += 1
        await supabase.from('agent_autopilot_audit_log').insert({
          agent_id: config.agent_id,
          run_id: runId,
          config_id: config.id,
          action_type: 'reject_application',
          action_status: 'executed',
          inputs: action.target,
          decision: { policy: action.policy },
          moderation_event_id: moderationOutcome.decisionId ?? null,
          result_ids: {
            application_id: action.target.application_id,
          },
        })
        await notifyOwner({
          title: 'Autopilot rejected an application',
          body: bounty?.title ? `"${bounty.title}"` : null,
          data: {
            run_id: runId,
            config_id: config.id,
            action_type: 'reject_application',
            action_status: 'executed',
            ...action.target,
          },
        })
      }

      const runResult = {
        planned: actions.length,
        executed: executedCount,
        accepted: acceptedCount,
        rejected: rejectedCount,
        bounties_created: bountyCreatedCount,
        blocked: blockedCount,
        requires_approval: approvalCount,
        failed: failedCount,
        retryable,
        errors: actionErrors,
      }

      const { error: updateError } = await supabase
        .from('agent_autopilot_runs')
        .update({
          status: failedCount > 0 ? 'failed' : 'completed',
          result: runResult,
        })
        .eq('id', runId)

      if (updateError) {
        throw new Error(updateError.message)
      }

      results.push({
        config_id: config.id,
        agent_id: config.agent_id,
        status: failedCount > 0 ? 'failed' : 'completed',
        run_id: runId,
        action_count: actions.length,
        result: runResult,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'

      if (runId) {
        try {
          await supabase
            .from('agent_autopilot_runs')
            .update({
              status: 'failed',
              result: { error: message, retryable: true },
            })
            .eq('id', runId)
            .eq('status', 'running')
        } catch (updateError) {
          log.error(
            'Failed to mark autopilot run failed after exception',
            { runId },
            updateError instanceof Error ? { message: updateError.message } : { message: String(updateError) }
          )
        }
      }

      results.push({
        config_id: config.id,
        agent_id: config.agent_id,
        status: 'error',
        ...(runId ? { run_id: runId } : {}),
        error: message,
      })
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      processed: results.length,
      results,
    },
  })
}
