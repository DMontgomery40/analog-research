#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { getRepoRoot } from '../quality/common.mjs'
import { collectNoMockViolations } from '../quality/no-mock-lib.mjs'

const repoRoot = getRepoRoot()
const scriptDir = path.resolve(repoRoot, 'scripts/ralph-real-test-remediation')
const prdPath = path.join(scriptDir, 'prd.json')

// Ensure git file enumeration returns repo-root-relative paths (tests/...)
process.chdir(repoRoot)

const args = process.argv.slice(2)
let batchSize = Number.parseInt(process.env.REAL_TEST_BATCH_SIZE || '8', 10)

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i]
  if (arg === '--batch-size') {
    const value = args[i + 1]
    if (!value) {
      console.error('Missing value for --batch-size')
      process.exit(2)
    }
    i += 1
    batchSize = Number.parseInt(value, 10)
    continue
  }
}

if (!Number.isInteger(batchSize) || batchSize <= 0) {
  console.error(`Invalid batch size: ${batchSize}`)
  process.exit(2)
}

const scan = await collectNoMockViolations({ repoRoot })
const filesWithViolations = scan.files.filter((entry) => entry.count > 0)

const stories = []
for (let start = 0; start < filesWithViolations.length; start += batchSize) {
  const batch = filesWithViolations.slice(start, start + batchSize)
  const storyIndex = stories.length + 1
  const storyId = `US-REAL-${String(storyIndex).padStart(3, '0')}`
  const violationCount = batch.reduce((sum, entry) => sum + entry.count, 0)

  stories.push({
    id: storyId,
    title: `Make tests real batch ${storyIndex}`,
    description: `Replace mocked tests with real assertions in ${batch.length} files (${violationCount} violations).`,
    acceptanceCriteria: [
      'All listed files contain zero mock violations (vi.mock/vi.fn/jest.mock/mockResolvedValue/etc).',
      'Tests use real-system assertions (deployed API / live service behavior) rather than imported route handlers.',
      'Batch verification command passes: node scripts/quality/check-no-mock-tests.mjs --files "<comma-separated-files>".',
      'Progress entry appended to scripts/ralph-real-test-remediation/progress.txt.',
    ],
    priority: storyIndex,
    passes: false,
    files: batch.map((entry) => entry.file),
    violationCount,
  })
}

const prd = {
  project: 'Analog Research Real Test Remediation',
  branchName: 'codex/real-test-remediation',
  description: 'Convert every mocked test into real validation against deployed APIs or live integrations. No fake assertions.',
  generatedAt: new Date().toISOString(),
  totals: {
    testFilesScanned: scan.scannedFiles,
    filesWithViolations: scan.filesWithViolations,
    totalViolations: scan.totalViolations,
    batchSize,
    storyCount: stories.length,
  },
  verificationCommands: {
    perStory: 'node scripts/quality/check-no-mock-tests.mjs --files "<comma-separated-files>"',
    global: 'pnpm check:no-mock-tests',
    realnessTriad: 'pnpm check:realness',
    fullGate: 'pnpm verify',
  },
  userStories: stories,
}

await fs.mkdir(scriptDir, { recursive: true })
await fs.writeFile(prdPath, `${JSON.stringify(prd, null, 2)}\n`)

console.log(`Generated ${prdPath}`)
console.log(`Stories: ${stories.length}`)
console.log(`Total violations: ${scan.totalViolations}`)
