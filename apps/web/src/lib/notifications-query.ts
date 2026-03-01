import { z } from 'zod'

export const MAX_NOTIFICATIONS_LIMIT = 50
export const DEFAULT_NOTIFICATIONS_LIMIT = 20

function normalizeQueryParam(value: string | null): string | undefined {
  if (value === null) return undefined
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  return trimmed
}

const booleanQueryParam = z.preprocess((value) => {
  if (value === undefined) return undefined
  if (typeof value !== 'string') return value

  const normalized = value.trim().toLowerCase()
  if (normalized === '') return undefined

  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false

  return value
}, z.boolean())

const baseQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_NOTIFICATIONS_LIMIT).optional().default(DEFAULT_NOTIFICATIONS_LIMIT),
  offset: z.coerce.number().int().min(0).optional().default(0),
})

const humanQuerySchema = baseQuerySchema.extend({
  unread_only: booleanQueryParam.optional().default(false),
})

const agentQuerySchema = baseQuerySchema.extend({
  unread_only: booleanQueryParam.optional().default(true),
  types: z.string().optional(),
})

export type HumanNotificationsQuery = z.infer<typeof humanQuerySchema>
export type AgentNotificationsQuery = z.infer<typeof agentQuerySchema>

export function safeParseHumanNotificationsQuery(searchParams: URLSearchParams) {
  return humanQuerySchema.safeParse({
    unread_only: normalizeQueryParam(searchParams.get('unread_only')),
    limit: normalizeQueryParam(searchParams.get('limit')),
    offset: normalizeQueryParam(searchParams.get('offset')),
  })
}

export function safeParseAgentNotificationsQuery(searchParams: URLSearchParams) {
  return agentQuerySchema.safeParse({
    unread_only: normalizeQueryParam(searchParams.get('unread_only')),
    limit: normalizeQueryParam(searchParams.get('limit')),
    offset: normalizeQueryParam(searchParams.get('offset')),
    types: normalizeQueryParam(searchParams.get('types')),
  })
}

