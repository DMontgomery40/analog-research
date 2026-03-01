/**
 * DB smoke checks for humans listing dataset.
 * This file does NOT call humans API route handlers.
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

describe('GET /api/v1/humans (db smoke)', () => {
  itDb('can list humans with total count', async () => {
    const supabase = getServiceClient()

    const { data, error, count } = await supabase
      .from('humans')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(20)

    assertNoError(error, 'List humans')
    expect(Array.isArray(data)).toBe(true)
    expect(typeof count).toBe('number')
  })

  itDb('can query humans filtered by skill overlap', async () => {
    const supabase = getServiceClient()

    const { data, error } = await supabase
      .from('humans')
      .select('id, name, skills')
      .overlaps('skills', ['javascript'])
      .limit(10)

    assertNoError(error, 'Filter humans by skills')
    expect(Array.isArray(data)).toBe(true)
  })
})
