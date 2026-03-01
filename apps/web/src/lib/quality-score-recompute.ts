import type { SupabaseClient } from '@supabase/supabase-js'

function isMissingFunctionError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42883') return true
  return (error.message || '').toLowerCase().includes('does not exist')
}

export async function recomputeQualityForBountyBestEffort(
  supabase: SupabaseClient<any>,
  bountyId: string | null | undefined
) {
  if (!bountyId) return

  const { error } = await supabase.rpc('recompute_quality_scores_for_bounty_v1', {
    p_bounty_id: bountyId,
  })

  if (!error || isMissingFunctionError(error)) {
    return
  }

  console.error('Failed to recompute quality scores for bounty', bountyId, error)
}
