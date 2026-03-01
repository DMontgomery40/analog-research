import type { SupabaseClient } from '@supabase/supabase-js'

export type WebhookProvider =
  | 'stripe'
  | 'stripe_connect'
  | 'coinbase'
  | 'proxypics_live'
  | 'proxypics_sandbox'

export type WebhookLockResult =
  | { action: 'process' }
  | { action: 'skip_duplicate' }
  | { action: 'retry' }
  | { action: 'error'; status: number; message: string }

/**
 * Attempt to acquire a webhook processing lock via the webhook_events table.
 *
 * - First attempt: INSERT a new row with status 'processing'.
 * - On duplicate (23505): check the existing row's status.
 *   - 'processed' → skip (idempotent success)
 *   - 'error'     → reset to 'processing' and allow retry
 *   - 'processing' → skip (another handler is working on it)
 */
export async function acquireWebhookLock(
  supabase: SupabaseClient,
  provider: WebhookProvider,
  eventId: string
): Promise<WebhookLockResult> {
  const { error: insertError } = await supabase.from('webhook_events').insert({
    provider,
    event_id: eventId,
    status: 'processing',
  })

  if (!insertError) {
    return { action: 'process' }
  }

  if (insertError.code !== '23505') {
    return {
      action: 'error',
      status: 500,
      message: `Failed to persist webhook event: ${insertError.message}`,
    }
  }

  // Duplicate key — check previous attempt's status.
  const { data: existing, error: fetchError } = await supabase
    .from('webhook_events')
    .select('status')
    .eq('provider', provider)
    .eq('event_id', eventId)
    .single()

  if (fetchError || !existing) {
    return {
      action: 'error',
      status: 500,
      message: 'Failed to fetch existing webhook event for retry check',
    }
  }

  if (existing.status === 'processed') {
    return { action: 'skip_duplicate' }
  }

  if (existing.status === 'error') {
    // Compare-and-swap error -> processing. Only retry if we actually acquired it.
    const { data: updatedEvent, error: updateError } = await supabase
      .from('webhook_events')
      .update({ status: 'processing', error: null })
      .eq('provider', provider)
      .eq('event_id', eventId)
      .eq('status', 'error')
      .select('status')
      .maybeSingle()

    if (updateError) {
      return {
        action: 'error',
        status: 500,
        message: 'Failed to reset webhook event for retry',
      }
    }

    if (!updatedEvent) {
      // Another worker won the retry lock.
      return { action: 'skip_duplicate' }
    }

    return { action: 'retry' }
  }

  // Status is 'processing' — another handler is concurrently working on it.
  return { action: 'skip_duplicate' }
}
