/**
 * DB smoke checks for booking completion state.
 * This file does NOT call booking completion route handlers.
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

describe('booking completion (db smoke)', () => {
  itDb('can query completed bookings', async () => {
    const supabase = getServiceClient()

    const { data, error } = await supabase
      .from('bookings')
      .select('id, status, escrow_status')
      .eq('status', 'completed')
      .limit(5)

    assertNoError(error, 'Query completed bookings')

    for (const booking of data ?? []) {
      expect(booking.status).toBe('completed')
    }
  })

  itDb('can query submitted funded bookings eligible for completion', async () => {
    const supabase = getServiceClient()

    const { data, error } = await supabase
      .from('bookings')
      .select('id, status, escrow_status')
      .eq('status', 'submitted')
      .eq('escrow_status', 'funded')
      .limit(5)

    assertNoError(error, 'Query submitted funded bookings')
    expect(Array.isArray(data)).toBe(true)
  })
})
