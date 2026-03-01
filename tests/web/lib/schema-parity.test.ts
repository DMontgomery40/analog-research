import { describe, expect, it } from 'vitest'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

import {
  ensureSchemaParity,
  EXTERNAL_INTEGRATIONS_SCHEMA_TABLES,
  SCHEMA_PARITY_RUNBOOK_PATH,
  toSchemaParityErrorBody,
} from '@/lib/schema-parity'
import { createServiceClient } from '@/lib/supabase/server'

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()
const integrationIt = process.env.RUN_INTEGRATION_TESTS === 'true' ? it : it.skip

describe('schema parity guard (remote Supabase)', () => {
  integrationIt('passes when required tables are present (service role probe)', async () => {
    const supabase = await createServiceClient()

    const result = await ensureSchemaParity({
      supabase: supabase as never,
      scope: 'external_integrations',
      tables: EXTERNAL_INTEGRATIONS_SCHEMA_TABLES,
      disableCache: true,
    })

    expect(result.ok).toBe(true)
    expect(result.missingTables).toEqual([])
  }, 20_000)

  integrationIt('flags missing tables when PostgREST schema cache lacks the table', async () => {
    const supabase = await createServiceClient()
    const missingTable = `__schema_parity_missing_${Date.now()}__`

    const result = await ensureSchemaParity({
      supabase: supabase as never,
      scope: 'external_integrations',
      tables: [...EXTERNAL_INTEGRATIONS_SCHEMA_TABLES, missingTable],
      disableCache: true,
    })

    expect(result.ok).toBe(false)
    expect(result.missingTables).toContain(missingTable)

    const body = toSchemaParityErrorBody(result)
    expect(body.code).toBe('SCHEMA_PARITY_UNAVAILABLE')
    expect(body.remediation.docs_path).toBe(SCHEMA_PARITY_RUNBOOK_PATH)
  }, 20_000)

  integrationIt('throws for non-schema errors so routes can report true failures (anon probe)', async () => {
    expect(SUPABASE_URL).toBeTruthy()
    expect(SUPABASE_ANON_KEY).toBeTruthy()

    const anon = createSupabaseClient<any>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })

    await expect(ensureSchemaParity({
      supabase: anon as never,
      scope: 'external_integrations',
      tables: ['external_integrations'],
      disableCache: true,
    })).rejects.toThrow('Schema parity probe failed')
  }, 20_000)
})
