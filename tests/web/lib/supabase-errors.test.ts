import { describe, expect, it } from 'vitest'

import { isMissingColumnError } from '@/lib/supabase/errors'

describe('isMissingColumnError', () => {
  it('detects PostgREST schema-cache column misses', () => {
    const value = isMissingColumnError(
      {
        code: 'PGRST204',
        message: "Could not find the 'drive_radius_miles' column of 'humans' in the schema cache",
      },
      { column: 'drive_radius_miles', table: 'humans' }
    )

    expect(value).toBe(true)
  })

  it('detects PostgreSQL missing column errors', () => {
    const value = isMissingColumnError(
      {
        code: '42703',
        message: 'column humans.drive_radius_miles does not exist',
      },
      { column: 'drive_radius_miles', table: 'humans' }
    )

    expect(value).toBe(true)
  })

  it('returns false when table/column filters do not match', () => {
    const value = isMissingColumnError(
      {
        code: 'PGRST204',
        message: "Could not find the 'preferred_payment_method' column of 'bounties' in the schema cache",
      },
      { column: 'drive_radius_miles', table: 'humans' }
    )

    expect(value).toBe(false)
  })

  it('returns false for unrelated errors', () => {
    const value = isMissingColumnError({
      code: '42501',
      message: 'permission denied for table humans',
    })

    expect(value).toBe(false)
  })
})
