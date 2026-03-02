/**
 * Proxy middleware tests
 *
 * CRITICAL: These tests ensure static files and important routes are NOT
 * blocked by the proxy middleware. If these tests fail, production will 404
 * on critical resources like openapi.json.
 */

import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { config, proxy } from '@/proxy'

/**
 * Next.js matcher uses a custom syntax. This function simulates what Next.js
 * does internally to determine if a path matches the middleware.
 *
 * The pattern /((?!_next/static|...).*)  means:
 * - Match everything EXCEPT paths starting with the excluded prefixes
 */
function matchesNextJsPattern(pattern: string, pathname: string): boolean {
  // Next.js matcher pattern: /((?!excluded1|excluded2|...).*)
  // Extract the negative lookahead content - need to handle nested parens
  const lookaheadStart = pattern.indexOf('(?!')
  if (lookaheadStart === -1) return true

  // Find the matching closing paren for the negative lookahead
  let depth = 0
  let lookaheadEnd = -1
  for (let i = lookaheadStart + 3; i < pattern.length; i++) {
    if (pattern[i] === '(') depth++
    else if (pattern[i] === ')') {
      if (depth === 0) {
        lookaheadEnd = i
        break
      }
      depth--
    }
  }
  if (lookaheadEnd === -1) return true

  const lookaheadContent = pattern.slice(lookaheadStart + 3, lookaheadEnd)

  // Split by | but not inside parentheses
  const exclusions: string[] = []
  let current = ''
  let parenDepth = 0
  for (const char of lookaheadContent) {
    if (char === '(') parenDepth++
    else if (char === ')') parenDepth--
    else if (char === '|' && parenDepth === 0) {
      exclusions.push(current)
      current = ''
      continue
    }
    current += char
  }
  if (current) exclusions.push(current)

  for (const exclusion of exclusions) {
    // Handle patterns like .*\.(?:svg|png|...)$
    if (exclusion.includes('\\.(?:')) {
      // Extract extensions from pattern like .*\.(?:svg|png|jpg|jpeg|gif|webp)$
      const extMatch = exclusion.match(/\(\?:([^)]+)\)/)
      if (extMatch) {
        const extensions = extMatch[1].split('|')
        for (const ext of extensions) {
          if (pathname.endsWith('.' + ext)) {
            return false // Excluded by extension
          }
        }
      }
      continue
    }

    // Handle exact patterns like openapi\.json or favicon.ico
    const exactPattern = exclusion.replace(/\\\./g, '.')
    if (pathname === '/' + exactPattern) {
      return false // Excluded
    }

    // Handle prefix patterns like _next/static
    if (pathname.startsWith('/' + exclusion + '/') || pathname === '/' + exclusion) {
      return false // Excluded
    }
  }

  return true // Not excluded, middleware will run
}

