import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'

export type BookingPaymentMethod = 'stripe' | 'crypto'

interface EnsureBookingSettlementRecordsInput {
  bookingId: string
  agentId: string
  humanId: string
  amount: number
  platformFee: number
  payerAmount: number
  currency: string
  paymentMethod: BookingPaymentMethod
  cryptoTxHash?: string | null
  escrowReleaseDescription?: string
  platformFeeDescription?: string
}

interface EnsureBookingSettlementRecordsResult {
  insertedEscrowRelease: boolean
  insertedPlatformFee: boolean
}

export async function ensureBookingSettlementRecords(
  supabase: SupabaseClient<any>,
  input: EnsureBookingSettlementRecordsInput
): Promise<EnsureBookingSettlementRecordsResult> {
  const log = logger.withContext('lib/booking-settlement.ts', 'ensureBookingSettlementRecords')

  const { data, error } = await supabase.rpc('ensure_booking_settlement_records_v2', {
    p_booking_id: input.bookingId,
    p_agent_id: input.agentId,
    p_human_id: input.humanId,
    p_amount: input.amount,
    p_platform_fee: input.platformFee,
    p_currency: input.currency,
    p_payment_method: input.paymentMethod,
    p_payer_amount: input.payerAmount,
    p_crypto_tx_hash: input.cryptoTxHash || null,
    p_escrow_release_description: input.escrowReleaseDescription || null,
    p_platform_fee_description: input.platformFeeDescription || null,
  })

  if (error) {
    log.error('Settlement RPC failed', { bookingId: input.bookingId }, { message: error.message, code: error.code })
    throw new Error(`Settlement RPC failed: ${error.message}`)
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object') {
    log.error('Settlement RPC returned unexpected data', { bookingId: input.bookingId, dataType: typeof row })
    throw new Error('Settlement RPC returned unexpected data')
  }

  const insertedEscrowRelease = Boolean((row as any).inserted_escrow_release)
  const insertedPlatformFee = Boolean((row as any).inserted_platform_fee)

  return { insertedEscrowRelease, insertedPlatformFee }
}
