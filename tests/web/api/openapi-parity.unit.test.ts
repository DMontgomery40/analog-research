import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'])

function specPathToRouteDir(specPath: string): string {
  // OpenAPI path params are `{id}`; Next route handlers use `[id]`.
  return specPath
    .replace(/^\//, '')
    .replace(/\{([^}]+)\}/g, '[$1]')
}

function exportsHttpMethod(fileContents: string, method: string): boolean {
  const patterns = [
    new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`),
    new RegExp(`export\\s+const\\s+${method}\\b`),
    new RegExp(`export\\s*{[^}]*\\b${method}\\b[^}]*}`),
  ]

  return patterns.some((pattern) => pattern.test(fileContents))
}

describe('OpenAPI route parity (unit)', () => {
  it('all OpenAPI paths+methods exist as Next route handler exports', () => {
    const repoRoot = path.resolve(__dirname, '../../..')
    const specFile = path.join(repoRoot, 'apps/web/public/openapi.json')
    const spec = JSON.parse(fs.readFileSync(specFile, 'utf-8')) as {
      paths?: Record<string, Record<string, unknown>>
    }

    const missing: string[] = []

    for (const [specPath, operations] of Object.entries(spec.paths ?? {})) {
      const routeDir = specPathToRouteDir(specPath)
      const routeFile = path.join(repoRoot, 'apps/web/src/app/api/v1', routeDir, 'route.ts')

      if (!fs.existsSync(routeFile)) {
        missing.push(`Missing route file for ${specPath}: ${path.relative(repoRoot, routeFile)}`)
        continue
      }

      const contents = fs.readFileSync(routeFile, 'utf-8')

      for (const method of Object.keys(operations)) {
        const upper = method.toUpperCase()
        if (!HTTP_METHODS.has(upper)) continue

        if (!exportsHttpMethod(contents, upper)) {
          missing.push(`Missing export ${upper} for ${specPath} in ${path.relative(repoRoot, routeFile)}`)
        }
      }
    }

    expect(missing).toEqual([])
  })
})
