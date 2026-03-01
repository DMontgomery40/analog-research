import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function resolveRepoRoot(): string {
  const cwd = process.cwd()
  if (fs.existsSync(path.join(cwd, 'apps/web/src'))) return cwd
  return path.resolve(cwd, '..', '..')
}

function listApiRoutePatterns(apiRoot: string): string[] {
  const patterns: string[] = []

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
        continue
      }

      if (!entry.isFile() || entry.name !== 'route.ts') continue

      const relative = path.relative(apiRoot, fullPath).replace(/\\/g, '/')
      const routePart = relative.replace(/\/route\.ts$/, '')
      patterns.push(routePart ? `/api/${routePart}` : '/api')
    }
  }

  walk(apiRoot)
  return patterns
}

function routePatternToRegex(pattern: string): RegExp {
  let value = pattern
    .replace(/\[\[\.\.\.[^\]]+\]\]/g, '__OPT_CATCHALL__')
    .replace(/\[\.\.\.[^\]]+\]/g, '__CATCHALL__')
    .replace(/\[[^\]]+\]/g, '__SEGMENT__')

  value = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  value = value
    .replace(/__OPT_CATCHALL__/g, '.*')
    .replace(/__CATCHALL__/g, '.+')
    .replace(/__SEGMENT__/g, '[^/]+')

  return new RegExp(`^${value}$`)
}

function extractApiFetchPaths(source: string): string[] {
  const matches: string[] = []
  const regex = /fetch\(\s*(['"`])([^'"`]+)\1/g

  for (const match of source.matchAll(regex)) {
    const raw = match[2]?.trim()
    if (!raw || !raw.startsWith('/api/')) continue
    const withoutQuery = raw.split('?')[0]
    const normalized = withoutQuery.replace(/\$\{[^}]+\}/g, (placeholder, offset, full) => {
      void placeholder
      const previous = full[offset - 1]
      // Keep path-segment interpolation (`/.../${id}/...`) and strip query/fragment suffix interpolation (`...${querySuffix}`).
      return previous === '/' ? '__SEGMENT__' : ''
    })

    matches.push(normalized)
  }

  return matches
}

describe('frontend -> API wiring parity', () => {
  it('ensures critical dashboard surfaces only call resolvable API routes', () => {
    const repoRoot = resolveRepoRoot()
    const apiRoot = path.join(repoRoot, 'apps/web/src/app/api')

    const criticalFrontendFiles = [
      'apps/web/src/app/(dashboard)/dashboard/settings/page.tsx',
      'apps/web/src/components/settings/notification-channels-settings.tsx',
      'apps/web/src/components/settings/agent-payment-preferences.tsx',
      'apps/web/src/components/settings/mcp-oauth-link-settings.tsx',
      'apps/web/src/app/(dashboard)/dashboard/field-checks/page.tsx',
      'apps/web/src/components/field-checks/FieldCheckOrderForm.tsx',
      'apps/web/src/app/(dashboard)/dashboard/profile/page.tsx',
    ].map((relativePath) => path.join(repoRoot, relativePath))

    const routeRegexes = listApiRoutePatterns(apiRoot).map((pattern) => ({
      pattern,
      regex: routePatternToRegex(pattern),
    }))

    const missing: string[] = []

    for (const filePath of criticalFrontendFiles) {
      const content = fs.readFileSync(filePath, 'utf8')
      const apiFetchPaths = extractApiFetchPaths(content)

      for (const rawPath of apiFetchPaths) {
        const samplePath = rawPath.replace(/__SEGMENT__/g, 'x')
        const matched = routeRegexes.some((route) => route.regex.test(samplePath))
        if (!matched) {
          missing.push(`${filePath}: ${rawPath}`)
        }
      }
    }

    expect(missing).toEqual([])
  })
})
