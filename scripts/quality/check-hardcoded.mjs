#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { collectChangedFiles, collectFullFiles, getRepoRoot } from './common.mjs'

const mode = process.argv[2] || '--changed'
if (mode !== '--changed' && mode !== '--full') {
  console.error('Usage: node scripts/quality/check-hardcoded.mjs [--changed|--full]')
  process.exit(2)
}

const repoRoot = getRepoRoot()
process.chdir(repoRoot)

const policyPath = path.join(repoRoot, 'scripts/quality/hardcoded-policy.json')
const policyRaw = await fs.readFile(policyPath, 'utf8')
const policy = JSON.parse(policyRaw)

const scanExtensions = new Set(policy.scanExtensions)
const ignoreRegexes = (policy.ignorePathRegex || []).map((pattern) => new RegExp(pattern))
const secretPatterns = (policy.secretPatterns || []).map((entry) => ({
  ...entry,
  regex: new RegExp(entry.regex),
}))
const forbiddenAssignments = (policy.forbiddenAssignments || []).map((entry) => ({
  ...entry,
  regex: new RegExp(entry.regex),
}))

function shouldScan(relativePath) {
  if (!relativePath) return false
  if (ignoreRegexes.some((regex) => regex.test(relativePath))) return false

  const ext = path.extname(relativePath)
  return scanExtensions.has(ext)
}

const candidates = (mode === '--changed' ? collectChangedFiles() : collectFullFiles())
  .filter(shouldScan)

if (candidates.length === 0) {
  console.log(`[hardcoded] No files to scan in ${mode} mode.`)
  process.exit(0)
}

const violations = []

for (const relativePath of candidates) {
  let content = ''

  try {
    content = await fs.readFile(path.join(repoRoot, relativePath), 'utf8')
  } catch {
    continue
  }

  const lines = content.split(/\r?\n/)

  lines.forEach((line, index) => {
    if (line.includes('hardcoded-ok')) return

    secretPatterns.forEach((pattern) => {
      if (!pattern.regex.test(line)) return

      violations.push({
        file: relativePath,
        line: index + 1,
        rule: pattern.name,
        message: `Found potential hardcoded secret/token (${pattern.name})`,
        snippet: line.trim().slice(0, 200),
      })
    })

    forbiddenAssignments.forEach((rule) => {
      if (!rule.regex.test(line)) return

      violations.push({
        file: relativePath,
        line: index + 1,
        rule: rule.name,
        message: rule.message || `Found forbidden hardcoded assignment (${rule.name})`,
        snippet: line.trim().slice(0, 200),
      })
    })
  })
}

if (violations.length === 0) {
  console.log(`[hardcoded] PASS (${mode}) scanned ${candidates.length} file(s).`)
  process.exit(0)
}

console.error(`[hardcoded] FAIL (${mode}) found ${violations.length} violation(s):`)
violations.forEach((violation) => {
  console.error(`- ${violation.file}:${violation.line} [${violation.rule}] ${violation.message}`)
  console.error(`  ${violation.snippet}`)
})

process.exit(1)
