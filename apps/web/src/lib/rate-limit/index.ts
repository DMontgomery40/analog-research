import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const DEFAULT_WINDOW_MS = 60_000
const ONE_HOUR_MS = 60 * 60_000

interface ApiKeyRateLimitParams {
  apiKeyId: string
  perMinute: number
  perHour: number
}

interface RateLimitBucket {
  windowStart: number
  count: number
}

export interface RateLimitStatus {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number
  retryAfterMs: number | null
}

export interface RateLimitParams {
  key: string
  limit: number
  windowMs?: number
  nowMs?: number
}

export interface RateLimitKeyParams {
  agentId: string
  route: string
}

interface ResolveRateLimitParams {
  explicitLimit?: number | null
  envVar?: string
  fallback: number
}

export function resolveApiKeyRateLimits(params: { explicitPerMinute?: number | null }) {
  const perMinute = resolveRateLimitLimit({
    explicitLimit: params.explicitPerMinute,
    envVar: 'API_RATE_LIMIT_PER_MINUTE',
    fallback: 100,
  })

  const perHour = resolveRateLimitLimit({
    envVar: 'API_RATE_LIMIT_PER_HOUR',
    fallback: perMinute * 10,
  })

  return { perMinute, perHour }
}

function parsePositiveInt(value: number | string | null | undefined, fallback: number): number {
  if (value === undefined || value === null || value === '') {
    return fallback
  }

  const parsed = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.max(1, Math.floor(parsed))
}

function getStore(): Map<string, RateLimitBucket> {
  const globalWithStore = globalThis as typeof globalThis & {
    __analoglaborRateLimitStore?: Map<string, RateLimitBucket>
  }

  if (!globalWithStore.__analoglaborRateLimitStore) {
    globalWithStore.__analoglaborRateLimitStore = new Map()
  }

  return globalWithStore.__analoglaborRateLimitStore
}

function getUpstash(): {
  redis: Redis
  limiterCache: Map<string, Ratelimit>
} | null {
  const url = (process.env.UPSTASH_REDIS_REST_URL || '').trim()
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || '').trim()
  if (!url || !token) {
    return null
  }

  const globalWithUpstash = globalThis as typeof globalThis & {
    __analoglaborUpstashRedis?: Redis
    __analoglaborUpstashRatelimitCache?: Map<string, Ratelimit>
  }

  if (!globalWithUpstash.__analoglaborUpstashRedis) {
    globalWithUpstash.__analoglaborUpstashRedis = Redis.fromEnv()
  }

  if (!globalWithUpstash.__analoglaborUpstashRatelimitCache) {
    globalWithUpstash.__analoglaborUpstashRatelimitCache = new Map()
  }

  return {
    redis: globalWithUpstash.__analoglaborUpstashRedis,
    limiterCache: globalWithUpstash.__analoglaborUpstashRatelimitCache,
  }
}

function getUpstashLimiter(params: { limit: number; window: '1 m' | '1 h' }): Ratelimit | null {
  const upstash = getUpstash()
  if (!upstash) return null

  const limit = Math.max(1, Math.floor(params.limit))
  const cacheKey = `${params.window}:${limit}`
  const existing = upstash.limiterCache.get(cacheKey)
  if (existing) return existing

  const created = new Ratelimit({
    redis: upstash.redis,
    limiter: Ratelimit.slidingWindow(limit, params.window),
    prefix: 'analoglabor:api-key-rate-limit',
  })

  upstash.limiterCache.set(cacheKey, created)
  return created
}

export function buildRateLimitKey(params: RateLimitKeyParams): string {
  return `${params.route}:${params.agentId}`
}

export function resetRateLimitStore(): void {
  getStore().clear()
}

export function resolveRateLimitLimit(params: ResolveRateLimitParams): number {
  const envLimit = params.envVar
    ? parsePositiveInt(process.env[params.envVar], params.fallback)
    : params.fallback

  if (params.explicitLimit === undefined || params.explicitLimit === null) {
    return envLimit
  }

  return parsePositiveInt(params.explicitLimit, envLimit)
}

