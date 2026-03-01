#!/usr/bin/env node

import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

import { collectChangedFiles, collectFullFiles, getRepoRoot } from './common.mjs'

const mode = process.argv[2] || '--changed'
if (mode !== '--changed' && mode !== '--full') {
  console.error('Usage: node scripts/quality/check-ai-slop.mjs [--changed|--full]')
  process.exit(2)
}

const repoRoot = getRepoRoot()
process.chdir(repoRoot)

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs'])
const IGNORED_PATH_PATTERNS = [
  /^node_modules\//,
  /^apps\/web\/\.next\//,
  /^apps\/web\/\.netlify\//,
  /^packages\/.*\/dist\//,
  /^coverage\//,
  /^docs\//,
  /^tests\//,
  /^\.tests\//,
  /^scripts\//,
  /\.d\.ts$/,
  /\.test\.(ts|tsx|js|mjs|cjs)$/,
  /\.spec\.(ts|tsx|js|mjs|cjs)$/,
]

const SAFE_FUNCTION_NAMES = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head'])

function isSourceFile(relativePath) {
  if (!relativePath) return false
  if (!(relativePath.startsWith('apps/') || relativePath.startsWith('packages/'))) return false
  if (IGNORED_PATH_PATTERNS.some((regex) => regex.test(relativePath))) return false
  return SOURCE_EXTENSIONS.has(path.extname(relativePath))
}

