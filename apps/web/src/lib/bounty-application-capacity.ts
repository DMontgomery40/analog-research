export type AcceptCapacityResult = {
  accepted: boolean
  reason: string
  bounty_id: string
  application_id: string
  human_id: string
  proposed_rate: number
  estimated_hours: number | null
  bounty_title: string
  bounty_currency: string
  pricing_mode: 'bid' | 'fixed_per_spot'
  fixed_spot_amount: number | null
  spots_available: number
  spots_filled: number
  spots_remaining: number
  bounty_status: 'open' | 'in_progress' | 'completed' | 'cancelled'
  application_status: 'pending' | 'accepted' | 'rejected' | 'withdrawn'
}

export function mapAcceptError(reason: string): { status: number; error: string } {
  switch (reason) {
    case 'bounty_not_found':
    case 'application_not_found':
      return { status: 404, error: 'Application or bounty not found' }
    case 'forbidden':
      return { status: 403, error: 'Forbidden' }
    case 'bounty_not_open':
      return { status: 409, error: 'Bounty is not open for more acceptances' }
    case 'bounty_full':
      return { status: 409, error: 'All bounty spots are already filled' }
    case 'application_not_pending':
      return { status: 409, error: 'Application is not pending' }
    default:
      return { status: 409, error: 'Could not accept application' }
  }
}
