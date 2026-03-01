import fs from 'node:fs/promises'
import path from 'node:path'
import { collectFullFiles, getRepoRoot } from './common.mjs'

export const TEST_FILE_REGEX = /^tests\/.*\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/

export const FORBIDDEN_PATTERNS = [
  { name: 'vi.mock', regex: /\bvi\.mock\(/g },
  { name: 'vi.fn', regex: /\bvi\.fn\(/g },
  { name: 'vi.spyOn', regex: /\bvi\.spyOn\(/g },
  { name: 'jest.mock', regex: /\bjest\.mock\(/g },
  { name: 'jest.fn', regex: /\bjest\.fn\(/g },
  { name: 'mockResolvedValue', regex: /\.mockResolvedValue(?:Once)?\(/g },
  { name: 'mockReturnValue', regex: /\.mockReturnValue(?:Once)?\(/g },
  { name: 'mockImplementation', regex: /\.mockImplementation(?:Once)?\(/g },
]

function countLineNumber(content, index) {
  return content.slice(0, index).split(/\r?\n/).length
}

function unique(values) {
  return Array.from(new Set(values))
}

export async function collectNoMockViolations(options = {}) {
  const repoRoot = options.repoRoot || getRepoRoot()
  const onlyFiles = unique((options.onlyFiles || []).filter(Boolean))
  const normalizedOnly = new Set(onlyFiles.map((value) => value.replace(/\\/g, '/')))

  const allTestFiles = collectFullFiles()
    .filter((file) => TEST_FILE_REGEX.test(file))
    .map((file) => file.replace(/\\/g, '/'))

  const testFiles = normalizedOnly.size > 0
    ? allTestFiles.filter((file) => normalizedOnly.has(file))
    : allTestFiles

  const violations = []

  for (const relativePath of testFiles) {
    let content = ''
    try {
      content = await fs.readFile(path.join(repoRoot, relativePath), 'utf8')
    } catch {
      continue
    }

    for (const pattern of FORBIDDEN_PATTERNS) {
      for (const match of content.matchAll(pattern.regex)) {
        const index = match.index ?? 0
        const line = countLineNumber(content, index)
        const snippet = content.split(/\r?\n/)[line - 1]?.trim() || ''

        violations.push({
          file: relativePath,
          line,
          rule: pattern.name,
          snippet: snippet.slice(0, 220),
        })
      }
    }
  }

  const files = testFiles.map((file) => {
    const fileViolations = violations
      .filter((entry) => entry.file === file)
      .sort((a, b) => (a.line - b.line) || a.rule.localeCompare(b.rule))

    return {
      file,
      count: fileViolations.length,
      violations: fileViolations,
    }
  })

  return {
    repoRoot,
    scannedFiles: testFiles.length,
    totalViolations: violations.length,
    filesWithViolations: files.filter((entry) => entry.count > 0).length,
    files: files.sort((a, b) => b.count - a.count || a.file.localeCompare(b.file)),
    violations: violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line),
  }
}
