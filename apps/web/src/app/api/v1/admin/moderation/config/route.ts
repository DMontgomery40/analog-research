import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireModerationAdmin } from '@/lib/moderation/admin-auth'
import { getModerationRuntimeConfig, updateModerationRuntimeConfig } from '@/lib/moderation'
import { logAdminAction } from '@/lib/admin/audit'
import { parseZodJsonBody } from '@/lib/request-body'
import { z } from 'zod'

const updateSchema = z.object({
  provider: z.enum(['openrouter']).optional(),
  modelPrimary: z.string().min(1).max(200).optional(),
  modelEscalation: z.string().min(1).max(200).optional(),
  timeoutMs: z.number().int().min(250).max(10000).optional(),
  failConfidence: z.number().min(0.5).max(1).optional(),
  warnConfidence: z.number().min(0.1).max(1).optional(),
  maxInputChars: z.number().int().min(200).max(50000).optional(),
  dailyTokenBudget: z.number().int().min(1000).max(1_000_000_000).optional(),
  policyVersion: z.string().min(1).max(100).optional(),
})

export async function GET() {
  const admin = await requireModerationAdmin()
  if (!admin.ok) {
    return NextResponse.json({ success: false, error: admin.error }, { status: admin.status })
  }

  const supabase = await createServiceClient()
  const config = await getModerationRuntimeConfig(supabase)

  return NextResponse.json({ success: true, data: config })
}

export async function PATCH(request: NextRequest) {
  const admin = await requireModerationAdmin()
  if (!admin.ok) {
    return NextResponse.json({ success: false, error: admin.error }, { status: admin.status })
  }

  const parsed = await parseZodJsonBody(request, updateSchema)
  if (!parsed.ok) return parsed.response
  const updates = parsed.data

  const supabase = await createServiceClient()
  const before = await getModerationRuntimeConfig(supabase)

  const effectiveFailConfidence = updates.failConfidence ?? before.failConfidence
  const effectiveWarnConfidence = updates.warnConfidence ?? before.warnConfidence

  if (
    effectiveFailConfidence !== undefined
    && effectiveWarnConfidence !== undefined
    && effectiveFailConfidence < effectiveWarnConfidence
  ) {
    return NextResponse.json({
      success: false,
      error: 'failConfidence must be greater than or equal to warnConfidence',
    }, { status: 400 })
  }

  const data = await updateModerationRuntimeConfig(updates, admin.email || 'admin', supabase)

  if (admin.email && admin.userId) {
    const beforeState: Record<string, unknown> = { ...before }
    const afterState: Record<string, unknown> = { ...data }

    try {
      await logAdminAction({
        action: 'moderation.update_config',
        adminEmail: admin.email,
        adminUserId: admin.userId,
        targetType: 'config',
        targetId: 'config',
        beforeState,
        afterState,
      })
    } catch (error) {
      console.error('Failed to log admin action (non-blocking)', error)
    }
  }

  return NextResponse.json({ success: true, data })
}

export async function PUT(request: NextRequest) {
  return PATCH(request)
}
