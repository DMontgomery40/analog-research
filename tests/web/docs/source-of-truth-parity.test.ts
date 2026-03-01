import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(__dirname, '../../..')

// ---------------------------------------------------------------------------
// MCP helpers
// ---------------------------------------------------------------------------

function extractMcpToolNames(): string[] {
  const toolsFile = path.join(repoRoot, 'packages/analoglabor-mcp/src/tools.ts')
  const contents = fs.readFileSync(toolsFile, 'utf-8')
  const names: string[] = []
  for (const match of contents.matchAll(/name:\s*'([a-z_]+)'/g)) {
    names.push(match[1])
  }
  return [...new Set(names)].sort()
}

function extractMcpDocsToolNames(): string[] {
  const docsFile = path.join(repoRoot, 'apps/web/src/app/mcp/page.tsx')
  const contents = fs.readFileSync(docsFile, 'utf-8')
  const names: string[] = []
  // Tool entries: name followed by description (next line).
  // Param entries: name followed by type (same object). We skip those.
  for (const match of contents.matchAll(/name:\s*'([a-z_]+)',\s*\n\s*description:/g)) {
    names.push(match[1])
  }
  return [...new Set(names)].sort()
}

// ---------------------------------------------------------------------------
// API docs helpers
// ---------------------------------------------------------------------------

function extractOpenApiPaths(): string[] {
  const specFile = path.join(repoRoot, 'apps/web/public/openapi.json')
  const spec = JSON.parse(fs.readFileSync(specFile, 'utf-8')) as {
    paths?: Record<string, unknown>
  }
  return Object.keys(spec.paths ?? {}).sort()
}

function extractApiDocsEndpointPaths(): string[] {
  const docsFile = path.join(repoRoot, 'apps/web/src/app/api-docs/page.tsx')
  const contents = fs.readFileSync(docsFile, 'utf-8')
  const paths: string[] = []
  // Docs use /v1/... prefix; strip it to match openapi paths
  for (const match of contents.matchAll(/path:\s*'\/v1(\/[^']+)'/g)) {
    paths.push(match[1])
  }
  return [...new Set(paths)].sort()
}

// ---------------------------------------------------------------------------
// Paths intentionally excluded from the public API docs page.
// When you add a new public endpoint, REMOVE it from this list and add it to
// the docs page. If a new path shows up that truly shouldn't be public-facing,
// add it here with a comment explaining why.
// ---------------------------------------------------------------------------
const EXCLUDED_FROM_PUBLIC_DOCS = new Set([
  // Admin-only endpoints (separate admin dashboard docs)
  '/admin/bookings',
  '/admin/bounties',
  '/admin/disputes',
  '/admin/disputes/{id}',
  '/admin/humans',
  '/admin/humans/{id}',
  '/admin/humans/{id}/unverify',
  '/admin/humans/{id}/verify',
  '/admin/moderation/config',
  '/admin/moderation/events',
  '/admin/stats',
  '/admin/transactions',

  // Internal webhook receivers (not callable by API consumers)
  '/webhooks/coinbase',
  '/webhooks/stripe',

  // Internal / machine-readable endpoints
  '/welcome',
  '/llms.txt',
  '/moderation/preflight',

  // Agent-specific notification alias (documented under /notifications)
  '/agent/notifications',

  // Endpoints documented in dashboard, not public API docs
  '/humans/me/stripe-connect',
  '/notifications',
  '/notification-channels',
  '/notification-channels/{id}',
  '/notification-channels/{id}/test',
  '/integrations',
  '/integrations/providers',
  '/integrations/{provider}',
  '/integrations/{provider}/test',
  '/external-jobs',
  '/external-jobs/{id}',
  '/external-jobs/{id}/approve',
  '/external-jobs/{id}/cancel',
  '/external-jobs/{id}/messages',
  '/external-jobs/{id}/reject',
])

// Paths in the docs page that use different param names or sub-resources
// compared to openapi.json. Map from docs path -> canonical openapi path.
const DOCS_PATH_ALIASES: Record<string, string> = {
  // Docs uses {appId} for clarity; openapi nests under /applications
  '/bounties/{id}/applications/{appId}': '/bounties/{id}/applications',
  // Docs calls it /keys/generate; openapi models it as POST /keys
  '/keys/generate': '/keys',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Docs source-of-truth parity', () => {
  describe('MCP docs ↔ MCP_TOOL_DEFINITIONS', () => {
    it('every canonical MCP tool appears on the docs page', () => {
      const canonical = extractMcpToolNames()
      const documented = new Set(extractMcpDocsToolNames())

      expect(canonical.length).toBeGreaterThan(0)

      const missing = canonical.filter(name => !documented.has(name))
      expect(missing, [
        'MCP docs page is missing tools from packages/analoglabor-mcp/src/tools.ts:',
        ...missing.map(n => `  - ${n}`),
        '',
        'Update apps/web/src/app/mcp/page.tsx to include these tools.',
      ].join('\n')).toEqual([])
    })

    it('docs page does not list tools removed from MCP_TOOL_DEFINITIONS', () => {
      const canonical = new Set(extractMcpToolNames())
      const documented = extractMcpDocsToolNames()

      const stale = documented.filter(name => !canonical.has(name))
      expect(stale, [
        'MCP docs page lists tools not found in packages/analoglabor-mcp/src/tools.ts:',
        ...stale.map(n => `  - ${n}`),
        '',
        'Remove these from apps/web/src/app/mcp/page.tsx.',
      ].join('\n')).toEqual([])
    })
  })

  describe('API docs ↔ openapi.json', () => {
    it('every openapi.json path is either documented or explicitly excluded', () => {
      const canonical = extractOpenApiPaths()
      const documented = new Set(extractApiDocsEndpointPaths())

      expect(canonical.length).toBeGreaterThan(0)

      const undocumented = canonical.filter(
        p => !documented.has(p) && !EXCLUDED_FROM_PUBLIC_DOCS.has(p)
      )
      expect(undocumented, [
        'openapi.json paths missing from BOTH the API docs page AND the exclusion list:',
        ...undocumented.map(p => `  - ${p}`),
        '',
        'Either add these to apps/web/src/app/api-docs/page.tsx,',
        'or add them to EXCLUDED_FROM_PUBLIC_DOCS in this test with a comment.',
      ].join('\n')).toEqual([])
    })

    it('docs page does not reference endpoints removed from openapi.json', () => {
      const canonical = new Set(extractOpenApiPaths())
      const documented = extractApiDocsEndpointPaths()

      const stale = documented.filter(p => {
        if (canonical.has(p)) return false
        // Check if this is a known alias
        const alias = DOCS_PATH_ALIASES[p]
        if (alias && canonical.has(alias)) return false
        return true
      })
      expect(stale, [
        'API docs page references paths not found in openapi.json:',
        ...stale.map(p => `  - /v1${p}`),
        '',
        'Remove or update these in apps/web/src/app/api-docs/page.tsx.',
      ].join('\n')).toEqual([])
    })

    it('exclusion list has no stale entries', () => {
      const canonical = new Set(extractOpenApiPaths())

      const stale = [...EXCLUDED_FROM_PUBLIC_DOCS].filter(p => !canonical.has(p))
      expect(stale, [
        'EXCLUDED_FROM_PUBLIC_DOCS contains paths no longer in openapi.json:',
        ...stale.map(p => `  - ${p}`),
        '',
        'Remove these from the exclusion list in this test file.',
      ].join('\n')).toEqual([])
    })
  })
})
