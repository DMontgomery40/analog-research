#!/usr/bin/env node

import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { collectChangedFiles, getRepoRoot } from './common.mjs'

const mode = process.argv[2] || '--changed'
if (mode !== '--changed' && mode !== '--full') {
  console.error('Usage: node scripts/quality/check-duplicates.mjs [--changed|--full]')
  process.exit(2)
}

const repoRoot = getRepoRoot()
process.chdir(repoRoot)

const includeExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.css', '.sql', '.sh'])
const ignorePathRegexes = [
  /^node_modules\//,
  /^apps\/web\/\.next\//,
  /^apps\/web\/\.netlify\//,
  /^packages\/.*\/dist\//,
  /^coverage\//,
  /^docs\//,
  /^tests\//,
  /^\.tests\//,
  /^scripts\/ralph\//,
  /\.d\.ts$/,
  /\.test\.(ts|tsx|js|mjs|cjs)$/,
  /\.spec\.(ts|tsx|js|mjs|cjs)$/,
]

function shouldScan(relativePath) {
  if (!relativePath) return false
  if (ignorePathRegexes.some((regex) => regex.test(relativePath))) return false

  const ext = path.extname(relativePath)
  return includeExtensions.has(ext)
}

const ignoreGlob = [
  '**/node_modules/**',
  '**/.next/**',
  '**/.netlify/**',
  '**/dist/**',
  '**/coverage/**',
  '**/*.d.ts',
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.spec.ts',
  '**/*.spec.tsx',
  '**/*.md',
  '**/scripts/ralph/**',
].join(',')

const baseArgs = [
  'exec',
  'jscpd',
  '--min-lines',
  '10',
  '--min-tokens',
  '80',
  '--ignore',
  ignoreGlob,
]

if (mode === '--changed') {
  const files = collectChangedFiles()
    .filter(shouldScan)
    // `git diff --name-only` includes deleted paths; jscpd will crash if we pass them through.
    .filter((relativePath) => fs.existsSync(path.join(repoRoot, relativePath)))

  if (files.length < 2) {
    console.log(`[duplicates] Not enough changed source files to compare (${files.length}).`)
    process.exit(0)
  }

  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jscpd-'))
  const args = [
    ...baseArgs,
    '--silent',
    '--reporters',
    'json',
    '--output',
    reportDir,
    '--threshold',
    '100',
    ...files,
  ]

  console.log(`[duplicates] Running duplicate scan in ${mode} mode...`)
  const result = spawnSync('pnpm', args, { stdio: 'inherit', cwd: repoRoot })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }

  const reportPath = path.join(reportDir, 'jscpd-report.json')
  if (!fs.existsSync(reportPath)) {
    console.error('[duplicates] FAIL: missing jscpd report output.')
    process.exit(1)
  }

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  const duplicates = (report.duplicates || []).filter((entry) => (
    entry.firstFile?.name !== entry.secondFile?.name
  ))

  fs.rmSync(reportDir, { recursive: true, force: true })

  if (duplicates.length === 0) {
    console.log('[duplicates] PASS (--changed) no cross-file clones found.')
    process.exit(0)
  }

  console.error(`[duplicates] FAIL (--changed) found ${duplicates.length} cross-file clone(s):`)
  duplicates.forEach((entry) => {
    const first = entry.firstFile
    const second = entry.secondFile
    console.error(
      `- ${first?.name}:${first?.start}-${first?.end} <-> ${second?.name}:${second?.start}-${second?.end}`,
    )
  })

  process.exit(1)
} else {
  const args = [
    ...baseArgs,
    '--reporters',
    'console',
    '--threshold',
    '2',
    'apps/web/src',
    'packages',
    '.claude/hooks',
    'scripts/quality',
  ]

  console.log(`[duplicates] Running duplicate scan in ${mode} mode...`)
  const result = spawnSync('pnpm', args, { stdio: 'inherit', cwd: repoRoot })
  if (typeof result.status === 'number') {
    process.exit(result.status)
  }

  process.exit(1)
}
