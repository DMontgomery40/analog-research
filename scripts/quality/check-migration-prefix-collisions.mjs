#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '../..')

const migrationsDir = path.join(repoRoot, 'packages/database/supabase/migrations')

const allowedLegacyCollisions = new Set([
  // Legacy numbering collisions retained for backwards compatibility.
  '024',
  '025',
])

if (!fs.existsSync(migrationsDir)) {
  console.error(`[migration-prefix] FAIL: migrations directory not found: ${migrationsDir}`)
  process.exit(1)
}

const files = fs
  .readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort((a, b) => a.localeCompare(b))

const grouped = new Map()

for (const file of files) {
  const match = file.match(/^(\d+)_/)
  if (!match) {
    continue
  }

  const prefix = match[1]
  if (!grouped.has(prefix)) {
    grouped.set(prefix, [])
  }
  grouped.get(prefix).push(file)
}

const collisions = [...grouped.entries()]
  .filter(([, prefixed]) => prefixed.length > 1)
  .map(([prefix, prefixed]) => ({ prefix, files: prefixed }))

const blocking = collisions.filter((collision) => !allowedLegacyCollisions.has(collision.prefix))
const allowlisted = collisions.filter((collision) => allowedLegacyCollisions.has(collision.prefix))

if (allowlisted.length > 0) {
  console.warn('[migration-prefix] WARN: legacy allowlisted collisions detected:')
  for (const collision of allowlisted) {
    console.warn(`  - ${collision.prefix}: ${collision.files.join(', ')}`)
  }
}

if (blocking.length > 0) {
  console.error('[migration-prefix] FAIL: duplicate migration prefixes are not allowed:')
  for (const collision of blocking) {
    console.error(`  - ${collision.prefix}: ${collision.files.join(', ')}`)
  }
  process.exit(1)
}

console.log('[migration-prefix] PASS: no blocking duplicate migration prefixes found')
