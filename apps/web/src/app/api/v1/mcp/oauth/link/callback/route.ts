import { NextRequest, NextResponse } from 'next/server'

import { resolveCanonicalAppOrigin } from '@/lib/app-origin'
import { logger } from '@/lib/logger'
import { exchangeCodeForTokens, getMcpOauthLinkConfig } from '@/lib/mcp/oauth-link'
import { verifyMcpOAuthToken } from '@/lib/mcp/oauth-auth'
import { createServiceClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

function settingsRedirect(origin: string, status: string, reason?: string): URL {
  const url = new URL('/dashboard/settings', resolveCanonicalAppOrigin(origin))
  url.searchParams.set('mcp_oauth', status)
  if (reason) {
    url.searchParams.set('mcp_oauth_reason', reason)
  }
  return url
}

function mergeScopes(...values: string[][]): string[] {
  return Array.from(new Set(values.flat().map((value) => value.trim()).filter(Boolean)))
}

export async function GET(request: NextRequest) {
  const log = logger.withContext('api/v1/mcp/oauth/link/callback/route.ts', 'GET')
  const config = getMcpOauthLinkConfig(request.nextUrl.origin)

  if (!config) {
    return NextResponse.redirect(settingsRedirect(request.nextUrl.origin, 'error', 'oauth_not_configured'))
  }

  const error = request.nextUrl.searchParams.get('error')
  const errorDescription = request.nextUrl.searchParams.get('error_description')

  if (error) {
    const reason = errorDescription || error
    return NextResponse.redirect(settingsRedirect(request.nextUrl.origin, 'error', reason))
  }

  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')

  if (!code || !state) {
    return NextResponse.redirect(settingsRedirect(request.nextUrl.origin, 'error', 'missing_code_or_state'))
  }

  const serviceClient = await createServiceClient()

  const { data: linkState, error: stateError } = await serviceClient
    .from('mcp_oauth_link_states')
    .select('id, provider, owner_human_id, agent_id, expires_at, consumed_at')
    .eq('state', state)
    .eq('provider', config.provider)
    .maybeSingle()

  if (stateError) {
    log.error('Failed to load link state', { state }, { message: stateError.message, code: stateError.code })
    return NextResponse.redirect(settingsRedirect(request.nextUrl.origin, 'error', 'state_lookup_failed'))
  }

  if (!linkState) {
    return NextResponse.redirect(settingsRedirect(request.nextUrl.origin, 'error', 'invalid_state'))
  }

  if (linkState.consumed_at) {
    return NextResponse.redirect(settingsRedirect(request.nextUrl.origin, 'error', 'state_already_used'))
  }

  if (new Date(linkState.expires_at).getTime() < Date.now()) {
    return NextResponse.redirect(settingsRedirect(request.nextUrl.origin, 'error', 'state_expired'))
  }

  try {
    const tokenResult = await exchangeCodeForTokens(config, code)
    const verified = await verifyMcpOAuthToken(tokenResult.accessToken, {
      originHint: request.nextUrl.origin,
      expectedAudience: config.audience || undefined,
    })

    if (!verified) {
      return NextResponse.redirect(settingsRedirect(request.nextUrl.origin, 'error', 'invalid_access_token'))
    }

    const scopesGranted = mergeScopes(tokenResult.scope, verified.scopes)
    const now = new Date().toISOString()

    const { error: upsertError } = await serviceClient
      .from('mcp_oauth_identities')
      .upsert({
        provider: config.provider,
        issuer: verified.issuer,
        subject: verified.subject,
        owner_human_id: linkState.owner_human_id,
        agent_id: linkState.agent_id,
        scopes_granted: scopesGranted,
        metadata: {
          token_type: tokenResult.tokenType,
          expires_in: tokenResult.expiresIn,
          linked_via: 'dashboard',
        },
        revoked_at: null,
        last_used_at: now,
      }, {
        onConflict: 'provider,issuer,subject',
      })

    if (upsertError) {
      log.error('Failed to upsert OAuth identity', { provider: config.provider }, { message: upsertError.message, code: upsertError.code })
      return NextResponse.redirect(settingsRedirect(request.nextUrl.origin, 'error', 'identity_upsert_failed'))
    }

    const { error: consumeError } = await serviceClient
      .from('mcp_oauth_link_states')
      .update({ consumed_at: now })
      .eq('id', linkState.id)

    if (consumeError) {
      log.warn('Failed to mark OAuth link state as consumed', { linkStateId: linkState.id, error: consumeError.message })
    }

    return NextResponse.redirect(settingsRedirect(request.nextUrl.origin, 'linked'))
  } catch (callbackError) {
    const message = callbackError instanceof Error ? callbackError.message : 'oauth_callback_failed'
    log.error('OAuth callback failed', { message })
    return NextResponse.redirect(settingsRedirect(request.nextUrl.origin, 'error', message))
  }
}
