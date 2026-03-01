import path from 'node:path'
import fs from 'node:fs'
// @ts-expect-error dotenv types resolution issue with package.json exports
import { config } from 'dotenv'
import { defineConfig, configDefaults } from 'vitest/config'

function loadEnvFileIfPresent(envPath: string) {
  if (!fs.existsSync(envPath)) return
  config({ path: envPath, override: false })
}

/**
 * Integration and DB-smoke test credentials are expected to exist in local `.env`
 * (or exported process env) and should not be re-requested when already present.
 * Supabase migration credentials:
 * - SUPABASE_ACCESS_TOKEN
 * - SUPABASE_DB_URL
 * - SUPABASE_DB_PASSWORD
 */
// Safety: do NOT load `.env.local` by default (it may contain live keys).
// - Unit tests should run without requiring secrets.
// - If you need integration tests, set `RUN_INTEGRATION_TESTS=true` and provide a dedicated env file.
const unitEnvFile = process.env.VITEST_ENV_FILE || path.resolve(__dirname, '.env.test')
loadEnvFileIfPresent(unitEnvFile)

if (process.env.RUN_INTEGRATION_TESTS === 'true') {
  const integrationEnvFile = process.env.VITEST_INTEGRATION_ENV_FILE || path.resolve(__dirname, '.env.integration')
  loadEnvFileIfPresent(integrationEnvFile)
}

export default defineConfig({
  test: {
    environment: 'node',
    include: [path.resolve(__dirname, '../../tests/web/**/*.test.ts')],
    exclude: [
      ...configDefaults.exclude,
      ...(process.env.RUN_INTEGRATION_TESTS === 'true'
        ? []
        : [
            path.resolve(__dirname, '../../tests/web/api/admin/endpoints.test.ts'),
            path.resolve(__dirname, '../../tests/web/api/humans/endpoints.test.ts'),
            path.resolve(__dirname, '../../tests/web/api/bookings/fund-escrow.test.ts'),
            path.resolve(__dirname, '../../tests/web/api/bookings/complete.test.ts'),
            path.resolve(__dirname, '../../tests/web/api/bookings/proof.test.ts'),
            path.resolve(__dirname, '../../tests/web/api/webhooks/stripe.test.ts'),
            path.resolve(__dirname, '../../tests/web/api/webhooks/coinbase.test.ts'),
          ]),
    ],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      exclude: ['src/**/*.d.ts', path.resolve(__dirname, '../../tests/**')],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
