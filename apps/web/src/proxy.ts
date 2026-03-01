import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/session-gate'

const MAX_API_BODY_BYTES = 256 * 1024
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

const SUPABASE_URL = 'https://ensqpqbhdvbnsiuujeoj.supabase.co'

/**
 * Subdomain architecture:
 * - supabase.analog-research.org: Proxies directly to Supabase (auth, storage, realtime, etc.)
 * - api.analog-research.org: Only serves /api/v1/* endpoints, /, /llms.txt, /.well-known/llms.txt
 * - www/main domain: Serves the full Next.js web app (+ llms.txt discovery rewrites)
 */
function isSupabaseSubdomain(host: string | null): boolean {
  if (!host) return false
  return host.startsWith('supabase.')
}

function isApiSubdomain(host: string | null): boolean {
  if (!host) return false
  // Match api.analog-research.org, api.localhost, or any api.* subdomain
  return host.startsWith('api.')
}

function addApiNoIndexHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return response
}

export async function proxy(request: NextRequest) {
  const host = request.headers.get('host')
  const pathname = request.nextUrl.pathname
  const apiSubdomain = isApiSubdomain(host)

  const isApiPath = pathname.startsWith('/api/v1/') || pathname.startsWith('/v1/')
  if (isApiPath && BODY_METHODS.has(request.method.toUpperCase())) {
    const rawContentLength = request.headers.get('content-length')
    if (rawContentLength) {
      const contentLength = Number.parseInt(rawContentLength, 10)
      if (Number.isFinite(contentLength) && contentLength > MAX_API_BODY_BYTES) {
        return NextResponse.json(
          {
            success: false,
            error: `Request body too large. Maximum size is ${MAX_API_BODY_BYTES} bytes.`,
          },
          { status: 413 }
        )
      }
    }
  }

  // Handle Supabase subdomain - proxy all requests to Supabase
  if (isSupabaseSubdomain(host)) {
    const supabaseUrl = new URL(pathname + request.nextUrl.search, SUPABASE_URL)
    return NextResponse.rewrite(supabaseUrl)
  }

  // Serve llms.txt discovery paths on all hosts (main domain + api subdomain)
  if (pathname === '/llms.txt' || pathname === '/.well-known/llms.txt') {
    const url = request.nextUrl.clone()
    url.pathname = '/api/v1/llms.txt'
    const response = NextResponse.rewrite(url)
    return apiSubdomain ? addApiNoIndexHeaders(response) : response
  }

  // Serve MCP OAuth protected-resource metadata on all hosts.
  if (pathname === '/.well-known/oauth-protected-resource') {
    const url = request.nextUrl.clone()
    url.pathname = '/api/v1/mcp/oauth-protected-resource'
    return NextResponse.rewrite(url)
  }

  // Handle API subdomain routing
  if (apiSubdomain) {
    // Allow these paths on API subdomain:
    // - / (JSON welcome)
    // - /api/v1/* (all API endpoints)
    // - /v1/* (rewrite to /api/v1/*)
    // - /openapi.json, /openapi.pdf (static docs)

    if (pathname === '/') {
      // Rewrite root to API welcome endpoint
      const url = request.nextUrl.clone()
      url.pathname = '/api/v1/welcome'
      return addApiNoIndexHeaders(NextResponse.rewrite(url))
    }

    if (pathname === '/openapi.json' || pathname === '/openapi.pdf') {
      // Allow serving static OpenAPI docs from /public on the API subdomain.
      return addApiNoIndexHeaders(NextResponse.next())
    }

    if (pathname.startsWith('/v1/')) {
      // Rewrite /v1/* to /api/v1/* for convenience
      const url = request.nextUrl.clone()
      url.pathname = '/api' + pathname
      return addApiNoIndexHeaders(NextResponse.rewrite(url))
    }

    if (pathname.startsWith('/api/v1/')) {
      // Allow API routes through
      return addApiNoIndexHeaders(NextResponse.next())
    }

    // Block everything else on API subdomain (no pages, static assets, HTML)
    return addApiNoIndexHeaders(
      NextResponse.json(
        {
          success: false,
          error: 'Not found. This subdomain only serves the API.',
          docs: '/llms.txt',
          endpoints: '/v1/',
        },
        { status: 404 }
      )
    )
  }

  // Main domain: normal Next.js behavior with Supabase session handling
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - openapi.json, openapi.pdf (API docs)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|openapi\\.json|openapi\\.pdf|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
