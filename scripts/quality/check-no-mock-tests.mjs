#!/usr/bin/env node

import { getRepoRoot } from './common.mjs'
import { collectNoMockViolations } from './no-mock-lib.mjs'

function usage() {
  console.error('Usage: node scripts/quality/check-no-mock-tests.mjs [--json] [--no-fail] [--files file1,file2,...]')
}

const args = process.argv.slice(2)
let jsonOutput = false
let noFail = false
const files = []

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i]
  if (arg === '--json') {
    jsonOutput = true
    continue
  }
  if (arg === '--no-fail') {
    noFail = true
    continue
  }
  if (arg === '--files') {
    const value = args[i + 1]
    if (!value) {
      usage()
      process.exit(2)
    }
    i += 1
    for (const entry of value.split(',')) {
      const trimmed = entry.trim()
      if (trimmed.length > 0) files.push(trimmed)
    }
    continue
  }

  usage()
  process.exit(2)
}

const repoRoot = getRepoRoot()
process.chdir(repoRoot)

const result = await collectNoMockViolations({
  repoRoot,
  onlyFiles: files,
})

if (jsonOutput) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

if (result.totalViolations === 0) {
  if (!jsonOutput) {
    console.log(`[no-mock-tests] PASS scanned ${result.scannedFiles} test file(s).`)
  }
  process.exit(0)
}

if (!jsonOutput) {
  console.error(`[no-mock-tests] FAIL found ${result.totalViolations} forbidden mocking pattern(s):`)
  for (const violation of result.violations) {
    console.error(`- ${violation.file}:${violation.line} [${violation.rule}]`)
    console.error(`  ${violation.snippet}`)
  }
}

if (noFail) {
  process.exit(0)
}

process.exit(1)
