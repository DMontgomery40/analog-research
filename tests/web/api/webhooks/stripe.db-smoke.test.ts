/**
 * DB smoke checks for Stripe-related booking persistence.
 * This file does NOT call webhook route handlers.
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

describe('Stripe webhook persistence (db smoke)', () => {
  itDb('can query bookings with Stripe payment intents', async () => {
    const supabase = getServiceClient()

    const { data, error } = await supabase
      .from('bookings')
      .select('id, stripe_payment_intent_id, escrow_status')
      .not('stripe_payment_intent_id', 'is', null)
      .limit(5)

    assertNoError(error, 'Query bookings with payment intent')
    expect(Array.isArray(data)).toBe(true)
  })

  itDb('funded Stripe bookings include payment intent ids', async () => {
    const supabase = getServiceClient()

    const { data, error } = await supabase
      .from('bookings')
      .select('id, stripe_payment_intent_id, escrow_status')
      .eq('escrow_status', 'funded')
      .eq('payment_method', 'stripe')
      .limit(3)

    assertNoError(error, 'Query funded stripe bookings')

    for (const booking of data ?? []) {
      expect(booking.stripe_payment_intent_id).toBeTruthy()
    }
  })
})
