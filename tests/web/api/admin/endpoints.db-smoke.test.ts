/**
 * DB smoke checks for admin-facing datasets.
 * This file does NOT call admin API route handlers.
 */

import { describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@analoglabor/database'
import type { PostgrestError } from '@supabase/supabase-js'

const RUN_DB_SMOKE = process.env.RUN_INTEGRATION_TESTS === 'true'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

function getServiceClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE env vars.')
  }

  return createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
}

function assertNoError(error: PostgrestError | null, context: string): asserts error is null {
  if (error) {
    throw new Error(`${context}: ${error.code} - ${error.message}`)
  }
}

const itDb = RUN_DB_SMOKE && SUPABASE_URL && SERVICE_ROLE_KEY ? it : it.skip

describe('Admin API endpoints (db smoke)', () => {
  itDb('can query humans table', async () => {
    const supabase = getServiceClient()

    const { data, error } = await supabase
      .from('humans')
      .select('id, name, is_verified')
      .limit(5)

    assertNoError(error, 'Query humans')
    expect(Array.isArray(data)).toBe(true)
  })

  itDb('can query bookings table with actor joins', async () => {
    const supabase = getServiceClient()

    const { data, error } = await supabase
      .from('bookings')
      .select('id, status, amount, human:humans(id, name), agent:agents(id, name)')
      .limit(5)

    assertNoError(error, 'Query bookings with joins')
    expect(Array.isArray(data)).toBe(true)
  })
})
