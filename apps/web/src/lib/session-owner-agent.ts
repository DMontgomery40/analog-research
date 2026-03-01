import type { SupabaseClient } from '@supabase/supabase-js'

export interface SessionOwnerAgent {
  userId: string
  humanId: string
  agentId: string
}

// Terminology: a Human Account Owner (logged-in dashboard user) may operate a ResearchAgent.
// This helper resolves the owner's ResearchAgent id via legacy naming (`agents.name = human_<human_id>`).
function ownerAgentName(humanId: string): string {
  return `human_${humanId}`
}

async function resolveByOwnerForeignKey(
  supabase: SupabaseClient<any>,
  humanId: string
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('agents')
    .select('id')
    .eq('owner_human_id', humanId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  return data
}

async function resolveByLegacyName(
  supabase: SupabaseClient<any>,
  humanId: string
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('agents')
    .select('id')
    .eq('name', ownerAgentName(humanId))
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  return data
}

async function backfillAgentOwnerHumanId(
  supabase: SupabaseClient<any>,
  agentId: string,
  humanId: string
): Promise<void> {
  await supabase
    .from('agents')
    .update({ owner_human_id: humanId })
    .eq('id', agentId)
    .is('owner_human_id', null)
}

export async function resolveSessionOwnerAgent(
  supabase: SupabaseClient<any>,
  userId: string
): Promise<SessionOwnerAgent | null> {
  const { data: human, error: humanError } = await supabase
    .from('humans')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  if (humanError || !human) {
    return null
  }

  const ownerAgentByFk = await resolveByOwnerForeignKey(supabase, human.id)
  if (ownerAgentByFk) {
    return {
      userId,
      humanId: human.id,
      agentId: ownerAgentByFk.id,
    }
  }

  const ownerAgentLegacy = await resolveByLegacyName(supabase, human.id)
  if (!ownerAgentLegacy) {
    return null
  }

  await backfillAgentOwnerHumanId(supabase, ownerAgentLegacy.id, human.id)

  return {
    userId,
    humanId: human.id,
    agentId: ownerAgentLegacy.id,
  }
}

export async function resolveOrCreateSessionOwnerAgent(
  supabase: SupabaseClient<any>,
  userId: string
): Promise<SessionOwnerAgent | null> {
  const { data: human, error: humanError } = await supabase
    .from('humans')
    .select('id, name')
    .eq('user_id', userId)
    .maybeSingle()

  if (humanError || !human) {
    return null
  }

  const ownerAgentByFk = await resolveByOwnerForeignKey(supabase, human.id)
  if (ownerAgentByFk) {
    return {
      userId,
      humanId: human.id,
      agentId: ownerAgentByFk.id,
    }
  }

  const ownerAgentLegacy = await resolveByLegacyName(supabase, human.id)
  if (ownerAgentLegacy) {
    await backfillAgentOwnerHumanId(supabase, ownerAgentLegacy.id, human.id)
    return {
      userId,
      humanId: human.id,
      agentId: ownerAgentLegacy.id,
    }
  }

  const { data: created, error: createError } = await supabase
    .from('agents')
    .insert({
      name: ownerAgentName(human.id),
      description: `ResearchAgent account for ${human.name}`,
      owner_human_id: human.id,
    })
    .select('id')
    .single()

  if (createError || !created) {
    return null
  }

  return {
    userId,
    humanId: human.id,
    agentId: created.id,
  }
}
