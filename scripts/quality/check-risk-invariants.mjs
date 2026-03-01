#!/usr/bin/env node

import path from 'node:path'
import { collectChangedFiles, getRepoRoot, runGit, unique } from './common.mjs'

const mode = process.argv[2] || '--changed'
if (mode !== '--changed' && mode !== '--full') {
  console.error('Usage: node scripts/quality/check-risk-invariants.mjs [--changed|--full]')
  process.exit(2)
}

const repoRoot = getRepoRoot()
process.chdir(repoRoot)

const TEST_FILE_REGEX = /^tests\/.*\.(test|spec)\.(ts|tsx|js|mjs|cjs)$/
const GENERALIZED_TEST_HINT = /(invariant|matrix|state|property|fuzz|idempotency)/i

const RISK_DOMAINS = [
  {
    name: 'payments-and-bookings',
    source: [
      /^apps\/web\/src\/app\/api\/v1\/bookings\//,
      /^apps\/web\/src\/app\/api\/v1\/webhooks\/(stripe|coinbase)\/route\.ts$/,
      /^apps\/web\/src\/lib\/(stripe|coinbase|webhook-idempotency|booking-settlement)\.ts$/,
      /^apps\/web\/src\/lib\/payments\//,
      /^apps\/web\/src\/lib\/bounties\/application-actions\.ts$/,
    ],
    tests: [
      /^tests\/web\/api\/bookings\//,
      /^tests\/web\/api\/webhooks\//,
      /^tests\/web\/lib\/(stripe|webhook-idempotency|payments|booking-settlement|bounties)\//,
      /^tests\/web\/lib\/(stripe|webhook-idempotency|payments|booking-settlement|bounties)\.test\.ts$/,
    ],
  },
  {
    name: 'auth-and-session',
    source: [
      /^apps\/web\/src\/app\/auth\//,
      /^apps\/web\/src\/app\/\(auth\)\//,
      /^apps\/web\/src\/lib\/auth-callback\.ts$/,
      /^apps\/web\/src\/lib\/supabase\/(server|middleware)\.ts$/,
      /^apps\/web\/src\/lib\/api-auth\.ts$/,
    ],
    tests: [
      /^tests\/web\/lib\/auth-callback\.test\.ts$/,
      /^tests\/web\/lib\/session-owner-agent\.test\.ts$/,
      /^tests\/web\/lib\/supabase-cookie-domain\.test\.ts$/,
      /^tests\/web\/lib\/api-auth.*\.test\.ts$/,
      /^tests\/web\/api\/auth\//,
      /^tests\/web\/api\/mcp\/chatgpt-mixed-auth\.test\.ts$/,
    ],
  },
  {
    name: 'notification-delivery',
    source: [
      /^apps\/web\/src\/lib\/(notifications|notification-delivery)\.ts$/,
      /^apps\/web\/src\/app\/api\/v1\/notifications\//,
      /^apps\/web\/src\/app\/api\/v1\/notification-channels\//,
    ],
    tests: [
      /^tests\/web\/lib\/notifications\.test\.ts$/,
      /^tests\/web\/api\/notifications\//,
    ],
  },
]

function matchesAny(value, patterns) {
  return patterns.some((pattern) => pattern.test(value))
}

function collectHeadCommitFiles() {
  const output = runGit(['show', '--name-only', '--pretty=format:', 'HEAD'])
  if (!output) return []

  return unique(
    output
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean)
  )
}

let changedFiles = collectChangedFiles()
if (changedFiles.length === 0 && mode === '--full') {
  changedFiles = collectHeadCommitFiles()
}

if (changedFiles.length === 0) {
  console.log(`[risk-tests] PASS (${mode}) no changed files detected.`)
  process.exit(0)
}

const changedTests = changedFiles.filter((file) => TEST_FILE_REGEX.test(file))
const touchedDomains = RISK_DOMAINS.filter((domain) => changedFiles.some((file) => matchesAny(file, domain.source)))

if (touchedDomains.length === 0) {
  console.log(`[risk-tests] PASS (${mode}) no high-risk source changes detected.`)
  process.exit(0)
}

const violations = []

if (changedTests.length === 0) {
  violations.push({
    type: 'missing-tests',
    message: 'High-risk source files changed without any test changes in this patch.',
  })
}

const missingDomainTests = touchedDomains.filter(
  (domain) => !changedTests.some((file) => matchesAny(file, domain.tests))
)

for (const domain of missingDomainTests) {
  violations.push({
    type: 'domain-coverage',
    message: `High-risk domain "${domain.name}" changed, but no matching tests were updated.`,
  })
}

const generalizedTests = changedTests.filter((file) => GENERALIZED_TEST_HINT.test(path.basename(file)))
if (generalizedTests.length === 0) {
  violations.push({
    type: 'generalized-tests',
    message: 'At least one generalized test (invariant/matrix/state/property/fuzz/idempotency) must be part of high-risk changes.',
  })
}

if (violations.length > 0) {
  console.error(`[risk-tests] FAIL (${mode}) found ${violations.length} issue(s):`)
  for (const violation of violations) {
    console.error(`- [${violation.type}] ${violation.message}`)
  }

  console.error('\nTouched high-risk domains:')
  for (const domain of touchedDomains) {
    console.error(`- ${domain.name}`)
  }

  const changedRiskSources = changedFiles.filter((file) =>
    touchedDomains.some((domain) => matchesAny(file, domain.source))
  )

  console.error('\nChanged high-risk source files:')
  for (const file of changedRiskSources) {
    console.error(`- ${file}`)
  }

  console.error('\nChanged tests in patch:')
  if (changedTests.length === 0) {
    console.error('- (none)')
  } else {
    for (const file of changedTests) {
      console.error(`- ${file}`)
    }
  }

  process.exit(1)
}

console.log(`[risk-tests] PASS (${mode}) touched domains: ${touchedDomains.map((d) => d.name).join(', ')}`)
console.log(`[risk-tests] PASS (${mode}) generalized tests: ${generalizedTests.length}`)