export function rateLimitHeaders(limit: Pick<RateLimitStatus, 'limit' | 'remaining' | 'resetAt'>) {
  return {
    'X-RateLimit-Limit': String(limit.limit),
    'X-RateLimit-Remaining': String(limit.remaining),
    'X-RateLimit-Reset': String(Math.ceil(limit.resetAt / 1000)),
  }
}

export function buildRateLimitError(rateLimit: RateLimitStatus) {
  const retryAfterSeconds = Math.max(1, Math.ceil((rateLimit.retryAfterMs || 0) / 1000))

  return {
    status: 429,
    body: {
      success: false,
      error: 'Rate limit exceeded. Please retry later.',
      code: 'RATE_LIMITED',
      retry_after_seconds: retryAfterSeconds,
    },
    headers: {
      'Retry-After': String(retryAfterSeconds),
      ...rateLimitHeaders(rateLimit),
    },
  }
}

export function enforceRateLimit(params: RateLimitParams): RateLimitStatus {
  const now = params.nowMs ?? Date.now()
  const windowMs = params.windowMs ?? DEFAULT_WINDOW_MS
  const limit = Math.max(1, Math.floor(params.limit))
  const store = getStore()
  const existing = store.get(params.key)

  if (!existing || now - existing.windowStart >= windowMs) {
    store.set(params.key, { windowStart: now, count: 1 })
    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - 1),
      resetAt: now + windowMs,
      retryAfterMs: null,
    }
  }

  if (existing.count >= limit) {
    const resetAt = existing.windowStart + windowMs
    const retryAfterMs = Math.max(0, resetAt - now)
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt,
      retryAfterMs,
    }
  }

  existing.count += 1
  store.set(params.key, existing)

  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.windowStart + windowMs,
    retryAfterMs: null,
  }
}

export async function enforceApiKeyRateLimit(params: ApiKeyRateLimitParams): Promise<RateLimitStatus> {
  const now = Date.now()
  const perMinute = Math.max(1, Math.floor(params.perMinute))
  const perHour = Math.max(1, Math.floor(params.perHour))

  const minuteKey = `api:${params.apiKeyId}:minute`
  const hourKey = `api:${params.apiKeyId}:hour`

  const minuteLimiter = getUpstashLimiter({ limit: perMinute, window: '1 m' })
  const hourLimiter = getUpstashLimiter({ limit: perHour, window: '1 h' })

  if (minuteLimiter && hourLimiter) {
    try {
      const minuteResult = await minuteLimiter.limit(minuteKey)
      minuteResult.pending.catch(() => {})

      if (!minuteResult.success) {
        return {
          allowed: false,
          limit: minuteResult.limit,
          remaining: minuteResult.remaining,
          resetAt: minuteResult.reset,
          retryAfterMs: Math.max(0, minuteResult.reset - now),
        }
      }

      const hourResult = await hourLimiter.limit(hourKey)
      hourResult.pending.catch(() => {})

      if (!hourResult.success) {
        return {
          allowed: false,
          limit: hourResult.limit,
          remaining: hourResult.remaining,
          resetAt: hourResult.reset,
          retryAfterMs: Math.max(0, hourResult.reset - now),
        }
      }

      return {
        allowed: true,
        limit: minuteResult.limit,
        remaining: minuteResult.remaining,
        resetAt: minuteResult.reset,
        retryAfterMs: null,
      }
    } catch {
      // Fail open to the in-memory fallback if Redis is unavailable.
    }
  }

  const minuteStatus = enforceRateLimit({
    key: minuteKey,
    limit: perMinute,
    windowMs: DEFAULT_WINDOW_MS,
    nowMs: now,
  })

  if (!minuteStatus.allowed) {
    return minuteStatus
  }

  const hourStatus = enforceRateLimit({
    key: hourKey,
    limit: perHour,
    windowMs: ONE_HOUR_MS,
    nowMs: now,
  })

  if (!hourStatus.allowed) {
    return hourStatus
  }

  return minuteStatus
}