describe('Proxy middleware matcher', () => {
  const pattern = config.matcher[0]

  describe('MUST exclude static files (proxy should NOT run on these)', () => {
    const staticFiles = [
      // CRITICAL: API documentation
      ['/openapi.json', 'API documentation spec'],
      ['/openapi.pdf', 'API documentation PDF'],

      // Standard static assets
      ['/favicon.ico', 'favicon'],
      ['/logo.svg', 'SVG images'],
      ['/logo.png', 'PNG images'],
      ['/hero.jpg', 'JPG images'],
      ['/image.jpeg', 'JPEG images'],
      ['/animation.gif', 'GIF images'],
      ['/photo.webp', 'WebP images'],

      // Next.js internals
      ['/_next/static/chunks/main.js', 'Next.js static chunks'],
      ['/_next/static/css/app.css', 'Next.js static CSS'],
      ['/_next/image/test.png', 'Next.js image optimization'],
    ] as const

    it.each(staticFiles)('should NOT intercept %s (%s)', (path) => {
      const willIntercept = matchesNextJsPattern(pattern, path)
      expect(
        willIntercept,
        `CRITICAL: Proxy will intercept ${path} - this will cause 404 errors in production!`
      ).toBe(false)
    })
  })

  describe('MUST intercept application routes (proxy should run on these)', () => {
    const appRoutes = [
      // Pages
      ['/', 'home page'],
      ['/login', 'login page'],
      ['/signup', 'signup page'],
      ['/dashboard', 'dashboard'],
      ['/dashboard/bookings', 'bookings page'],
      ['/browse', 'browse page'],
      ['/humans/123', 'human profile'],

      // API routes
      ['/api/v1/humans', 'humans API'],
      ['/api/v1/bookings', 'bookings API'],
      ['/api/v1/welcome', 'welcome API'],
      ['/api/v1/mcp/chatgpt', 'ChatGPT MCP API'],
      ['/v1/mcp/chatgpt', 'ChatGPT MCP shorthand API'],

      // Discovery routes (need rewriting)
      ['/llms.txt', 'LLM discovery'],
      ['/.well-known/oauth-protected-resource', 'MCP OAuth resource metadata discovery'],
    ] as const

    it.each(appRoutes)('should intercept %s (%s)', (path) => {
      const willIntercept = matchesNextJsPattern(pattern, path)
      expect(
        willIntercept,
        `Proxy is NOT intercepting ${path} - subdomain routing may be broken!`
      ).toBe(true)
    })
  })

  it('matcher config is defined and has expected structure', () => {
    expect(config.matcher).toBeDefined()
    expect(Array.isArray(config.matcher)).toBe(true)
    expect(config.matcher.length).toBeGreaterThan(0)
    expect(config.matcher[0]).toContain('(?!')
  })
})

describe('Critical static files existence', () => {
  it('openapi.json exists and is valid', async () => {
    const fs = await import('fs/promises')
    const path = await import('path')

    const publicPath = path.resolve(__dirname, '../../apps/web/public/openapi.json')

    // File must exist
    const exists = await fs.access(publicPath).then(() => true).catch(() => false)
    expect(exists, 'CRITICAL: openapi.json missing from public folder!').toBe(true)

    // Must be valid JSON
    const content = await fs.readFile(publicPath, 'utf-8')
    let spec: any
    expect(() => {
      spec = JSON.parse(content)
    }, 'openapi.json is not valid JSON!').not.toThrow()

    // Must have required OpenAPI fields
    expect(spec.openapi, 'openapi.json missing "openapi" version field').toBeDefined()
    expect(spec.info, 'openapi.json missing "info" field').toBeDefined()
    expect(spec.info.title, 'openapi.json missing "info.title" field').toBeDefined()
    expect(spec.paths, 'openapi.json missing "paths" field').toBeDefined()

    // Should have actual endpoint definitions
    const pathCount = Object.keys(spec.paths).length
    expect(pathCount, 'openapi.json has no API paths defined').toBeGreaterThan(0)
  })

  it('openapi.pdf exists and looks like a PDF', async () => {
    const fs = await import('fs/promises')
    const path = await import('path')

    const publicPath = path.resolve(__dirname, '../../apps/web/public/openapi.pdf')

    const exists = await fs.access(publicPath).then(() => true).catch(() => false)
    expect(exists, 'CRITICAL: openapi.pdf missing from public folder!').toBe(true)

    const buffer = await fs.readFile(publicPath)
    expect(buffer.length, 'openapi.pdf is empty').toBeGreaterThan(20)
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-')
  })
})

describe('Proxy rewrite behavior', () => {
  it('rewrites well-known OAuth protected resource to MCP metadata endpoint', async () => {
    const request = new NextRequest('https://api.analog-research.org/.well-known/oauth-protected-resource', {
      headers: {
        host: 'api.analog-research.org',
      },
    })

    const response = await proxy(request)
    const rewrite = response.headers.get('x-middleware-rewrite')

    expect(rewrite).toContain('/api/v1/mcp/oauth-protected-resource')
  })

  it('rewrites /v1/mcp/chatgpt to /api/v1/mcp/chatgpt on API subdomain', async () => {
    const request = new NextRequest('https://api.analog-research.org/v1/mcp/chatgpt', {
      headers: {
        host: 'api.analog-research.org',
      },
    })

    const response = await proxy(request)
    const rewrite = response.headers.get('x-middleware-rewrite')

    expect(rewrite).toContain('/api/v1/mcp/chatgpt')
  })
})
