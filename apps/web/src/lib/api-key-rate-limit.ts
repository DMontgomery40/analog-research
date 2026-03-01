import { NextResponse } from 'next/server'

import {
  buildRateLimitError,
  enforceApiKeyRateLimit,
  resolveApiKeyRateLimits,
} from '@/lib/rate-limit'

export type ApiKeyRateLimitContext = {
  apiKeyId: string
  rateLimitPerMinute?: number | null
}

export async function enforceApiKeyRateLimitOrResponse(
  context: ApiKeyRateLimitContext
): Promise<NextResponse | null> {
  const { perMinute, perHour } = resolveApiKeyRateLimits({
    explicitPerMinute: context.rateLimitPerMinute,
  })

  const rateLimit = await enforceApiKeyRateLimit({
    apiKeyId: context.apiKeyId,
    perMinute,
    perHour,
  })

  if (rateLimit.allowed) {
    return null
  }

  const error = buildRateLimitError(rateLimit)
  return NextResponse.json(error.body, { status: error.status, headers: error.headers })
}

