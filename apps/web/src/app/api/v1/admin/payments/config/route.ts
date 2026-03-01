import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/admin/admin-auth'
import { createServiceClient } from '@/lib/supabase/server'
import { parseZodJsonBody } from '@/lib/request-body'
import { getPaymentsPauseConfig, updatePaymentsPauseConfig } from '@/lib/payments/pause-config'
import { logAdminAction } from '@/lib/admin/audit'

export const runtime = 'nodejs'

export async function GET() {
  const admin = await requireAdmin()
  if (!admin.ok) {
    return NextResponse.json({ success: false, error: admin.error }, { status: admin.status })
  }

  const supabase = await createServiceClient()
  const config = await getPaymentsPauseConfig(supabase)

  return NextResponse.json({ success: true, data: config })
}

const updateSchema = z.object({
  paymentsPaused: z.boolean(),
  pauseReason: z.string().max(500).optional().nullable(),
})

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin.ok) {
    return NextResponse.json({ success: false, error: admin.error }, { status: admin.status })
  }

  const parsed = await parseZodJsonBody(request, updateSchema)
  if (!parsed.ok) return parsed.response

  const supabase = await createServiceClient()
  const before = await getPaymentsPauseConfig(supabase)
  const data = await updatePaymentsPauseConfig(
    parsed.data,
    admin.email || 'admin',
    supabase,
  )

  // Audit log
  if (admin.email && admin.userId) {
    try {
      await logAdminAction({
        action: 'payments.toggle_pause',
        adminEmail: admin.email,
        adminUserId: admin.userId,
        targetType: 'config',
        targetId: 'payments',
        beforeState: { ...before },
        afterState: { ...data },
        notes: parsed.data.paymentsPaused
          ? `Payments paused: ${parsed.data.pauseReason || 'No reason given'}`
          : 'Payments resumed',
      })
    } catch (error) {
      console.error('Failed to log admin action (non-blocking)', error)
    }
  }

  return NextResponse.json({ success: true, data })
}
