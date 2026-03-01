import type { SupabaseClient } from '@supabase/supabase-js'

export type ExternalJobWithEventsResult =
  | {
      ok: true
      job: Record<string, unknown>
      events: Array<Record<string, unknown>>
    }
  | {
      ok: false
      status: number
      error: string
    }

export async function fetchExternalJobWithEvents(
  supabase: SupabaseClient,
  params: { agentId: string; jobId: string }
): Promise<ExternalJobWithEventsResult> {
  const { data: job, error: jobError } = await supabase
    .from('external_jobs')
    .select('*')
    .eq('id', params.jobId)
    .eq('agent_id', params.agentId)
    .maybeSingle()

  if (jobError) {
    return { ok: false, status: 500, error: jobError.message }
  }

  if (!job) {
    return { ok: false, status: 404, error: 'Not found' }
  }

  const { data: events, error: eventsError } = await supabase
    .from('external_job_events')
    .select('*')
    .eq('job_id', params.jobId)
    .order('created_at', { ascending: true })
    .limit(500)

  if (eventsError) {
    return { ok: false, status: 500, error: eventsError.message }
  }

  return {
    ok: true,
    job: job as Record<string, unknown>,
    events: (events ?? []) as Array<Record<string, unknown>>,
  }
}
