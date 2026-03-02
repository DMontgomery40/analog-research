#!/usr/bin/env node

import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadLocalEnv } from '../founding-bounties/env.mjs'
import {
  PURGE_BOUNTY_TITLE_PATTERNS,
  PURGE_HUMAN_NAME_PATTERNS,
  SHOWCASE_BOUNTIES,
  SHOWCASE_HUMANS,
} from './showcase-payloads.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..', '..')
loadLocalEnv(repoRoot)

const args = new Set(process.argv.slice(2))
const apply = args.has('--apply')
const dryRun = !apply

if (args.has('--dry-run') && apply) {
  console.error('Choose only one mode: --dry-run (default) or --apply')
  process.exit(1)
}

const supabaseUrl = (
  process.env.NEXT_PUBLIC_SUPABASE_URL
  || process.env.SUPABASE_PROJECT_URL
  || ''
).trim().replace(/\/$/, '')

const serviceRoleKey = (
  process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_SECRET_KEY
  || ''
).trim()

function ensure(value, label) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${label}`)
  }
  return value
}

ensure(supabaseUrl, 'NEXT_PUBLIC_SUPABASE_URL or SUPABASE_PROJECT_URL')
ensure(serviceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY')

function authHeaders() {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  }
}

function parseBody(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function http(url, options = {}) {
  const response = await fetch(url, options)
  const text = await response.text()
  const body = parseBody(text)
  return {
    ok: response.ok,
    status: response.status,
    body,
    text,
  }
}

function formatError(result, context) {
  const detail = typeof result.body === 'string'
    ? result.body
    : JSON.stringify(result.body || { message: result.text || 'Unknown error' })
  return new Error(`${context} failed (${result.status}): ${detail}`)
}

function restUrl(table, params) {
  const query = params ? `?${params.toString()}` : ''
  return `${supabaseUrl}/rest/v1/${table}${query}`
}

function authAdminUrl(pathname, params) {
  const query = params ? `?${params.toString()}` : ''
  return `${supabaseUrl}/auth/v1/admin/${pathname}${query}`
}

function extractMissingColumn(errorBody) {
  if (!errorBody || typeof errorBody === 'string') return null
  const source = [errorBody.message, errorBody.details, errorBody.hint]
    .filter(Boolean)
    .join(' ')

  const patterns = [
    /column ['"]?([a-z0-9_]+)['"]?/i,
    /Could not find the ['"]?([a-z0-9_]+)['"]? column/i,
    /attribute ['"]?([a-z0-9_]+)['"]?/i,
  ]

  for (const pattern of patterns) {
    const match = source.match(pattern)
    if (match?.[1]) {
      return match[1]
    }
  }

  return null
}

async function upsertWithMissingColumnFallback(mutate) {
  let payload = null
  while (true) {
    const result = await mutate(payload)
    if (result.ok) {
      return result
    }

    const missingColumn = extractMissingColumn(result.body)
    if (!missingColumn) {
      throw formatError(result, 'Mutation')
    }

    payload = payload || { ...result.originalPayload }
    if (!Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
      throw formatError(result, 'Mutation')
    }

    delete payload[missingColumn]
  }
}

async function listPurgeCandidates() {
  const candidatesById = new Map()

  for (const pattern of PURGE_BOUNTY_TITLE_PATTERNS) {
    const params = new URLSearchParams({
      select: 'id,title',
      title: `ilike.${pattern}`,
      limit: '1000',
    })

    const result = await http(restUrl('bounties', params), {
      headers: authHeaders(),
    })

    if (!result.ok) {
      throw formatError(result, `List bounty purge candidates for pattern "${pattern}"`)
    }

    for (const row of result.body || []) {
      candidatesById.set(row.id, row)
    }
  }

  return Array.from(candidatesById.values())
}

async function listHumanPurgeCandidates() {
  const candidatesById = new Map()

  for (const pattern of PURGE_HUMAN_NAME_PATTERNS) {
    const params = new URLSearchParams({
      select: 'id,name',
      name: `ilike.${pattern}`,
      limit: '1000',
    })

    const result = await http(restUrl('humans', params), {
      headers: authHeaders(),
    })

    if (!result.ok) {
      throw formatError(result, `List human purge candidates for pattern "${pattern}"`)
    }

    for (const row of result.body || []) {
      candidatesById.set(row.id, row)
    }
  }

  return Array.from(candidatesById.values())
}

async function deleteBountiesById(bountyIds) {
  let deleted = 0
  for (const bountyId of bountyIds) {
    const params = new URLSearchParams({ id: `eq.${bountyId}` })
    const result = await http(restUrl('bounties', params), {
      method: 'DELETE',
      headers: {
        ...authHeaders(),
        Prefer: 'return=minimal',
      },
    })

    if (!result.ok) {
      throw formatError(result, `Delete bounty ${bountyId}`)
    }

    deleted += 1
  }

  return deleted
}

async function deleteHumansById(humanIds) {
  let deleted = 0
  for (const humanId of humanIds) {
    const params = new URLSearchParams({ id: `eq.${humanId}` })
    const result = await http(restUrl('humans', params), {
      method: 'DELETE',
      headers: {
        ...authHeaders(),
        Prefer: 'return=minimal',
      },
    })

    if (!result.ok) {
      throw formatError(result, `Delete human ${humanId}`)
    }

    deleted += 1
  }

  return deleted
}

async function listAuthUsers() {
  const users = []
  let page = 1
  const perPage = 200

  while (true) {
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
    })

    const result = await http(authAdminUrl('users', params), {
      headers: authHeaders(),
    })

    if (!result.ok) {
      throw formatError(result, 'List auth users')
    }

    const pageUsers = Array.isArray(result.body?.users) ? result.body.users : []
    users.push(...pageUsers)

    if (pageUsers.length < perPage) break
    page += 1

    if (page > 100) {
      throw new Error('Auth users pagination exceeded safety cap (100 pages)')
    }
  }

  return users
}

async function findAuthUserByEmail(email) {
  const users = await listAuthUsers()
  const targetEmail = email.trim().toLowerCase()
  return users.find((user) => String(user.email || '').toLowerCase() === targetEmail) || null
}

async function createAuthUser(email, showcaseKey) {
  const password = `Showcase!${crypto.randomBytes(16).toString('hex')}`
  const result = await http(authAdminUrl('users'), {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        source: 'public_showcase_hotfix',
        showcase_key: showcaseKey,
      },
    }),
  })

  if (!result.ok) {
    return null
  }

  return result.body
}

function buildHumanWritePayload(human, userId) {
  const socialLinks = human.social_links || {}

  return {
    user_id: userId,
    name: human.name,
    bio: human.bio,
    avatar_url: human.avatar_url,
    location: human.location,
    drive_radius_miles: human.drive_radius_miles,
    timezone: human.timezone,
    skills: human.skills,
    rate_min: human.rate_min,
    rate_max: human.rate_max,
    availability: human.availability,
    wallet_address: human.wallet_address,
    rating_average: human.rating_average,
    rating_count: human.rating_count,
    completed_bookings: human.completed_bookings,
    is_verified: human.is_verified,
    verified_at: human.is_verified ? new Date().toISOString() : null,
    human_legitimacy_score: human.human_legitimacy_score,
    human_legitimacy_confidence: human.human_legitimacy_confidence,
    social_links: socialLinks,
    github_url: socialLinks.github || null,
    linkedin_url: socialLinks.linkedin || null,
    instagram_url: socialLinks.instagram || null,
    youtube_url: socialLinks.youtube || null,
    website_url: socialLinks.website || null,
  }
}

async function fetchHumanByUserId(userId) {
  const params = new URLSearchParams({
    select: 'id,user_id,name',
    user_id: `eq.${userId}`,
    limit: '1',
  })

  const result = await http(restUrl('humans', params), {
    headers: authHeaders(),
  })

  if (!result.ok) {
    throw formatError(result, `Find human by user_id ${userId}`)
  }

  return (result.body || [])[0] || null
}

async function ensureShowcaseHuman(human) {
  const operation = {
    key: human.key,
    email: human.email,
    action: 'unchanged',
    human_id: null,
    user_id: null,
  }

  let authUser = await findAuthUserByEmail(human.email)

  if (!authUser && apply) {
    const created = await createAuthUser(human.email, human.key)
    if (created?.id) {
      authUser = created
      operation.action = 'created_auth_user'
    } else {
      authUser = await findAuthUserByEmail(human.email)
    }
  }

  if (!authUser) {
    operation.action = apply ? 'failed_missing_auth_user' : 'planned_create_auth_user'
    return operation
  }

  operation.user_id = authUser.id
  const existingHuman = await fetchHumanByUserId(authUser.id)
  const payload = buildHumanWritePayload(human, authUser.id)

  if (!apply) {
    operation.action = existingHuman ? 'planned_update_human' : 'planned_create_human'
    operation.human_id = existingHuman?.id || null
    return operation
  }

  if (existingHuman) {
    const mutate = async (fallbackPayload) => {
      const effectivePayload = fallbackPayload || payload
      const params = new URLSearchParams({
        user_id: `eq.${authUser.id}`,
        select: 'id',
      })
      const result = await http(restUrl('humans', params), {
        method: 'PATCH',
        headers: {
          ...authHeaders(),
          Prefer: 'return=representation',
        },
        body: JSON.stringify(effectivePayload),
      })

      return {
        ...result,
        originalPayload: payload,
      }
    }

    const updated = await upsertWithMissingColumnFallback(mutate)
    operation.action = operation.action === 'created_auth_user' ? 'created_auth_user_and_updated_human' : 'updated_human'
    operation.human_id = updated.body?.[0]?.id || existingHuman.id
    return operation
  }

  const mutate = async (fallbackPayload) => {
    const effectivePayload = fallbackPayload || payload
    const result = await http(restUrl('humans'), {
      method: 'POST',
      headers: {
        ...authHeaders(),
        Prefer: 'return=representation',
      },
      body: JSON.stringify([effectivePayload]),
    })

    return {
      ...result,
      originalPayload: payload,
    }
  }

  const inserted = await upsertWithMissingColumnFallback(mutate)
  operation.action = operation.action === 'created_auth_user' ? 'created_auth_user_and_human' : 'created_human'
  operation.human_id = inserted.body?.[0]?.id || null
  return operation
}

async function ensureShowcaseAgent() {
  const params = new URLSearchParams({
    select: 'id,name',
    name: 'eq.ar_showcase_curator',
    limit: '1',
  })

  const existingResult = await http(restUrl('agents', params), {
    headers: authHeaders(),
  })

  if (!existingResult.ok) {
    throw formatError(existingResult, 'Find showcase agent')
  }

  if (existingResult.body?.[0]?.id) {
    return {
      id: existingResult.body[0].id,
      action: 'existing',
    }
  }

  if (!apply) {
    return {
      id: null,
      action: 'planned_create',
    }
  }

  const insertResult = await http(restUrl('agents'), {
    method: 'POST',
    headers: {
      ...authHeaders(),
      Prefer: 'return=representation',
    },
    body: JSON.stringify([
      {
        name: 'ar_showcase_curator',
        description: 'Curated public showcase ResearchAgent identity for press-safe listings.',
      },
    ]),
  })

  if (!insertResult.ok) {
    throw formatError(insertResult, 'Create showcase agent')
  }

  return {
    id: insertResult.body?.[0]?.id || null,
    action: 'created',
  }
}

function buildBountyWritePayload(bounty, agentId) {
  return {
    agent_id: agentId,
    title: bounty.title,
    description: bounty.description,
    skills_required: bounty.skills_required,
    budget_min: bounty.budget_min,
    budget_max: bounty.budget_max,
    currency: bounty.currency,
    pricing_mode: bounty.pricing_mode,
    fixed_spot_amount: bounty.fixed_spot_amount,
    preferred_payment_method: bounty.preferred_payment_method,
    proof_review_mode: bounty.proof_review_mode,
    proof_review_prompt: bounty.proof_review_prompt ?? null,
    spots_available: bounty.spots_available,
    spots_filled: bounty.spots_filled,
    status: bounty.status,
    deadline: bounty.deadline,
    bounty_legitimacy_score: bounty.bounty_legitimacy_score,
    bounty_legitimacy_confidence: bounty.bounty_legitimacy_confidence,
    is_spam_suppressed: bounty.is_spam_suppressed,
  }
}

async function fetchBountyByTitle(title) {
  const params = new URLSearchParams({
    select: 'id,title',
    title: `eq.${title}`,
    limit: '1',
  })

  const result = await http(restUrl('bounties', params), {
    headers: authHeaders(),
  })

  if (!result.ok) {
    throw formatError(result, `Find bounty by title "${title}"`)
  }

  return (result.body || [])[0] || null
}

async function ensureShowcaseBounty(bounty, agentId) {
  const operation = {
    key: bounty.key,
    title: bounty.title,
    action: 'unchanged',
    bounty_id: null,
  }

  const existing = await fetchBountyByTitle(bounty.title)
  operation.bounty_id = existing?.id || null

  if (!apply) {
    operation.action = existing ? 'planned_update_bounty' : 'planned_create_bounty'
    return operation
  }

  if (!agentId) {
    operation.action = 'failed_missing_agent'
    return operation
  }

  const payload = buildBountyWritePayload(bounty, agentId)

  if (existing) {
    const mutate = async (fallbackPayload) => {
      const effectivePayload = fallbackPayload || payload
      const params = new URLSearchParams({
        id: `eq.${existing.id}`,
        select: 'id',
      })
      const result = await http(restUrl('bounties', params), {
        method: 'PATCH',
        headers: {
          ...authHeaders(),
          Prefer: 'return=representation',
        },
        body: JSON.stringify(effectivePayload),
      })

      return {
        ...result,
        originalPayload: payload,
      }
    }

    const updated = await upsertWithMissingColumnFallback(mutate)
    operation.action = 'updated_bounty'
    operation.bounty_id = updated.body?.[0]?.id || existing.id
    return operation
  }

  const mutate = async (fallbackPayload) => {
    const effectivePayload = fallbackPayload || payload
    const result = await http(restUrl('bounties'), {
      method: 'POST',
      headers: {
        ...authHeaders(),
        Prefer: 'return=representation',
      },
      body: JSON.stringify([effectivePayload]),
    })

    return {
      ...result,
      originalPayload: payload,
    }
  }

  const inserted = await upsertWithMissingColumnFallback(mutate)
  operation.action = 'created_bounty'
  operation.bounty_id = inserted.body?.[0]?.id || null
  return operation
}

function nonNullIds(values, idKey) {
  return values
    .map((row) => row[idKey])
    .filter((value) => typeof value === 'string' && value.length > 0)
}

async function main() {
  const purgeCandidates = await listPurgeCandidates()
  const purgeIds = purgeCandidates.map((row) => row.id)
  const deletedCount = apply ? await deleteBountiesById(purgeIds) : 0
  const humanPurgeCandidates = await listHumanPurgeCandidates()
  const humanPurgeIds = humanPurgeCandidates.map((row) => row.id)
  const deletedHumansCount = apply ? await deleteHumansById(humanPurgeIds) : 0

  const humanOperations = []
  for (const human of SHOWCASE_HUMANS) {
    humanOperations.push(await ensureShowcaseHuman(human))
  }

  const showcaseAgent = await ensureShowcaseAgent()

  const bountyOperations = []
  for (const bounty of SHOWCASE_BOUNTIES) {
    bountyOperations.push(await ensureShowcaseBounty(bounty, showcaseAgent.id))
  }

  const humanIds = nonNullIds(humanOperations, 'human_id')
  const bountyIds = nonNullIds(bountyOperations, 'bounty_id')

  if (apply && humanIds.length !== SHOWCASE_HUMANS.length) {
    throw new Error(`Expected ${SHOWCASE_HUMANS.length} showcase humans, resolved ${humanIds.length}`)
  }

  if (apply && bountyIds.length !== SHOWCASE_BOUNTIES.length) {
    throw new Error(`Expected ${SHOWCASE_BOUNTIES.length} showcase bounties, resolved ${bountyIds.length}`)
  }

  const output = {
    mode: dryRun ? 'dry-run' : 'apply',
    dry_run: dryRun,
    purge: {
      matched_count: purgeCandidates.length,
      matched_titles: purgeCandidates.map((row) => row.title),
      deleted_count: deletedCount,
    },
    human_purge: {
      matched_count: humanPurgeCandidates.length,
      matched_names: humanPurgeCandidates.map((row) => row.name),
      deleted_count: deletedHumansCount,
    },
    showcase_agent: showcaseAgent,
    humans: humanOperations,
    bounties: bountyOperations,
    human_ids: humanIds,
    bounty_ids: bountyIds,
  }

  console.log(JSON.stringify(output, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
