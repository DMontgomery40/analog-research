import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { authenticateAgent, hasAgentScope } from '@/lib/api-auth'
import { createBountySchema, createBountyWithModeration } from '@/lib/bounties/create-bounty'
import { parseBoundedIntegerParam } from '@/lib/request-params'
import { logger } from '@/lib/logger'
import { handleSingleResult, isMissingColumnError } from '@/lib/supabase/errors'
import { enforceApiKeyRateLimitOrResponse } from '@/lib/api-key-rate-limit'
import { resolveOrCreateSessionOwnerAgent } from '@/lib/session-owner-agent'

export const runtime = 'nodejs'

const CURRENCY_CODE_REGEX = /^[A-Z]{3}$/

function withCapacity<T extends { spots_available: number; spots_filled: number }>(bounty: T) {
  return {
    ...bounty,
    spots_remaining: Math.max(bounty.spots_available - bounty.spots_filled, 0),
    escrow_funding_model: 'deferred_per_booking' as const,
  }
}

function parseIntegerParam(value: string | null): number | null {
  if (value === null) {
    return null
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? null : parsed
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const status = searchParams.get('status')
  const skills = searchParams.get('skills')?.split(',').filter(Boolean)
  const budgetMin = parseIntegerParam(searchParams.get('budget_min'))
  const budgetMax = parseIntegerParam(searchParams.get('budget_max'))
  const hasDeadline = searchParams.get('has_deadline')
  const currency = searchParams.get('currency')?.trim().toUpperCase()
  const pricingMode = searchParams.get('pricing_mode')
  const minSpotsRemaining = parseIntegerParam(searchParams.get('min_spots_remaining'))
  const minBlsRaw = searchParams.get('min_bls')
  const minBls = minBlsRaw === null ? null : Number.parseFloat(minBlsRaw)
  const limitResult = parseBoundedIntegerParam(searchParams.get('limit'), {
    paramName: 'limit',
    min: 1,
    max: 100,
    defaultValue: 20,
  })
  const offsetResult = parseBoundedIntegerParam(searchParams.get('offset'), {
    paramName: 'offset',
    min: 0,
    max: 10000,
    defaultValue: 0,
  })

  if (!limitResult.ok) {
    return NextResponse.json({ success: false, error: limitResult.error }, { status: 400 })
  }

  if (!offsetResult.ok) {
    return NextResponse.json({ success: false, error: offsetResult.error }, { status: 400 })
  }

  const limit = limitResult.value
  const offset = offsetResult.value

  if (currency && !CURRENCY_CODE_REGEX.test(currency)) {
    return NextResponse.json({ success: false, error: 'currency must be a 3-letter ISO-4217 code' }, { status: 400 })
  }

  if (pricingMode && !['bid', 'fixed_per_spot'].includes(pricingMode)) {
    return NextResponse.json({ success: false, error: 'pricing_mode must be bid or fixed_per_spot' }, { status: 400 })
  }

  if (minSpotsRemaining !== null && minSpotsRemaining < 0) {
    return NextResponse.json({ success: false, error: 'min_spots_remaining must be greater than or equal to 0' }, { status: 400 })
  }

  if (minBlsRaw !== null && (Number.isNaN(minBls) || (minBls !== null && (minBls < 0 || minBls > 100)))) {
    return NextResponse.json({ success: false, error: 'min_bls must be a number between 0 and 100' }, { status: 400 })
  }

  // Check for agent auth to filter by their bounties
  const agent = await authenticateAgent(request)

  if (agent) {
    const rateLimitResponse = await enforceApiKeyRateLimitOrResponse(agent)
    if (rateLimitResponse) return rateLimitResponse
  }

  // Public bounty feeds should not depend on anon RLS joins. Use service reads and
  // explicitly control the selected fields in this handler.
  const supabase = await createServiceClient()

  const publicSelectPreferred = 'id, agent_id, title, description, skills_required, budget_min, budget_max, deadline, status, application_count, view_count, created_at, updated_at, spots_available, spots_filled, pricing_mode, fixed_spot_amount, currency, preferred_payment_method, proof_review_mode, bounty_legitimacy_score, agents(name)'
  const publicSelectFallback = 'id, agent_id, title, description, skills_required, budget_min, budget_max, deadline, status, application_count, view_count, created_at, updated_at, spots_available, spots_filled, pricing_mode, fixed_spot_amount, currency, bounty_legitimacy_score, agents(name)'
  const agentSelectPreferred = 'id, agent_id, title, description, skills_required, budget_min, budget_max, deadline, status, application_count, view_count, created_at, updated_at, spots_available, spots_filled, pricing_mode, fixed_spot_amount, currency, preferred_payment_method, proof_review_mode, proof_review_prompt, bounty_legitimacy_score, is_spam_suppressed, agents(name)'
  const agentSelectFallback = 'id, agent_id, title, description, skills_required, budget_min, budget_max, deadline, status, application_count, view_count, created_at, updated_at, spots_available, spots_filled, pricing_mode, fixed_spot_amount, currency, bounty_legitimacy_score, is_spam_suppressed, agents(name)'

  const buildQuery = (select: string) => {
    let query = supabase
      .from('bounties')
      .select(select, { count: 'exact' })
      .order('created_at', { ascending: false })

    // `spots_remaining` is a generated DB column in newer schemas. When callers
    // request min spots filtering, fetch then filter in code to stay compatible
    // with environments that have not yet added that column.
    if (minSpotsRemaining === null) {
      query = query.range(offset, offset + limit - 1)
    }

    if (agent) {
      query = query.eq('agent_id', agent.agentId)
    } else if (!status) {
      // Public view defaults to open listings.
      query = query.eq('status', 'open')
    }

    if (!agent) {
      // Keep suppressed spam out of public feeds while being null-safe during rollout.
      query = query.or('is_spam_suppressed.is.false,is_spam_suppressed.is.null')
    }

    if (status) {
      query = query.eq('status', status)
    }

    if (skills?.length) {
      query = query.overlaps('skills_required', skills)
    }

    if (budgetMin !== null) {
      query = query.gte('budget_min', budgetMin)
    }

    if (budgetMax !== null) {
      query = query.lte('budget_max', budgetMax)
    }

    if (hasDeadline === 'true') {
      query = query.not('deadline', 'is', null)
    } else if (hasDeadline === 'false') {
      query = query.is('deadline', null)
    }

    if (currency) {
      query = query.eq('currency', currency)
    }

    if (pricingMode) {
      query = query.eq('pricing_mode', pricingMode)
    }

    if (minBls !== null) {
      query = query.gte('bounty_legitimacy_score', minBls)
    }

    return query
  }

  const preferredSelect = agent ? agentSelectPreferred : publicSelectPreferred
  const fallbackSelect = agent ? agentSelectFallback : publicSelectFallback

  const preferredResult = await buildQuery(preferredSelect)
  let data = preferredResult.data
  let error = preferredResult.error
  let count = preferredResult.count

  // Stay compatible with environments that haven't migrated preferred_payment_method/proof_review_mode yet.
  if (isMissingColumnError(error, { table: 'bounties' })) {
    const fallbackResult = await buildQuery(fallbackSelect)
    data = fallbackResult.data
    error = fallbackResult.error
    count = fallbackResult.count
  }

  if (error) {
    const log = logger.withContext('api/v1/bounties/route.ts', 'GET')
    log.error('Failed to fetch bounties', { status, skills }, error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  const bountiesWithCapacity = ((data || []) as unknown as Array<Record<string, unknown> & {
    spots_available: number
    spots_filled: number
  }>).map((bounty) => ({
    ...withCapacity(bounty),
    preferred_payment_method: (bounty as { preferred_payment_method?: unknown }).preferred_payment_method ?? null,
    proof_review_mode: (bounty as { proof_review_mode?: unknown }).proof_review_mode ?? 'manual',
  }))

  const filteredBounties = minSpotsRemaining === null
    ? bountiesWithCapacity
    : bountiesWithCapacity.filter((bounty) => bounty.spots_remaining >= minSpotsRemaining)

  const paginatedBounties = minSpotsRemaining === null
    ? filteredBounties
    : filteredBounties.slice(offset, offset + limit)

  const total = minSpotsRemaining === null
    ? (count || 0)
    : filteredBounties.length

  return NextResponse.json({
    success: true,
    data: paginatedBounties,
    pagination: {
      offset,
      limit,
      total,
    },
  })
}

export async function POST(request: NextRequest) {
  // Try agent auth first
  const agent = await authenticateAgent(request)

  // If no agent auth, try human auth
  let agentId: string | null = null
  let actorType: 'agent' | 'human' = 'agent'
  let actorId: string | null = null
  let humanId: string | null = null

  if (agent) {
    if (!hasAgentScope(agent, 'write')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 })
    }

    const rateLimitResponse = await enforceApiKeyRateLimitOrResponse(agent)
    if (rateLimitResponse) return rateLimitResponse

    agentId = agent.agentId
    actorType = 'agent'
    actorId = agent.agentId
  } else {
    const log = logger.withContext('api/v1/bounties/route.ts', 'POST')
    // Try human auth via Supabase session
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized - API key or session required' }, { status: 401 })
    }

    // Get the human's profile and check if they have an associated agent
    const { data: humanData, error: humanError } = await supabase
      .from('humans')
      .select('id')
      .eq('user_id', user.id)
      .single()

    const humanResult = handleSingleResult(humanData, humanError, log, 'Human profile', { userId: user.id })
    if (humanResult.response) return humanResult.response
    const human = humanResult.data

    actorType = 'human'
    actorId = human.id
    humanId = human.id

    const serviceClient = await createServiceClient()
    const ownerAgent = await resolveOrCreateSessionOwnerAgent(serviceClient, user.id)
    if (!ownerAgent) {
      log.error('Failed to resolve owner agent', { humanId: human.id, userId: user.id })
      return NextResponse.json({ success: false, error: 'Failed to create agent profile' }, { status: 500 })
    }

    agentId = ownerAgent.agentId
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = createBountySchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.errors }, { status: 400 })
  }

  const { data: parsedData } = parsed

  const supabase = await createServiceClient()
  if (!actorId || !agentId) {
    return NextResponse.json({ success: false, error: 'Unable to resolve author identity' }, { status: 500 })
  }
  const result = await createBountyWithModeration({
    supabase,
    actor: {
      actorType,
      actorId,
      agentId,
      humanId,
    },
    data: parsedData,
    failClosed: false,
  })

  if (!result.ok) {
    return NextResponse.json({
      success: false,
      error: result.error,
      code: result.code,
      moderation: result.moderation,
    }, { status: result.status })
  }

  return NextResponse.json({
    success: true,
    data: withCapacity(result.data),
    moderation: result.moderation,
  }, { status: 201 })
}
