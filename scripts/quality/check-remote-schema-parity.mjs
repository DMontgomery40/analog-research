#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { getRepoRoot } from './common.mjs'

const repoRoot = getRepoRoot()
process.chdir(repoRoot)

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}

  const content = fs.readFileSync(filePath, 'utf8')
  const result = {}

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue

    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    result[key] = value
  }

  return result
}

function envValue(key, fileEnv) {
  const fromProcess = process.env[key]
  if (typeof fromProcess === 'string' && fromProcess.trim().length > 0) {
    return fromProcess.trim()
  }

  const fromFile = fileEnv[key]
  if (typeof fromFile === 'string' && fromFile.trim().length > 0) {
    return fromFile.trim()
  }

  return ''
}

function isLocalHost(urlString) {
  try {
    const host = new URL(urlString).hostname.toLowerCase()
    return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')
  } catch {
    return true
  }
}

async function restProbe(baseUrl, serviceKey, pathSuffix) {
  const url = `${baseUrl.replace(/\/$/, '')}${pathSuffix}`
  const response = await fetch(url, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Accept-Profile': 'public',
    },
  })

  const text = await response.text()
  let payload = null
  try {
    payload = JSON.parse(text)
  } catch {
    payload = text
  }

  return { status: response.status, payload }
}

function parseError(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const code = typeof payload.code === 'string' ? payload.code : null
  const message = typeof payload.message === 'string' ? payload.message : JSON.stringify(payload)
  return { code, message }
}

const fileEnv = readEnvFile(path.join(repoRoot, 'apps/web/.env.local'))
const supabaseUrl = envValue('NEXT_PUBLIC_SUPABASE_URL', fileEnv)
const serviceRoleKey = envValue('SUPABASE_SERVICE_ROLE_KEY', fileEnv)

if (!supabaseUrl || !serviceRoleKey) {
  console.error('[remote-schema-parity] FAIL missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

if (isLocalHost(supabaseUrl)) {
  console.error(`[remote-schema-parity] FAIL NEXT_PUBLIC_SUPABASE_URL points to local host: ${supabaseUrl}`)
  process.exit(1)
}

const tableChecks = [
  { name: 'external_integrations', path: '/rest/v1/external_integrations?select=id&limit=1' },
  { name: 'external_jobs', path: '/rest/v1/external_jobs?select=id&limit=1' },
  { name: 'external_job_events', path: '/rest/v1/external_job_events?select=id&limit=1' },
  { name: 'agent_autopilot_audit_log', path: '/rest/v1/agent_autopilot_audit_log?select=id&limit=1' },
  { name: 'agent_autopilot_configs', path: '/rest/v1/agent_autopilot_configs?select=id&limit=1' },
  { name: 'agent_autopilot_state', path: '/rest/v1/agent_autopilot_state?select=id&limit=1' },
]

const failures = []

for (const table of tableChecks) {
  const result = await restProbe(supabaseUrl, serviceRoleKey, table.path)
  if (Array.isArray(result.payload)) continue

  const error = parseError(result.payload)
  if (!error) {
    failures.push(`${table.name}: unexpected response (status ${result.status})`)
    continue
  }

  failures.push(`${table.name}: ${error.code || 'unknown'} ${error.message}`)
}

const columnCheck = await restProbe(
  supabaseUrl,
  serviceRoleKey,
  '/rest/v1/humans?select=id,drive_radius_miles&limit=1'
)

if (!Array.isArray(columnCheck.payload)) {
  const error = parseError(columnCheck.payload)
  failures.push(
    `humans.drive_radius_miles: ${(error?.code || 'unknown')} ${error?.message || 'unexpected response'}`
  )
}

if (failures.length > 0) {
  console.error('[remote-schema-parity] FAIL remote schema parity check failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log('[remote-schema-parity] PASS remote Supabase schema + column probes succeeded.')
