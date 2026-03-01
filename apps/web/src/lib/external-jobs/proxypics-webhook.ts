import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

import { createServiceClient } from '@/lib/supabase/server'
import { refreshExternalJob } from '@/lib/external-jobs/service'
import { acquireWebhookLock, type WebhookProvider } from '@/lib/webhook-idempotency'

function timingSafeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value.trim())
}

function findFirstKeyDeep(payload: unknown, key: string): unknown | null {
  const stack: unknown[] = [payload]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue

    if (Array.isArray(current)) {
      current.forEach((item) => stack.push(item))
      continue
    }

    if (typeof current === 'object') {
      for (const [k, v] of Object.entries(current as Record<string, unknown>)) {
        if (k === key) return v
        stack.push(v)
      }
    }
  }

  return null
}

function extractProxyPicsWebhookHints(payload: unknown): {
  eventName: string | null
  externalId: string | null
  photoRequestId: string | null
} {
  const eventNameRaw =
    (payload && typeof payload === 'object'
      ? ((payload as Record<string, unknown>).event_name ?? (payload as Record<string, unknown>).eventName)
      : null) ?? findFirstKeyDeep(payload, 'event_name')

  const externalIdRaw =
    (payload && typeof payload === 'object'
      ? ((payload as Record<string, unknown>).external_id ?? (payload as Record<string, unknown>).externalId)
      : null) ?? findFirstKeyDeep(payload, 'external_id')

  const photoRequestIdRaw =
    (payload && typeof payload === 'object'
      ? ((payload as Record<string, unknown>).photo_request_id ?? (payload as Record<string, unknown>).photoRequestId)
      : null) ?? findFirstKeyDeep(payload, 'photo_request_id')

  return {
    eventName: typeof eventNameRaw === 'string' ? eventNameRaw : null,
    externalId: typeof externalIdRaw === 'string' ? externalIdRaw : null,
    photoRequestId: (typeof photoRequestIdRaw === 'string' || typeof photoRequestIdRaw === 'number')
      ? String(photoRequestIdRaw)
      : null,
  }
}

export async function handleProxyPicsWebhook(params: {
  request: NextRequest
  env: 'live' | 'sandbox'
  expectedToken?: string
}) {
  const token = params.request.nextUrl.searchParams.get('token') || params.request.headers.get('x-webhook-token')
  const expected = (params.expectedToken || '').trim()

  if (!expected) {
    return NextResponse.json({ error: 'Missing ProxyPics webhook token configuration' }, { status: 503 })
  }

  if (!token || !timingSafeEqual(token, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rawBody = await params.request.text()
  const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex')

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const supabase = await createServiceClient()
  const providerId = `proxypics_${params.env}`

  const hints = extractProxyPicsWebhookHints(payload)
  const eventIdCandidate =
    (payload && typeof payload === 'object'
      ? ((payload as Record<string, unknown>).id ?? (payload as Record<string, unknown>).event_id)
      : null)

  const eventId = (typeof eventIdCandidate === 'string' && eventIdCandidate.trim()) ? eventIdCandidate.trim() : bodyHash

  const lockResult = await acquireWebhookLock(supabase, providerId as WebhookProvider, eventId)
  if (lockResult.action === 'skip_duplicate') {
    return NextResponse.json({ received: true, duplicate: true })
  }
  if (lockResult.action === 'error') {
    return NextResponse.json({ error: lockResult.message }, { status: lockResult.status })
  }
  // action === 'process' or 'retry' — continue processing

  try {
    let jobRow: { id: string; agent_id: string } | null = null

    if (hints.externalId && isUuid(hints.externalId)) {
      const { data, error } = await supabase
        .from('external_jobs')
        .select('id, agent_id')
        .eq('id', hints.externalId)
        .eq('provider', 'proxypics')
        .eq('provider_env', params.env)
        .maybeSingle()

      if (error) {
        throw new Error(error.message)
      }

      jobRow = data as { id: string; agent_id: string } | null
    }

    if (!jobRow && hints.photoRequestId) {
      const { data, error } = await supabase
        .from('external_jobs')
        .select('id, agent_id')
        .eq('provider', 'proxypics')
        .eq('provider_env', params.env)
        .eq('provider_job_id', hints.photoRequestId)
        .maybeSingle()

      if (error) {
        throw new Error(error.message)
      }

      jobRow = data as { id: string; agent_id: string } | null
    }

    if (jobRow) {
      await supabase.from('external_job_events').insert({
        job_id: jobRow.id,
        agent_id: jobRow.agent_id,
        provider: 'proxypics',
        provider_env: params.env,
        source: 'provider_webhook',
        event_name: hints.eventName || 'webhook',
        payload: payload as Record<string, unknown>,
      })

      // Refresh from provider (captures download URLs and status; creates notifications on status changes).
      await refreshExternalJob(supabase, {
        agentId: jobRow.agent_id,
        jobId: jobRow.id,
      })
    }

    await supabase
      .from('webhook_events')
      .update({
        status: 'processed',
        processed_at: new Date().toISOString(),
      })
      .eq('provider', providerId)
      .eq('event_id', eventId)

    return NextResponse.json({ received: true, matched: Boolean(jobRow) })
  } catch (error) {
    await supabase
      .from('webhook_events')
      .update({
        status: 'error',
        processed_at: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      })
      .eq('provider', providerId)
      .eq('event_id', eventId)

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Webhook processing failed' },
      { status: 500 }
    )
  }
}

