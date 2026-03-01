import { NextRequest } from 'next/server'

import { cancelExternalJob } from '@/lib/external-jobs/service'
import { handleExternalJobWriteJson } from '@/lib/external-jobs/http'

export const runtime = 'nodejs'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  return handleExternalJobWriteJson(
    request,
    params,
    async ({ supabase, agentId, jobId }) => {
      const result = await cancelExternalJob(supabase, { agentId, jobId })
      return result.job
    },
    { errorMessage: 'Failed to cancel external job' }
  )
}
