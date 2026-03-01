import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { handleSingleResult } from '@/lib/supabase/errors'
import { resolveSessionOwnerAgent } from '@/lib/session-owner-agent'

export const runtime = 'nodejs'

interface RouteParams {
  params: Promise<{ id: string }>
}

// DELETE /api/v1/keys/[id] - Revoke an API key
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const log = logger.withContext('api/v1/keys/[id]/route.ts', 'DELETE')

  try {
    const { id } = await params

    // Require human auth (session-based)
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const serviceClient = await createServiceClient()

    const ownerAgent = await resolveSessionOwnerAgent(serviceClient, user.id)
    if (!ownerAgent) {
      return NextResponse.json({ success: false, error: 'Agent account not found' }, { status: 404 })
    }

    // Verify the key belongs to this agent and revoke it
    const { data: keyData, error: fetchError } = await serviceClient
      .from('api_keys')
      .select('id, agent_id')
      .eq('id', id)
      .single()

    const keyResult = handleSingleResult(keyData, fetchError, log, 'API key', { keyId: id })
    if (keyResult.response) return keyResult.response
    const key = keyResult.data

    if (key.agent_id !== ownerAgent.agentId) {
      log.warn('Unauthorized to revoke key', { userId: user.id, keyId: id, agentId: ownerAgent.agentId })
      return NextResponse.json(
        { success: false, error: 'Unauthorized to revoke this key' },
        { status: 403 }
      )
    }

    // Revoke the key by setting is_active = false
    const { error: updateError } = await serviceClient
      .from('api_keys')
      .update({ is_active: false })
      .eq('id', id)

    if (updateError) {
      log.error('Error revoking API key', { keyId: id }, { message: updateError.message, code: updateError.code })
      return NextResponse.json(
        { success: false, error: 'Failed to revoke API key' },
        { status: 500 }
      )
    }

    log.info('API key revoked', { keyId: id, agentId: ownerAgent.agentId })
    return NextResponse.json({
      success: true,
      data: { id, revoked: true }
    })
  } catch (error) {
    log.error('Unexpected error', {}, error instanceof Error ? error : { message: String(error) })
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
