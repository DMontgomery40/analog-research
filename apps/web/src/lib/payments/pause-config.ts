import { createServiceClient } from '@/lib/supabase/server'

export interface PaymentsPauseConfig {
  paymentsPaused: boolean
  pauseReason: string | null
  pausedAt: string | null
  resumedAt: string | null
  updatedBy: string | null
  updatedAt: string | null
}

const DEFAULTS: PaymentsPauseConfig = {
  paymentsPaused: false,
  pauseReason: null,
  pausedAt: null,
  resumedAt: null,
  updatedBy: null,
  updatedAt: null,
}

function rowToConfig(row: Record<string, unknown>): PaymentsPauseConfig {
  return {
    paymentsPaused: Boolean(row.payments_paused),
    pauseReason: (row.pause_reason as string) || null,
    pausedAt: (row.paused_at as string) || null,
    resumedAt: (row.resumed_at as string) || null,
    updatedBy: (row.updated_by as string) || null,
    updatedAt: (row.updated_at as string) || null,
  }
}

/**
 * Read the current payments pause config from Supabase.
 * Falls back to env vars if the DB row is missing or on error.
 */
export async function getPaymentsPauseConfig(
  serviceClient?: Awaited<ReturnType<typeof createServiceClient>>,
): Promise<PaymentsPauseConfig> {
  const supabase = serviceClient || await createServiceClient()

  const { data: row, error } = await supabase
    .from('payments_runtime_config')
    .select('*')
    .eq('id', 1)
    .maybeSingle()

  if (error || !row) {
    // Fall back to env vars when DB row is unavailable.
    const envPaused =
      process.env.DISABLE_ESCROW_FUNDING === 'true' ||
      process.env.DISABLE_BOOKING_COMPLETION === 'true'

    return {
      ...DEFAULTS,
      paymentsPaused: envPaused,
    }
  }

  return rowToConfig(row)
}

/**
 * Convenience check: are payments currently paused?
 *
 * Returns true if EITHER:
 * - The DB flag payments_paused is true, OR
 * - The legacy env vars DISABLE_ESCROW_FUNDING / DISABLE_BOOKING_COMPLETION are set.
 *
 * This means the admin toggle is additive — flipping the DB flag pauses payments,
 * but env vars still work as an emergency fallback (e.g. Netlify dashboard).
 */
export async function isPaymentsPaused(
  serviceClient?: Awaited<ReturnType<typeof createServiceClient>>,
): Promise<{ paused: boolean; reason: string | null }> {
  const config = await getPaymentsPauseConfig(serviceClient)

  if (config.paymentsPaused) {
    return {
      paused: true,
      reason: config.pauseReason || 'Payments are temporarily paused while we upgrade infrastructure.',
    }
  }

  // Check legacy env vars as fallback.
  const envPaused =
    process.env.DISABLE_ESCROW_FUNDING === 'true' ||
    process.env.DISABLE_BOOKING_COMPLETION === 'true'

  if (envPaused) {
    return {
      paused: true,
      reason: (process.env.ESCROW_PAUSE_MESSAGE || '').trim() ||
        'Payments are temporarily paused while we upgrade infrastructure.',
    }
  }

  return { paused: false, reason: null }
}

/**
 * Update the payments pause config in Supabase.
 */
export async function updatePaymentsPauseConfig(
  updates: { paymentsPaused: boolean; pauseReason?: string | null },
  updatedBy: string,
  serviceClient?: Awaited<ReturnType<typeof createServiceClient>>,
): Promise<PaymentsPauseConfig> {
  const supabase = serviceClient || await createServiceClient()

  const now = new Date().toISOString()

  const upsertData: Record<string, unknown> = {
    id: 1,
    payments_paused: updates.paymentsPaused,
    pause_reason: updates.paymentsPaused ? (updates.pauseReason ?? null) : null,
    updated_by: updatedBy,
  }

  // Track when pause/resume happened.
  if (updates.paymentsPaused) {
    upsertData.paused_at = now
  } else {
    upsertData.resumed_at = now
  }

  const { data: row, error } = await supabase
    .from('payments_runtime_config')
    .upsert(upsertData)
    .eq('id', 1)
    .select('*')
    .single()

  if (error || !row) {
    // Return best-effort state even on error.
    return {
      paymentsPaused: updates.paymentsPaused,
      pauseReason: updates.paymentsPaused ? (updates.pauseReason ?? null) : null,
      pausedAt: updates.paymentsPaused ? now : null,
      resumedAt: updates.paymentsPaused ? null : now,
      updatedBy,
      updatedAt: now,
    }
  }

  return rowToConfig(row)
}