function existsInHead(relativePath) {
  try {
    execFileSync('git', ['cat-file', '-e', `HEAD:${relativePath}`], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function normalizeSourceText(input) {
  return input
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1')
    .replace(/`(?:\\.|[^`])*`/g, 'STR')
    .replace(/'(?:\\.|[^'])*'/g, 'STR')
    .replace(/"(?:\\.|[^"])*"/g, 'STR')
    .replace(/\b\d+(?:\.\d+)?\b/g, 'NUM')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function tokenizeForSimilarity(input) {
  const normalized = normalizeSourceText(input)
  const tokens = normalized.match(/[a-z_][a-z0-9_]*/g) || []
  return new Set(tokens)
}

function jaccardSimilarity(a, b) {
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const token of a) {
    if (b.has(token)) intersection += 1
  }
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

function maybeSuspiciousFilename(relativePath, existingFileSet) {
  const ext = path.extname(relativePath)
  const dir = path.dirname(relativePath)
  const base = path.basename(relativePath, ext)
  const lower = base.toLowerCase()

  const suffixPattern = /(?:^|[-_])(copy|clone|duplicate|temp|tmp|new|final|backup|old|v\d+)$/i
  if (!suffixPattern.test(base)) return null

  const normalizedBase = lower.replace(/(?:^|[-_])(copy|clone|duplicate|temp|tmp|new|final|backup|old|v\d+)$/i, '')

  const siblingMatch = [...existingFileSet].find((candidate) => {
    if (candidate === relativePath) return false
    if (path.dirname(candidate) !== dir) return false
    if (path.extname(candidate) !== ext) return false
    const candidateBase = path.basename(candidate, ext).toLowerCase()
    return candidateBase === normalizedBase
  })

  return {
    normalizedBase,
    siblingMatch,
  }
}

function normalizeFunctionBody(input) {
  return normalizeSourceText(input)
}

function hash(input) {
  return crypto.createHash('sha1').update(input).digest('hex')
}

function extractFunctions(relativePath, sourceText) {
  const sourceFile = ts.createSourceFile(relativePath, sourceText, ts.ScriptTarget.Latest, true)
  const functions = []

  const pushFunction = (name, node, bodyNode) => {
    if (!name || !bodyNode) return

    const bodyText = bodyNode.getText(sourceFile)
    const normalizedBody = normalizeFunctionBody(bodyText)
    if (normalizedBody.length < 220) return

    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1

    functions.push({
      name,
      file: relativePath,
      line,
      hash: hash(normalizedBody),
      size: normalizedBody.length,
    })
  }

  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      pushFunction(node.name.text, node, node.body)
    }

    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.initializer
      && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      pushFunction(node.name.text, node, node.initializer.body)
    }

    if (ts.isMethodDeclaration(node) && node.body && ts.isIdentifier(node.name)) {
      pushFunction(node.name.text, node, node.body)
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return functions
}

const changedSourceFiles = collectChangedFiles().filter(isSourceFile)
if (changedSourceFiles.length === 0) {
  console.log(`[ai-slop] PASS (${mode}) no changed app/package source files.`)
  process.exit(0)
}

const allSourceFiles = collectFullFiles().filter(isSourceFile)
const allSourceSet = new Set(allSourceFiles)

const fileTextCache = new Map()
async function readText(relativePath) {
  if (fileTextCache.has(relativePath)) return fileTextCache.get(relativePath)

  const fullPath = path.join(repoRoot, relativePath)
  let text = ''
  try {
    text = await fs.readFile(fullPath, 'utf8')
  } catch (error) {
    /**
     * @remarks
     * This quality check runs in the presence of partial staging (a common developer workflow).
     * In that case, `git ls-files` can include a path that is tracked in the index but deleted
     * from the working tree, which would otherwise crash the checker with ENOENT.
     */
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      text = ''
    } else {
      throw error
    }
  }
  fileTextCache.set(relativePath, text)
  return text
}

const violations = []

const newSourceFiles = []
for (const file of changedSourceFiles) {
  if (!existsInHead(file)) {
    newSourceFiles.push(file)
  }
}

for (const file of newSourceFiles) {
  const sourceText = await readText(file)
  if (sourceText.includes('ai-slop-ok')) continue

  const suspicious = maybeSuspiciousFilename(file, allSourceSet)
  if (suspicious) {
    violations.push({
      type: 'suspicious-file-name',
      file,
      detail: suspicious.siblingMatch
        ? `new file name looks like variant of existing file ${suspicious.siblingMatch}`
        : 'new file name uses slop-like suffix (copy/new/vN/temp/final)',
    })
  }
}

const tokenCache = new Map()
async function getTokenSet(relativePath) {
  if (tokenCache.has(relativePath)) return tokenCache.get(relativePath)
  const text = await readText(relativePath)
  const tokens = tokenizeForSimilarity(text)
  tokenCache.set(relativePath, tokens)
  return tokens
}

for (const file of newSourceFiles) {
  const sourceText = await readText(file)
  if (sourceText.includes('ai-slop-ok')) continue

  const lineCount = sourceText.split(/\r?\n/).length
  if (lineCount < 60) continue

  const sourceTokens = await getTokenSet(file)
  if (sourceTokens.size < 140) continue

  let bestMatch = null
  let bestScore = 0

  for (const candidate of allSourceFiles) {
    if (candidate === file) continue

    const candidateText = await readText(candidate)
    if (candidateText.includes('ai-slop-ok')) continue

    const candidateLines = candidateText.split(/\r?\n/).length
    const lineDelta = Math.abs(candidateLines - lineCount)
    if (lineDelta > Math.max(80, Math.round(lineCount * 0.6))) continue

    const candidateTokens = await getTokenSet(candidate)
    if (candidateTokens.size < 120) continue

    const score = jaccardSimilarity(sourceTokens, candidateTokens)
    if (score > bestScore) {
      bestScore = score
      bestMatch = candidate
    }
  }

  if (bestMatch && bestScore >= 0.82) {
    violations.push({
      type: 'near-duplicate-new-file',
      file,
      detail: `new file is ${Math.round(bestScore * 100)}% token-similar to existing file ${bestMatch}`,
    })
  }
}

const functionsByHash = new Map()
const functionsByFile = new Map()

for (const file of allSourceFiles) {
  const sourceText = await readText(file)
  if (sourceText.includes('ai-slop-ok')) continue

  const functions = extractFunctions(file, sourceText)
  functionsByFile.set(file, functions)

  for (const fn of functions) {
    if (!functionsByHash.has(fn.hash)) functionsByHash.set(fn.hash, [])
    functionsByHash.get(fn.hash).push(fn)
  }
}

for (const file of changedSourceFiles) {
  const sourceText = await readText(file)
  if (sourceText.includes('ai-slop-ok')) continue

  const changedFunctions = functionsByFile.get(file) || []

  for (const fn of changedFunctions) {
    if (SAFE_FUNCTION_NAMES.has(fn.name.toLowerCase())) continue

    const matches = (functionsByHash.get(fn.hash) || [])
      .filter((candidate) => candidate.file !== fn.file)
      .filter((candidate) => !SAFE_FUNCTION_NAMES.has(candidate.name.toLowerCase()))
      .filter((candidate) => candidate.name !== fn.name)

    if (matches.length === 0) continue

    const first = matches[0]
    violations.push({
      type: 'duplicated-function-body',
      file: fn.file,
      line: fn.line,
      detail: `function '${fn.name}' matches body of '${first.name}' in ${first.file}:${first.line}`,
    })
  }
}

if (violations.length === 0) {
  console.log(`[ai-slop] PASS (${mode}) checked ${changedSourceFiles.length} changed source file(s).`)
  process.exit(0)
}

console.error(`[ai-slop] FAIL (${mode}) found ${violations.length} issue(s):`)
for (const violation of violations) {
  const linePart = violation.line ? `:${violation.line}` : ''
  console.error(`- [${violation.type}] ${violation.file}${linePart} -> ${violation.detail}`)
}

console.error('Add `ai-slop-ok` in file only for intentional, reviewed exceptions.')
process.exit(1)
