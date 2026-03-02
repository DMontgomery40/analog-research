#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { getRepoRoot } from './common.mjs'

const repoRoot = getRepoRoot()
process.chdir(repoRoot)

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const out = {}

  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }

  return out
}

const rootEnv = readEnvFile(path.join(repoRoot, '.env'))
const webEnv = readEnvFile(path.join(repoRoot, 'apps/web/.env.local'))

function envValue(key) {
  const processValue = process.env[key]
  if (typeof processValue === 'string' && processValue.trim().length > 0) return processValue.trim()

  const webValue = webEnv[key]
  if (typeof webValue === 'string' && webValue.trim().length > 0) return webValue.trim()

  const rootValue = rootEnv[key]
  if (typeof rootValue === 'string' && rootValue.trim().length > 0) return rootValue.trim()

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

function runScript(relativeScriptPath, label) {
  const scriptPath = path.join(repoRoot, relativeScriptPath)
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    env: process.env,
    encoding: 'utf8',
  })

  if (result.status === 0) {
    const stdout = (result.stdout || '').trim()
    if (stdout) console.log(stdout)
    return true
  }

  console.error(`[realness-triad] FAIL ${label}`)
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
  if (output) {
    console.error(output)
  }
  return false
}

async function checkNetlifyFunction(apiBaseUrl) {
  const probeUrl = `${apiBaseUrl.replace(/\/$/, '')}/api/v1/welcome`
  const response = await fetch(probeUrl, {
    headers: {
      'x-analogresearch-realness-probe': '1',
      'cache-control': 'no-cache',
    },
  })

  if (!response.ok) {
    throw new Error(`Netlify probe endpoint returned ${response.status} for ${probeUrl}`)
  }

  const nfRequestId = response.headers.get('x-nf-request-id')
  const serverHeader = response.headers.get('server') || ''
  if (!nfRequestId) {
    throw new Error(
      `Missing x-nf-request-id at ${probeUrl}. This does not look like deployed Netlify Functions.`
    )
  }

  return { probeUrl, nfRequestId, serverHeader }
}

async function main() {
  const apiBaseUrl = (
    envValue('TEST_API_BASE_URL')
    || envValue('NEXT_PUBLIC_SITE_URL')
    || envValue('NEXT_PUBLIC_APP_URL')
    || 'https://analog-research.org'
  ).replace(/\/$/, '')

  if (isLocalHost(apiBaseUrl)) {
    console.error(`[realness-triad] FAIL API base URL is local: ${apiBaseUrl}`)
    console.error('[realness-triad] Set TEST_API_BASE_URL/NEXT_PUBLIC_SITE_URL to deployed Netlify URL.')
    process.exit(1)
  }

  let netlifySignal
  try {
    netlifySignal = await checkNetlifyFunction(apiBaseUrl)
  } catch (error) {
    console.error('[realness-triad] FAIL netlify-functions signal check failed.')
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }

  const supabaseOk = runScript('scripts/quality/check-remote-schema-parity.mjs', 'remote-schema-parity')
  const stripeOk = runScript('scripts/quality/check-live-money-flow.mjs', 'live-money-flow')

  if (!supabaseOk || !stripeOk) {
    process.exit(1)
  }

  console.log(
    `[realness-triad] PASS netlify=${netlifySignal.nfRequestId} server=${netlifySignal.serverHeader || 'unknown'} url=${netlifySignal.probeUrl}`
  )
}

await main()
