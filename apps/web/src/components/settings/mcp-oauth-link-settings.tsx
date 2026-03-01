'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link as LinkIcon, Loader2, RotateCcw, Shield, Unlink } from 'lucide-react'
import { useSearchParams } from 'next/navigation'

type LinkStatusResponse = {
  linked: boolean
  provider: string
  issuer?: string
  subject?: string
  scopes_granted?: string[]
  created_at?: string
  updated_at?: string
  last_used_at?: string | null
}

function formatDate(value?: string | null): string {
  if (!value) return 'Never'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Unknown'
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatReason(reason: string | null): string {
  if (!reason) return 'OAuth callback failed'
  return reason
    .replace(/\+/g, ' ')
    .replace(/_/g, ' ')
    .trim()
}

export function McpOauthLinkSettings() {
  const searchParams = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<LinkStatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const callbackState = searchParams.get('mcp_oauth')
  const callbackReason = searchParams.get('mcp_oauth_reason')

  const callbackBanner = useMemo(() => {
    if (!callbackState) return null
    if (callbackState === 'linked') {
      return {
        kind: 'success' as const,
        message: 'ChatGPT OAuth link connected.',
      }
    }
    if (callbackState === 'error') {
      return {
        kind: 'error' as const,
        message: formatReason(callbackReason),
      }
    }
    return null
  }, [callbackReason, callbackState])

  const loadStatus = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/v1/mcp/oauth/link')
      const payload = await response.json()
      if (!response.ok || !payload.success) {
        setError(payload.error || 'Failed to load ChatGPT OAuth link status')
        setStatus(null)
        return
      }
      setStatus(payload.data as LinkStatusResponse)
    } catch {
      setError('Failed to load ChatGPT OAuth link status')
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  const startLinkFlow = async () => {
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch('/api/v1/mcp/oauth/link/start', {
        method: 'POST',
      })
      const payload = await response.json()
      if (!response.ok || !payload.success) {
        setError(payload.error || 'Failed to start OAuth link flow')
        return
      }

      const authorizeUrl = payload?.data?.authorize_url
      if (typeof authorizeUrl !== 'string' || !authorizeUrl) {
        setError('OAuth authorize URL missing from start response')
        return
      }

      window.location.assign(authorizeUrl)
    } catch {
      setError('Failed to start OAuth link flow')
    } finally {
      setBusy(false)
    }
  }

  const unlink = async () => {
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch('/api/v1/mcp/oauth/link', {
        method: 'DELETE',
      })
      const payload = await response.json()
      if (!response.ok || !payload.success) {
        setError(payload.error || 'Failed to unlink ChatGPT OAuth identity')
        return
      }

      const revoked = Number(payload?.data?.revoked || 0)
      setSuccess(revoked > 0 ? 'OAuth link revoked.' : 'No active OAuth link was present.')
      await loadStatus()
    } catch {
      setError('Failed to unlink ChatGPT OAuth identity')
    } finally {
      setBusy(false)
    }
  }

  const linked = Boolean(status?.linked)

  return (
    <div className="bg-card border border-border rounded-xl p-6 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
          <Shield className="w-5 h-5 text-cyan-600" />
        </div>
        <div>
          <h2 className="font-semibold">ChatGPT App OAuth Link</h2>
          <p className="text-sm text-muted-foreground">
            Link your dashboard owner ResearchAgent to ChatGPT OAuth for private Developer Mode access.
          </p>
        </div>
      </div>

      <div className="p-4 bg-muted/50 rounded-lg mb-4 text-sm text-muted-foreground">
        API keys remain valid for MCP and REST. OAuth linking is additive for ChatGPT App authentication.
      </div>

      {callbackBanner?.kind === 'success' && (
        <div className="mb-4 p-3 text-sm rounded-md border border-green-500/30 bg-green-500/10 text-green-600">
          {callbackBanner.message}
        </div>
      )}

      {callbackBanner?.kind === 'error' && (
        <div className="mb-4 p-3 text-sm rounded-md border border-destructive/30 bg-destructive/10 text-destructive">
          {callbackBanner.message}
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 text-sm rounded-md border border-destructive/30 bg-destructive/10 text-destructive">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 text-sm rounded-md border border-green-500/30 bg-green-500/10 text-green-600">
          {success}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="mb-4 p-4 border border-border rounded-lg bg-background">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Link status</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${linked ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'}`}>
                {linked ? 'Linked' : 'Not linked'}
              </span>
            </div>

            <div className="mt-3 space-y-1 text-sm">
              <div><span className="text-muted-foreground">Provider:</span> <span className="font-medium">{status?.provider || 'auth0'}</span></div>
              {linked && (
                <>
                  <div><span className="text-muted-foreground">Issuer:</span> <code className="bg-muted px-1 rounded">{status?.issuer}</code></div>
                  <div><span className="text-muted-foreground">Subject:</span> <code className="bg-muted px-1 rounded">{status?.subject}</code></div>
                  <div><span className="text-muted-foreground">Scopes:</span> {(status?.scopes_granted || []).join(', ') || 'None'}</div>
                  <div><span className="text-muted-foreground">Last used:</span> {formatDate(status?.last_used_at)}</div>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={startLinkFlow}
              disabled={busy}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : linked ? <RotateCcw className="w-4 h-4" /> : <LinkIcon className="w-4 h-4" />}
              {linked ? 'Relink in Auth0' : 'Link in Auth0'}
            </button>

            {linked && (
              <button
                onClick={unlink}
                disabled={busy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-border font-medium hover:bg-accent disabled:opacity-50"
              >
                <Unlink className="w-4 h-4" />
                Unlink
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
