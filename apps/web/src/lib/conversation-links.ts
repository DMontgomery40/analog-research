import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

export interface EnsureConversationLinkArgs {
  agentId: string
  humanId: string
  bookingId?: string | null
  bountyId?: string | null
}

export interface ConversationLinkRow {
  id: string
  agent_id: string
  human_id: string
  booking_id: string | null
  bounty_id: string | null
  created_at?: string
}

function isUniqueViolation(error: PostgrestError | null): boolean {
  return Boolean(error && error.code === '23505')
}

function toRow(data: unknown): ConversationLinkRow | null {
  if (!data || typeof data !== 'object') return null
  const row = data as Record<string, unknown>
  if (typeof row.id !== 'string') return null
  return row as unknown as ConversationLinkRow
}

async function findDirectConversation(
  supabase: SupabaseClient,
  agentId: string,
  humanId: string
): Promise<{ data: ConversationLinkRow | null; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('agent_id', agentId)
    .eq('human_id', humanId)
    .is('booking_id', null)
    .is('bounty_id', null)
    .order('created_at', { ascending: true })
    .limit(1)

  if (error) {
    return { data: null, error }
  }

  return {
    data: Array.isArray(data) && data.length > 0 ? toRow(data[0]) : null,
    error: null,
  }
}

async function findConversationByBooking(
  supabase: SupabaseClient,
  bookingId: string
): Promise<{ data: ConversationLinkRow | null; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true })
    .limit(1)

  if (error) {
    return { data: null, error }
  }

  return {
    data: Array.isArray(data) && data.length > 0 ? toRow(data[0]) : null,
    error: null,
  }
}

export async function ensureConversationLink(
  supabase: SupabaseClient,
  args: EnsureConversationLinkArgs
): Promise<{ data: ConversationLinkRow | null; error: PostgrestError | null }> {
  const bookingId = args.bookingId || null
  const bountyId = args.bountyId || null

  if (!bookingId) {
    const existing = await findDirectConversation(supabase, args.agentId, args.humanId)
    if (existing.error || existing.data) {
      return existing
    }

    const { data: inserted, error: insertError } = await supabase
      .from('conversations')
      .insert({
        agent_id: args.agentId,
        human_id: args.humanId,
        booking_id: null,
        bounty_id: null,
      })
      .select('*')
      .single()

    if (!insertError) {
      return { data: toRow(inserted), error: null }
    }

    if (isUniqueViolation(insertError)) {
      return findDirectConversation(supabase, args.agentId, args.humanId)
    }

    return { data: null, error: insertError }
  }

  const existingByBooking = await findConversationByBooking(supabase, bookingId)
  if (existingByBooking.error) {
    return existingByBooking
  }

  if (existingByBooking.data) {
    const row = existingByBooking.data
    const needsUpdate = row.agent_id !== args.agentId
      || row.human_id !== args.humanId
      || row.bounty_id !== bountyId

    if (!needsUpdate) {
      return existingByBooking
    }

    const { data: updated, error: updateError } = await supabase
      .from('conversations')
      .update({
        agent_id: args.agentId,
        human_id: args.humanId,
        bounty_id: bountyId,
      })
      .eq('id', row.id)
      .select('*')
      .single()

    if (!updateError) {
      return { data: toRow(updated), error: null }
    }

    return { data: null, error: updateError }
  }

  const { data: inserted, error: insertError } = await supabase
    .from('conversations')
    .insert({
      agent_id: args.agentId,
      human_id: args.humanId,
      booking_id: bookingId,
      bounty_id: bountyId,
    })
    .select('*')
    .single()

  if (!insertError) {
    return { data: toRow(inserted), error: null }
  }

  if (isUniqueViolation(insertError)) {
    return findConversationByBooking(supabase, bookingId)
  }

  return { data: null, error: insertError }
}
