import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { logger } from '@/lib/logger'
import { handleSingleResult } from '@/lib/supabase/errors'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const updatePayoutPreferencesSchema = z.object({
  paypal_waitlist: z.boolean().optional(),
  venmo_waitlist: z.boolean().optional(),
}).refine((input) => input.paypal_waitlist !== undefined || input.venmo_waitlist !== undefined, {
  message: 'At least one preference field is required',
  path: ['paypal_waitlist'],
})

async function requireAuthenticatedHuman() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, response: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) }

  const serviceClient = await createServiceClient()
  return {
    ok: true as const,
    user,
    serviceClient,
  }
}

export async function GET(_request: NextRequest) {
  const log = logger.withContext('api/v1/humans/me/payout-preferences/route.ts', 'GET')
  const auth = await requireAuthenticatedHuman()
  if (!auth.ok) return auth.response
  const { user, serviceClient } = auth

  const { data: humanData, error: humanError } = await serviceClient
    .from('humans')
    .select('id')
    .eq('user_id', user.id)
    .single()

  const humanResult = handleSingleResult(humanData, humanError, log, 'Human profile', { userId: user.id })
  if (humanResult.response) return humanResult.response

  const { data: preferences, error: preferencesError } = await serviceClient
    .from('human_payout_waitlist_preferences')
    .select('paypal_waitlist, venmo_waitlist')
    .eq('human_id', humanResult.data.id)
    .maybeSingle()

  if (preferencesError) {
    log.error(
      'Failed to load payout waitlist preferences',
      { humanId: humanResult.data.id },
      { message: preferencesError.message, code: preferencesError.code }
    )
    return NextResponse.json({ success: false, error: 'Failed to load payout preferences' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    data: {
      paypal_waitlist: preferences?.paypal_waitlist ?? false,
      venmo_waitlist: preferences?.venmo_waitlist ?? false,
    },
  })
}

export async function PATCH(request: NextRequest) {
  const log = logger.withContext('api/v1/humans/me/payout-preferences/route.ts', 'PATCH')
  const auth = await requireAuthenticatedHuman()
  if (!auth.ok) return auth.response
  const { user, serviceClient } = auth

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = updatePayoutPreferencesSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.flatten() }, { status: 400 })
  }

  const { data: humanData, error: humanError } = await serviceClient
    .from('humans')
    .select('id')
    .eq('user_id', user.id)
    .single()

  const humanResult = handleSingleResult(humanData, humanError, log, 'Human profile', { userId: user.id })
  if (humanResult.response) return humanResult.response
  const humanId = humanResult.data.id

  const { data: existingPreferences, error: existingPreferencesError } = await serviceClient
    .from('human_payout_waitlist_preferences')
    .select('paypal_waitlist, venmo_waitlist')
    .eq('human_id', humanId)
    .maybeSingle()

  if (existingPreferencesError) {
    log.error(
      'Failed to read existing payout waitlist preferences',
      { humanId },
      { message: existingPreferencesError.message, code: existingPreferencesError.code }
    )
    return NextResponse.json({ success: false, error: 'Failed to update payout preferences' }, { status: 500 })
  }

  const paypalWaitlist = parsed.data.paypal_waitlist ?? existingPreferences?.paypal_waitlist ?? false
  const venmoWaitlist = parsed.data.venmo_waitlist ?? existingPreferences?.venmo_waitlist ?? false

  const { data: updatedPreferences, error: updateError } = await serviceClient
    .from('human_payout_waitlist_preferences')
    .upsert({
      human_id: humanId,
      paypal_waitlist: paypalWaitlist,
      venmo_waitlist: venmoWaitlist,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'human_id',
    })
    .select('paypal_waitlist, venmo_waitlist')
    .single()

  if (updateError || !updatedPreferences) {
    log.error(
      'Failed to update payout waitlist preferences',
      { humanId },
      updateError ? { message: updateError.message, code: updateError.code } : { message: 'No data returned' }
    )
    return NextResponse.json({ success: false, error: 'Failed to update payout preferences' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    data: {
      paypal_waitlist: updatedPreferences.paypal_waitlist,
      venmo_waitlist: updatedPreferences.venmo_waitlist,
    },
  })
}
