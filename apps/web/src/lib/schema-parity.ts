import type { SupabaseClient } from '@supabase/supabase-js'

export const SCHEMA_PARITY_RUNBOOK_PATH = 'docs/runbooks/schema-parity-and-cache-recovery.md'

export const EXTERNAL_INTEGRATIONS_SCHEMA_TABLES = [
  'external_integrations',
  'external_jobs',
  'external_job_events',
] as const

export const EXTERNAL_INTEGRATIONS_CONFIG_SCHEMA_TABLES = [
  'external_integrations',
] as const

export const AUTOPILOT_ACTIVITY_SCHEMA_TABLES = [
  'agent_autopilot_audit_log',
  'agent_autopilot_configs',
  'agent_autopilot_state',
] as const

export const TALENT_CONNECTORS_SCHEMA_TABLES = [
  'talent_connector_workers',
  'talent_connector_matches',
  'talent_connector_actions',
  'talent_connector_policies',
] as const

export type SchemaParityScope = 'external_integrations' | 'autopilot_activity' | 'talent_connectors'

interface SchemaCacheEntry {
  expiresAtMs: number
  result: SchemaParityResult
}

export interface SchemaParityResult {
  ok: boolean
  scope: SchemaParityScope
  checkedAt: string
  missingTables: string[]
}

export interface SchemaParityApiErrorBody {
  success: false
  error: string
  code: 'SCHEMA_PARITY_UNAVAILABLE'
  remediation: {
    id: string
    docs_path: string
  }
  scope: SchemaParityScope
  missing_tables: string[]
}

const CACHE_TTL_MS = 60_000
const schemaCache = new Map<string, SchemaCacheEntry>()

function isTableMissingError(error: { code?: string | null; message?: string | null; details?: string | null }): boolean {
  const code = (error.code || '').trim().toUpperCase()
  if (code === 'PGRST205' || code === '42P01') {
    return true
  }

  const text = [error.message, error.details].filter(Boolean).join(' ').toLowerCase()
  return text.includes('schema cache') || text.includes('could not find the table') || text.includes('does not exist')
}

function toCacheKey(scope: SchemaParityScope, tables: readonly string[]): string {
  return `${scope}:${[...tables].sort().join(',')}`
}

async function checkTablesExist(
  supabase: SupabaseClient,
  tables: readonly string[]
): Promise<{ missingTables: string[] }> {
  const missingTables: string[] = []

  for (const table of tables) {
    const { error } = await supabase.from(table).select('id').limit(1)
    if (!error) continue

    if (isTableMissingError(error)) {
      missingTables.push(table)
      continue
    }

    throw new Error(`Schema parity probe failed for table ${table}: ${error.message}`)
  }

  return { missingTables }
}

export async function ensureSchemaParity(params: {
  supabase: SupabaseClient
  scope: SchemaParityScope
  tables: readonly string[]
  disableCache?: boolean
}): Promise<SchemaParityResult> {
  const key = toCacheKey(params.scope, params.tables)
  const now = Date.now()

  if (!params.disableCache) {
    const cached = schemaCache.get(key)
    if (cached && cached.expiresAtMs > now) {
      return cached.result
    }
  }

  const { missingTables } = await checkTablesExist(params.supabase, params.tables)

  const result: SchemaParityResult = {
    ok: missingTables.length === 0,
    scope: params.scope,
    checkedAt: new Date().toISOString(),
    missingTables,
  }

  if (!params.disableCache) {
    schemaCache.set(key, {
      expiresAtMs: now + CACHE_TTL_MS,
      result,
    })
  }

  return result
}

function remediationIdForScope(scope: SchemaParityScope): string {
  if (scope === 'autopilot_activity') {
    return 'schema-parity-autopilot-activity-v1'
  }
  if (scope === 'talent_connectors') {
    return 'schema-parity-talent-connectors-v1'
  }

  return 'schema-parity-external-integrations-v1'
}

export function toSchemaParityErrorBody(result: SchemaParityResult): SchemaParityApiErrorBody {
  return {
    success: false,
    error: `Required database schema is unavailable for ${result.scope}. Apply missing migrations and refresh PostgREST schema cache before retrying.`,
    code: 'SCHEMA_PARITY_UNAVAILABLE',
    remediation: {
      id: remediationIdForScope(result.scope),
      docs_path: SCHEMA_PARITY_RUNBOOK_PATH,
    },
    scope: result.scope,
    missing_tables: result.missingTables,
  }
}

export async function ensureExternalIntegrationsSchema(params: {
  supabase: SupabaseClient
  disableCache?: boolean
}): Promise<SchemaParityResult> {
  return ensureSchemaParity({
    supabase: params.supabase,
    scope: 'external_integrations',
    tables: EXTERNAL_INTEGRATIONS_SCHEMA_TABLES,
    disableCache: params.disableCache,
  })
}

export async function ensureExternalIntegrationsConfigSchema(params: {
  supabase: SupabaseClient
  disableCache?: boolean
}): Promise<SchemaParityResult> {
  return ensureSchemaParity({
    supabase: params.supabase,
    scope: 'external_integrations',
    tables: EXTERNAL_INTEGRATIONS_CONFIG_SCHEMA_TABLES,
    disableCache: params.disableCache,
  })
}

export async function ensureAutopilotActivitySchema(params: {
  supabase: SupabaseClient
  disableCache?: boolean
}): Promise<SchemaParityResult> {
  return ensureSchemaParity({
    supabase: params.supabase,
    scope: 'autopilot_activity',
    tables: AUTOPILOT_ACTIVITY_SCHEMA_TABLES,
    disableCache: params.disableCache,
  })
}

export async function ensureTalentConnectorsSchema(params: {
  supabase: SupabaseClient
  disableCache?: boolean
}): Promise<SchemaParityResult> {
  return ensureSchemaParity({
    supabase: params.supabase,
    scope: 'talent_connectors',
    tables: TALENT_CONNECTORS_SCHEMA_TABLES,
    disableCache: params.disableCache,
  })
}
