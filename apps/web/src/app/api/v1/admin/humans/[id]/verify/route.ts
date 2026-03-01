import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/admin-auth'
import { logAdminAction } from '@/lib/admin/audit'
import { logger } from '@/lib/logger'
import { handleSingleResult } from '@/lib/supabase/errors'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const log = logger.withContext('api/v1/admin/humans/[id]/verify/route.ts', 'POST')
  const admin = await requireAdmin()
  if (!admin.ok || !admin.email || !admin.userId) {
    return NextResponse.json({ success: false, error: admin.error }, { status: admin.status })
  }

  const { id } = await params
  const supabase = await createServiceClient()

  // Get current state before update
  const { data: beforeData, error: fetchError } = await supabase
    .from('humans')
    .select('id, name, is_verified, verified_at')
    .eq('id', id)
    .single()

  const beforeResult = handleSingleResult(beforeData, fetchError, log, 'Human', { humanId: id })
  if (beforeResult.response) return beforeResult.response
  const before = beforeResult.data

  if (before.is_verified) {
    return NextResponse.json(
      { success: false, error: 'Human is already verified' },
      { status: 400 }
    )
  }

  // Update to verified
  const { data: after, error: updateError } = await supabase
    .from('humans')
    .update({
      is_verified: true,
      verified_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, name, is_verified, verified_at')
    .single()

  if (updateError) {
    log.error('Failed to verify human', { humanId: id }, { message: updateError.message, code: updateError.code })
    return NextResponse.json({ success: false, error: updateError.message }, { status: 500 })
  }

  // Log the admin action
  await logAdminAction({
    action: 'human.verify',
    adminEmail: admin.email,
    adminUserId: admin.userId,
    targetType: 'human',
    targetId: id,
    beforeState: { is_verified: before.is_verified, verified_at: before.verified_at },
    afterState: { is_verified: after.is_verified, verified_at: after.verified_at },
  })

  return NextResponse.json({
    success: true,
    data: after,
    message: `${after.name} has been verified`,
  })
}
