import { describe, expect, it } from 'vitest'

import { ensureBookingSettlementRecords } from '@/lib/booking-settlement'

describe('booking settlement (RPC)', () => {
  it('maps RPC result to booleans', async () => {
    const calls: Array<{ fn: string; args: unknown }> = []

    const supabase = {
      rpc: async (fn: string, args: unknown) => {
        calls.push({ fn, args })
        return {
          data: [{ inserted_escrow_release: true, inserted_platform_fee: false }],
          error: null,
        }
      },
    }

    const result = await ensureBookingSettlementRecords(supabase as never, {
      bookingId: '00000000-0000-0000-0000-000000000001',
      agentId: '00000000-0000-0000-0000-000000000002',
      humanId: '00000000-0000-0000-0000-000000000003',
      amount: 10000,
      platformFee: 300,
      payerAmount: 10492,
      currency: 'USD',
      paymentMethod: 'stripe',
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]?.fn).toBe('ensure_booking_settlement_records_v2')
    expect(calls[0]?.args).toEqual(expect.objectContaining({ p_payer_amount: 10492 }))
    expect(result).toEqual({
      insertedEscrowRelease: true,
      insertedPlatformFee: false,
    })
  })

  it('throws when RPC returns an error', async () => {
    const supabase = {
      rpc: async () => ({
        data: null,
        error: { message: 'boom', code: 'XX000' },
      }),
    }

    await expect(
      ensureBookingSettlementRecords(supabase as never, {
        bookingId: '00000000-0000-0000-0000-000000000001',
        agentId: '00000000-0000-0000-0000-000000000002',
        humanId: '00000000-0000-0000-0000-000000000003',
        amount: 10000,
        platformFee: 300,
        payerAmount: 10492,
        currency: 'USD',
        paymentMethod: 'stripe',
      })
    ).rejects.toThrow('Settlement RPC failed')
  })

  it('throws when RPC returns unexpected data', async () => {
    const supabase = {
      rpc: async () => ({
        data: null,
        error: null,
      }),
    }

    await expect(
      ensureBookingSettlementRecords(supabase as never, {
        bookingId: '00000000-0000-0000-0000-000000000001',
        agentId: '00000000-0000-0000-0000-000000000002',
        humanId: '00000000-0000-0000-0000-000000000003',
        amount: 10000,
        platformFee: 300,
        payerAmount: 10492,
        currency: 'USD',
        paymentMethod: 'stripe',
      })
    ).rejects.toThrow('unexpected data')
  })
})
