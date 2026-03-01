import { NextRequest } from 'next/server'
import { z } from 'zod'

import { handleTalentActionRoute, talentActionBaseSchema } from '@/lib/talent-connectors/http'

export const runtime = 'nodejs'

const bodySchema = talentActionBaseSchema.extend({
  provider_worker_id: z.string().min(1),
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(5000),
  budget_cents: z.number().int().min(0).optional(),
})

export function POST(request: NextRequest) {
  return handleTalentActionRoute(request, {
    schema: bodySchema,
    actionType: 'post_task',
    toPayload: (body) => ({
      provider_worker_id: body.provider_worker_id,
      title: body.title,
      description: body.description,
      budget_cents: body.budget_cents,
    }),
  })
}
