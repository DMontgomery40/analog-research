import { NextRequest } from 'next/server'
import { z } from 'zod'

import { handleTalentActionRoute, talentActionBaseSchema } from '@/lib/talent-connectors/http'

export const runtime = 'nodejs'

const bodySchema = talentActionBaseSchema.extend({
  provider_worker_id: z.string().min(1),
  message: z.string().min(1).max(5000),
})

export function POST(request: NextRequest) {
  return handleTalentActionRoute(request, {
    schema: bodySchema,
    actionType: 'contact',
    toPayload: (body) => ({ provider_worker_id: body.provider_worker_id, message: body.message }),
  })
}
