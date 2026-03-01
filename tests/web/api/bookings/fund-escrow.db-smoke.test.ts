/**
 * DB smoke checks for escrow funding persistence.
 * This file does NOT call fund-escrow route handlers.
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

describe('fund-escrow (db smoke)', () => {
  itDb('can query funded bookings', async () => {
    const supabase = getServiceClient()

    const { data, error } = await supabase
      .from('bookings')
      .select('id, escrow_status')
      .eq('escrow_status', 'funded')
      .limit(5)

    assertNoError(error, 'Query funded bookings')

    for (const booking of data ?? []) {
      expect(booking.escrow_status).toBe('funded')
    }
  })

  itDb('bookings include human payment profile join fields', async () => {
    const supabase = getServiceClient()

    const { data, error } = await supabase
      .from('bookings')
      .select('id, human_id, humans(id, name, stripe_account_id, wallet_address)')
      .limit(5)

    assertNoError(error, 'Query bookings with human payment fields')
    expect(Array.isArray(data)).toBe(true)
  })
})
