import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { handleSingleResult } from '@/lib/supabase/errors'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const log = logger.withContext('api/v1/bounties/[id]/capacity/route.ts', 'GET')
  const { id } = await params
  const supabase = await createServiceClient()

  const { data: bountyData, error } = await supabase
    .from('bounties')
    .select('id, status, spots_available, spots_filled')
    .eq('id', id)
    .single()

  const bountyResult = handleSingleResult(bountyData, error, log, 'Bounty', { bountyId: id })
  if (bountyResult.response) return bountyResult.response
  const bounty = bountyResult.data

  const spotsRemaining = Math.max(bounty.spots_available - bounty.spots_filled, 0)

  return NextResponse.json({
    success: true,
    data: {
      bounty_id: bounty.id,
      status: bounty.status,
      spots_available: bounty.spots_available,
      spots_filled: bounty.spots_filled,
      spots_remaining: spotsRemaining,
      is_full: spotsRemaining === 0,
    },
  })
}
