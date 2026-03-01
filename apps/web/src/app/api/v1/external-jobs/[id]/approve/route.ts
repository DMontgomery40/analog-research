import { NextRequest, NextResponse } from 'next/server'

import { approveExternalJob } from '@/lib/external-jobs/service'
import { handleExternalJobWriteJson } from '@/lib/external-jobs/http'
import type { ExternalProvider } from '@/lib/external-jobs/types'
import {
  evaluateExternalJobsPolicy,
  loadAgentToolPolicy,
  resolveToolPolicySourceFromHeaders,
  writeAgentToolAuditLogBestEffort,
} from '@/lib/tool-policy'

export const runtime = 'nodejs'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const toolSource = resolveToolPolicySourceFromHeaders(request.headers)

  return handleExternalJobWriteJson(
    request,
    params,
    async ({ supabase, agentId, jobId, authMode }) => {
      if (authMode === 'agent') {
        const { data: job, error } = await supabase
          .from('external_jobs')
          .select('provider')
          .eq('id', jobId)
          .eq('agent_id', agentId)
          .maybeSingle()

        if (error) {
          return NextResponse.json({ success: false, error: error.message }, { status: 500 })
        }

        if (!job) {
          return NextResponse.json({ success: false, error: 'External job not found' }, { status: 404 })
        }

        const provider = job.provider as ExternalProvider
        const policy = await loadAgentToolPolicy(supabase, agentId)
        const decision = evaluateExternalJobsPolicy({ policy, provider })

        if (!decision.allowed) {
          await writeAgentToolAuditLogBestEffort(supabase, {
            agentId,
            toolName: 'approve_external_job',
            decision: 'blocked',
            reasonCode: decision.reasonCode,
            reason: decision.reason,
            provider,
            source: toolSource,
            metadata: { external_job_id: jobId },
          })

          return NextResponse.json(
            { success: false, error: decision.reason, code: 'TOOL_POLICY_BLOCKED' },
            { status: 403 }
          )
        }

        if (toolSource === 'api') {
          await writeAgentToolAuditLogBestEffort(supabase, {
            agentId,
            toolName: 'approve_external_job',
            decision: 'allowed',
            reasonCode: decision.reasonCode,
            reason: decision.reason,
            provider,
            source: toolSource,
            metadata: { external_job_id: jobId },
          })
        }
      }

      const result = await approveExternalJob(supabase, { agentId, jobId })
      return result.job
    },
    { errorMessage: 'Failed to approve external job' }
  )
}
