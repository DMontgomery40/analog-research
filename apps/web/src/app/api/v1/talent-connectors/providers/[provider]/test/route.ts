import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { requireTalentProviderAccess } from '@/lib/talent-connectors/http'
import { testTalentProvider } from '@/lib/talent-connectors/service'

export const runtime = 'nodejs'

const bodySchema = z.object({
  env: z.enum(['live', 'sandbox']).default('live'),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const guard = await requireTalentProviderAccess(request, params, 'write')
  if (!guard.ok) return guard.response
  const { actingAgentId, serviceClient, provider } = guard.context

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await request.json())
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 })
  }

  const result = await testTalentProvider(serviceClient, actingAgentId, provider, body.env)

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error, ...(result.code && { code: result.code }) },
      { status: result.code ? 422 : 500 },
    )
  }

  return NextResponse.json({ success: true, data: { ok: true } })
}
