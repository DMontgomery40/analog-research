import fs from 'node:fs'
import path from 'node:path'

import { defineConfig } from '@playwright/test'

function parseDotenv(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {}

  const raw = fs.readFileSync(filePath, 'utf8')
  const env: Record<string, string> = {}

  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed) return
    if (trimmed.startsWith('#')) return

    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) return

    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()

    if (!key) return

    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    env[key] = value
  })

  return env
}

function toStringEnv(source: NodeJS.ProcessEnv): Record<string, string> {
  const env: Record<string, string> = {}
  Object.entries(source).forEach(([key, value]) => {
    if (typeof value === 'string') env[key] = value
  })
  return env
}

const repoDotenv = parseDotenv(path.join(__dirname, '.env'))

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL
  || repoDotenv.NEXT_PUBLIC_SUPABASE_URL
  || repoDotenv.SUPABASE_PROJECT_URL

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  || repoDotenv.NEXT_PUBLIC_SUPABASE_ANON_KEY
  || repoDotenv.SUPABASE_ANON_PUBLIC_KEY

const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY
  || repoDotenv.SUPABASE_SERVICE_ROLE_KEY

const supabaseSecretKey =
  process.env.SUPABASE_SECRET_KEY
  || repoDotenv.SUPABASE_SECRET_KEY

// Make `.env`-derived values available to the Playwright test runner itself.
// This keeps `pnpm smoke:e2e` self-contained for local development.
if (supabaseUrl && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl
}
if (supabaseAnonKey && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = supabaseAnonKey
}
if (supabaseServiceRoleKey && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = supabaseServiceRoleKey
}
if (supabaseSecretKey && !process.env.SUPABASE_SECRET_KEY) {
  process.env.SUPABASE_SECRET_KEY = supabaseSecretKey
}

const webServerEnv = toStringEnv(process.env)
if (supabaseUrl) webServerEnv.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl
if (supabaseAnonKey) webServerEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY = supabaseAnonKey
if (supabaseServiceRoleKey) webServerEnv.SUPABASE_SERVICE_ROLE_KEY = supabaseServiceRoleKey
if (supabaseSecretKey) webServerEnv.SUPABASE_SECRET_KEY = supabaseSecretKey

export default defineConfig({
  testDir: path.join(__dirname, 'tests/e2e'),
  timeout: 2 * 60 * 1000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'dot' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm --filter @analogresearch/web dev',
    url: baseURL,
    reuseExistingServer: true,
    env: webServerEnv,
  },
})
