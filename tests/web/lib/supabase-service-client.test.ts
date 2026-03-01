import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('createServiceClient', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it('does not read request cookies (service client is session-independent)', async () => {
    let cookiesCallCount = 0
    const cookiesSpy = () => {
      cookiesCallCount += 1
      throw new Error('cookies() should not be called by createServiceClient')
    }

    vi.doMock('next/headers', () => ({
      cookies: cookiesSpy,
    }))

    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service_role_key_example')

    const { createServiceClient } = await import('@/lib/supabase/server')

    const client = await createServiceClient()

    expect(cookiesCallCount).toBe(0)
    expect(typeof (client as any).from).toBe('function')
  })
})
