import { describe, expect, it } from 'vitest'

import {
  AppError,
  getRequestId,
  normalizeError,
  toPublicErrorPayload,
  withRequestId,
} from '@/lib/errors'

describe('error utilities', () => {
  it('normalizes AppError metadata for logs and responses', () => {
    const error = new AppError('Delivery failed', {
      code: 'DELIVERY_FAILED',
      status: 502,
      operatorHint: 'check channel delivery',
      requestId: 'req_123',
      details: { channelId: 'chan_1' },
    })

    expect(normalizeError(error)).toEqual({
      name: 'AppError',
      message: 'Delivery failed',
      code: 'DELIVERY_FAILED',
      status: 502,
      operatorHint: 'check channel delivery',
      requestId: 'req_123',
      details: { channelId: 'chan_1' },
    })
  })

  it('normalizes string rejections with fallback metadata', () => {
    expect(
      normalizeError('string rejection', {
        operatorHint: 'check promise rejection',
        requestId: 'run_123',
      })
    ).toEqual({
      name: 'Error',
      message: 'string rejection',
      operatorHint: 'check promise rejection',
      requestId: 'run_123',
    })
  })

  it('creates concise public payloads', () => {
    const payload = toPublicErrorPayload(
      new AppError('Unauthorized', {
        code: 'AUTH_REQUIRED',
        operatorHint: 'check agent API key',
        requestId: 'req_456',
      })
    )

    expect(payload).toEqual({
      success: false,
      error: 'Unauthorized',
      code: 'AUTH_REQUIRED',
      operatorHint: 'check agent API key',
      requestId: 'req_456',
    })
  })

  it('reuses an incoming request id when present', () => {
    const headers = new Headers({ 'x-request-id': 'req_existing' })
    expect(getRequestId(headers)).toBe('req_existing')
  })

  it('attaches request ids to responses', () => {
    const response = withRequestId(new Response(null, { status: 204 }), 'req_attached')
    expect(response.headers.get('x-request-id')).toBe('req_attached')
  })
})
