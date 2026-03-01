import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { handleSingleResult, type LoggerLike } from '@/lib/supabase/errors'

/**
 * Result of requireHumanSession - either authenticated or error response
 */
export type HumanSessionResult =
  | { ok: true; user: { id: string }; human: { id: string }; supabase: SupabaseClient }
  | { ok: false; response: NextResponse }

/**
 * Result of getHumanForUser - either human found or error response
 */
export type HumanProfileResult =
  | { ok: true; human: { id: string } }
  | { ok: false; response: NextResponse }

/**
 * Require authenticated session and human profile.
 * Combines auth check + human profile lookup into a single call.
 */
export async function requireHumanSession(
  log: LoggerLike
): Promise<HumanSessionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const { data: humanData, error: humanError } = await supabase
    .from('humans')
    .select('id')
    .eq('user_id', user.id)
    .single()

  const humanResult = handleSingleResult(humanData, humanError, log, 'Human profile', { userId: user.id })
  if (humanResult.response) {
    return { ok: false, response: humanResult.response }
  }

  return {
    ok: true,
    user: { id: user.id },
    human: { id: humanResult.data.id },
    supabase,
  }
}

/**
 * Get human profile for an already-authenticated user.
 * Use this for mixed-auth endpoints that support both agent API auth and human session auth.
 */
export async function getHumanForUser(
  supabase: SupabaseClient,
  log: LoggerLike,
  userId: string
): Promise<HumanProfileResult> {
  const { data: humanData, error: humanError } = await supabase
    .from('humans')
    .select('id')
    .eq('user_id', userId)
    .single()

  const humanResult = handleSingleResult(humanData, humanError, log, 'Human profile', { userId })
  if (humanResult.response) {
    return { ok: false, response: humanResult.response }
  }

  return { ok: true, human: { id: humanResult.data.id } }
}
