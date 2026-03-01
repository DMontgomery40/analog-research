import {
  buildRateLimitKey,
  enforceRateLimit,
  resolveRateLimitLimit,
  resetRateLimitStore,
  type RateLimitStatus,
} from '@/lib/rate-limit'

const DEFAULT_RATE_LIMIT_PER_MINUTE = 30

interface PreflightRateLimitParams {
  agentId: string
  limitPerMinute?: number | null
  nowMs?: number
}

export function resetPreflightRateLimit(): void {
  resetRateLimitStore()
}

export function enforcePreflightRateLimit(params: PreflightRateLimitParams): RateLimitStatus {
  return enforceRateLimit({
    key: buildRateLimitKey({ agentId: params.agentId, route: 'moderation-preflight' }),
    limit: resolveRateLimitLimit({
      explicitLimit: params.limitPerMinute,
      envVar: 'MODERATION_PREFLIGHT_RATE_LIMIT_PER_MINUTE',
      fallback: DEFAULT_RATE_LIMIT_PER_MINUTE,
    }),
    nowMs: params.nowMs,
  })
}
