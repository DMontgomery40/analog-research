import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(__dirname, '../../..')

function extractCanonicalToolNames(): string[] {
  const toolsFile = path.join(repoRoot, 'packages/analogresearch-mcp/src/tools.ts')
  const contents = fs.readFileSync(toolsFile, 'utf-8')
  const names: string[] = []
  for (const match of contents.matchAll(/name:\s*'([a-z_]+)'/g)) {
    names.push(match[1])
  }
  return [...new Set(names)].sort()
}

function extractStandaloneHandledTools(): string[] {
  const indexFile = path.join(repoRoot, 'packages/analogresearch-mcp/src/index.ts')
  const contents = fs.readFileSync(indexFile, 'utf-8')
  const names: string[] = []
  for (const match of contents.matchAll(/case\s+'([a-z_]+)'\s*:/g)) {
    names.push(match[1])
  }
  return [...new Set(names)].sort()
}

describe('Standalone MCP parity', () => {
  it('standalone MCP switch handles all canonical MCP tools (no drift)', () => {
    const canonical = extractCanonicalToolNames()
    const handled = new Set(extractStandaloneHandledTools())

    const missing = canonical.filter((tool) => !handled.has(tool))
    expect(missing, [
      'packages/analogresearch-mcp/src/index.ts is missing case handlers for canonical tools:',
      ...missing.map((name) => `  - ${name}`),
      '',
      'Add switch cases or refactor handler mapping to cover all tools.',
    ].join('\n')).toEqual([])
  })

  it('standalone MCP switch has no stale handlers for removed canonical tools', () => {
    const canonical = new Set(extractCanonicalToolNames())
    const handled = extractStandaloneHandledTools()

    const stale = handled.filter((tool) => !canonical.has(tool))
    expect(stale, [
      'packages/analogresearch-mcp/src/index.ts has stale switch handlers not in canonical tools:',
      ...stale.map((name) => `  - ${name}`),
      '',
      'Remove stale handlers or add canonical definitions in packages/analogresearch-mcp/src/tools.ts.',
    ].join('\n')).toEqual([])
  })
})
