import type { SupabaseClient } from '@supabase/supabase-js'

import { createNotification } from '@/lib/notifications'
import { decryptIntegrationCredentials } from '@/lib/integrations-secrets'
import {
  getExternalProviderPlugin,
  isExternalProvider,
} from '@/lib/external-jobs/providers/registry'
import type { ExternalProviderPlugin } from '@/lib/external-jobs/providers/types'

import type {
  CreateFieldCheckInput,
  ExternalProvider,
  ExternalProviderEnv,
  ExternalJobStatus,
} from './types'
import { normalizeExternalJobStatus } from './types'

function normalizeEnv(env: ExternalProviderEnv | undefined): ExternalProviderEnv {
  return env === 'sandbox' ? 'sandbox' : 'live'
}

function normalizeProvider(provider: ExternalProvider | undefined): ExternalProvider {
  return provider === 'wegolook' ? 'wegolook' : 'proxypics'
}

function buildFieldCheckNotes(input: {
  jobId: string
  instructions: string
  publicOnly: boolean
}): string {
  const header = input.publicOnly
    ? 'PUBLIC ONLY: Do not enter property. Do not trespass. Do not open gates/doors.'
    : 'Follow instructions below.'
  return `${header}\n\nJob ID: ${input.jobId}\n\n${input.instructions}`.trim()
}

function toProviderNotImplementedError(provider: ExternalProvider, operation: string): Error {
  return new Error(`Provider ${provider} does not support operation: ${operation}`)
}

function statusFromSnapshot(snapshot: {
  resultPayload: Record<string, unknown>
  providerStatus: string | null
}): ExternalJobStatus {
  const normalized = snapshot.resultPayload.normalized_status
  if (typeof normalized === 'string') {
    const status = normalizeExternalJobStatus(normalized)
    if (status) return status
  }

  const byProviderStatus = normalizeExternalJobStatus(snapshot.providerStatus || '')
  if (byProviderStatus) return byProviderStatus

  return 'in_progress'
}

async function appendEvent(
  supabase: SupabaseClient,
  params: {
    jobId: string
    agentId: string
    provider: ExternalProvider
    providerEnv: ExternalProviderEnv
    source: string
    eventName: string
    payload?: Record<string, unknown>
  }
) {
  await supabase
    .from('external_job_events')
    .insert({
      job_id: params.jobId,
      agent_id: params.agentId,
      provider: params.provider,
      provider_env: params.providerEnv,
      source: params.source,
      event_name: params.eventName,
      payload: params.payload ?? {},
    })
}

async function getActiveIntegration(
  supabase: SupabaseClient,
  params: { agentId: string; provider: ExternalProvider; providerEnv: ExternalProviderEnv }
) {
  const { data, error } = await supabase
    .from('external_integrations')
    .select('id, credentials_encrypted, credentials_mask, is_active')
    .eq('agent_id', params.agentId)
    .eq('provider', params.provider)
    .eq('env', params.providerEnv)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    throw new Error(`No active integration configured for provider=${params.provider} env=${params.providerEnv}`)
  }

  return data
}

async function updateJobStatus(
  supabase: SupabaseClient,
  params: {
    jobId: string
    nextStatus: ExternalJobStatus
    providerPayload?: Record<string, unknown>
    resultPayload?: Record<string, unknown>
    providerJobId?: string | null
    errorMessage?: string | null
  }
) {
  const patch: Record<string, unknown> = {
    status: params.nextStatus,
  }

  if (params.providerPayload) patch.provider_payload = params.providerPayload
  if (params.resultPayload) patch.result_payload = params.resultPayload
  if (params.providerJobId !== undefined) patch.provider_job_id = params.providerJobId
  if (params.errorMessage !== undefined) patch.error_message = params.errorMessage

  const { data, error } = await supabase
    .from('external_jobs')
    .update(patch)
    .eq('id', params.jobId)
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Failed to update external job')
  }

  return data
}

async function resolveProviderRuntime(
  supabase: SupabaseClient,
  params: {
    agentId: string
    provider: ExternalProvider
    providerEnv: ExternalProviderEnv
  }
): Promise<{
  plugin: ExternalProviderPlugin<unknown>
  credentials: unknown
}> {
  const plugin = getExternalProviderPlugin(params.provider)
  const integration = await getActiveIntegration(supabase, params)

  const decrypted = decryptIntegrationCredentials<unknown>(integration.credentials_encrypted)
  const validation = plugin.validateCredentials(decrypted)

  if (!validation.ok) {
    throw new Error(validation.error)
  }

  return {
    plugin,
    credentials: validation.credentials,
  }
}

async function assertLinkedRecordsOwnership(
  supabase: SupabaseClient,
  params: {
    agentId: string
    input: CreateFieldCheckInput
  }
) {
  const bountyId = params.input.bounty_id ?? null
  const bookingId = params.input.booking_id ?? null
  const applicationId = params.input.application_id ?? null
  const conversationId = params.input.conversation_id ?? null

  let bookingBountyId: string | null = null
  let bookingApplicationId: string | null = null
  let applicationBountyId: string | null = null

  if (bountyId) {
    const { data, error } = await supabase
      .from('bounties')
      .select('id, agent_id')
      .eq('id', bountyId)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data || data.agent_id !== params.agentId) {
      throw new Error('Invalid bounty_id: bounty not found for this ResearchAgent')
    }
  }

  if (bookingId) {
    const { data, error } = await supabase
      .from('bookings')
      .select('id, agent_id, bounty_id, application_id')
      .eq('id', bookingId)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data || data.agent_id !== params.agentId) {
      throw new Error('Invalid booking_id: booking not found for this ResearchAgent')
    }

    bookingBountyId = data.bounty_id ?? null
    bookingApplicationId = data.application_id ?? null
  }

  if (applicationId) {
    const { data: application, error: applicationError } = await supabase
      .from('applications')
      .select('id, bounty_id')
      .eq('id', applicationId)
      .maybeSingle()

    if (applicationError) throw new Error(applicationError.message)
    if (!application) {
      throw new Error('Invalid application_id: application not found')
    }

    const { data: bounty, error: bountyError } = await supabase
      .from('bounties')
      .select('id, agent_id')
      .eq('id', application.bounty_id)
      .maybeSingle()

    if (bountyError) throw new Error(bountyError.message)
    if (!bounty || bounty.agent_id !== params.agentId) {
      throw new Error('Invalid application_id: application does not belong to this ResearchAgent')
    }

    applicationBountyId = application.bounty_id
  }

  if (conversationId) {
    const { data, error } = await supabase
      .from('conversations')
      .select('id, agent_id')
      .eq('id', conversationId)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data || data.agent_id !== params.agentId) {
      throw new Error('Invalid conversation_id: conversation not found for this ResearchAgent')
    }
  }

  if (bountyId && bookingBountyId && bookingBountyId !== bountyId) {
    throw new Error('Linked IDs conflict: booking_id belongs to a different bounty_id')
  }

  if (bountyId && applicationBountyId && applicationBountyId !== bountyId) {
    throw new Error('Linked IDs conflict: application_id belongs to a different bounty_id')
  }

  if (applicationId && bookingApplicationId && bookingApplicationId !== applicationId) {
    throw new Error('Linked IDs conflict: booking_id belongs to a different application_id')
  }
}

export async function createFieldCheckExternalJob(
  supabase: SupabaseClient,
  params: {
    agentId: string
    input: CreateFieldCheckInput
    fetchFn?: typeof fetch
  }
) {
  const provider = normalizeProvider(params.input.provider)
  const providerEnv = normalizeEnv(params.input.provider_env)

  if (!isExternalProvider(provider)) {
    throw new Error(`Unknown provider: ${provider}`)
  }

  await assertLinkedRecordsOwnership(supabase, { agentId: params.agentId, input: params.input })

  const publicOnly = params.input.public_only ?? true
  const autoApprove = params.input.auto_approve ?? true

  const { data: job, error: createError } = await supabase
    .from('external_jobs')
    .insert({
      agent_id: params.agentId,
      kind: 'field_check',
      provider,
      provider_env: providerEnv,
      status: 'open',
      title: params.input.title ?? null,
      instructions: params.input.instructions,
      address: params.input.address,
      public_only: publicOnly,
      auto_approve: autoApprove,
      expires_at: params.input.expires_at ?? null,
      scheduled_at: params.input.scheduled_at ?? null,
      bounty_id: params.input.bounty_id ?? null,
      booking_id: params.input.booking_id ?? null,
      application_id: params.input.application_id ?? null,
      conversation_id: params.input.conversation_id ?? null,
    })
    .select('*')
    .single()

  if (createError || !job) {
    throw new Error(createError?.message || 'Failed to create external job')
  }

  await appendEvent(supabase, {
    jobId: job.id,
    agentId: params.agentId,
    provider,
    providerEnv,
    source: 'system',
    eventName: 'job_created',
    payload: {
      kind: 'field_check',
      linked: {
        bounty_id: params.input.bounty_id ?? null,
        booking_id: params.input.booking_id ?? null,
        application_id: params.input.application_id ?? null,
        conversation_id: params.input.conversation_id ?? null,
      },
    },
  })

  const runtime = await resolveProviderRuntime(supabase, {
    agentId: params.agentId,
    provider,
    providerEnv,
  })

  if (!runtime.plugin.createFieldCheck) {
    throw toProviderNotImplementedError(provider, 'create_field_check')
  }

  const additionalNotes = buildFieldCheckNotes({
    jobId: job.id,
    instructions: params.input.instructions,
    publicOnly,
  })

  const snapshot = await runtime.plugin.createFieldCheck({
    env: providerEnv,
    credentials: runtime.credentials,
    fetchFn: params.fetchFn,
    input: {
      jobId: job.id,
      address: params.input.address,
      additionalNotes,
      templateToken: params.input.template_token,
      tasks: params.input.tasks,
      expiresAt: params.input.expires_at,
      scheduledAt: params.input.scheduled_at,
      priceBoostCents: params.input.price_boost_cents,
      unlimitedTasks: params.input.unlimited_tasks,
      unlimitedTasksDescriptions: params.input.unlimited_tasks_descriptions,
    },
  })

  const nextStatus = statusFromSnapshot(snapshot)

  const updated = await updateJobStatus(supabase, {
    jobId: job.id,
    nextStatus,
    providerJobId: snapshot.providerJobId,
    providerPayload: snapshot.providerPayload,
    resultPayload: snapshot.resultPayload,
    errorMessage: null,
  })

  await appendEvent(supabase, {
    jobId: job.id,
    agentId: params.agentId,
    provider,
    providerEnv,
    source: 'provider_api',
    eventName: 'provider_created',
    payload: {
      provider_job_id: snapshot.providerJobId,
      provider_status: snapshot.providerStatus,
    },
  })

  await createNotification(supabase, {
    recipientType: 'agent',
    recipientId: params.agentId,
    type: 'external_job_created',
    title: 'Field check ordered',
    body: `${provider} (${providerEnv})`,
    data: {
      external_job_id: job.id,
      provider_job_id: snapshot.providerJobId,
      provider,
      bounty_id: params.input.bounty_id ?? null,
      booking_id: params.input.booking_id ?? null,
    },
  })

  return { job: updated }
}

async function getJobForAgent(
  supabase: SupabaseClient,
  params: { jobId: string; agentId: string }
) {
  const { data: job, error } = await supabase
    .from('external_jobs')
    .select('*')
    .eq('id', params.jobId)
    .eq('agent_id', params.agentId)
    .single()

  if (error || !job) {
    throw new Error(error?.message || 'External job not found')
  }

  return job
}

async function getProviderSnapshotForJob(
  supabase: SupabaseClient,
  params: {
    agentId: string
    job: Record<string, unknown>
    fetchFn?: typeof fetch
  }
) {
  const provider = params.job.provider as ExternalProvider
  const providerEnv = params.job.provider_env as ExternalProviderEnv

  const runtime = await resolveProviderRuntime(supabase, {
    agentId: params.agentId,
    provider,
    providerEnv,
  })

  if (!runtime.plugin.getFieldCheck) {
    throw toProviderNotImplementedError(provider, 'refresh_field_check')
  }

  const providerJobId = String(params.job.provider_job_id || '')
  if (!providerJobId) {
    throw new Error('External job is missing provider_job_id')
  }

  const snapshot = await runtime.plugin.getFieldCheck({
    env: providerEnv,
    credentials: runtime.credentials,
    providerJobId,
    fetchFn: params.fetchFn,
  })

  return {
    provider,
    providerEnv,
    runtime,
    providerJobId,
    snapshot,
  }
}

export async function refreshExternalJob(
  supabase: SupabaseClient,
  params: {
    agentId: string
    jobId: string
    fetchFn?: typeof fetch
  }
) {
  const job = await getJobForAgent(supabase, { jobId: params.jobId, agentId: params.agentId })

  const previousStatus = job.status as ExternalJobStatus
  const context = await getProviderSnapshotForJob(supabase, {
    agentId: params.agentId,
    job,
    fetchFn: params.fetchFn,
  })

  let snapshot = context.snapshot
  const providerStatusLower = (snapshot.providerStatus || '').toLowerCase()

  if (providerStatusLower === 'completed' && Boolean(job.auto_approve) && context.runtime.plugin.approveFieldCheck) {
    try {
      await context.runtime.plugin.approveFieldCheck({
        env: context.providerEnv,
        credentials: context.runtime.credentials,
        providerJobId: context.providerJobId,
        fetchFn: params.fetchFn,
      })

      await appendEvent(supabase, {
        jobId: job.id,
        agentId: params.agentId,
        provider: context.provider,
        providerEnv: context.providerEnv,
        source: 'provider_api',
        eventName: 'provider_approved',
      })

      if (context.runtime.plugin.getFieldCheck) {
        snapshot = await context.runtime.plugin.getFieldCheck({
          env: context.providerEnv,
          credentials: context.runtime.credentials,
          providerJobId: context.providerJobId,
          fetchFn: params.fetchFn,
        })
      }
    } catch (approveError) {
      await appendEvent(supabase, {
        jobId: job.id,
        agentId: params.agentId,
        provider: context.provider,
        providerEnv: context.providerEnv,
        source: 'provider_api',
        eventName: 'provider_approve_failed',
        payload: { error: approveError instanceof Error ? approveError.message : String(approveError) },
      })
    }
  }

  const nextStatus = statusFromSnapshot(snapshot)

  const updated = await updateJobStatus(supabase, {
    jobId: job.id,
    nextStatus,
    providerPayload: snapshot.providerPayload,
    resultPayload: snapshot.resultPayload,
    errorMessage: null,
  })

  if (previousStatus !== updated.status) {
    await appendEvent(supabase, {
      jobId: job.id,
      agentId: params.agentId,
      provider: context.provider,
      providerEnv: context.providerEnv,
      source: 'system',
      eventName: 'status_changed',
      payload: { previous: previousStatus, next: updated.status },
    })

    const notificationType = updated.status === 'completed'
      ? 'external_job_completed'
      : (updated.status === 'failed' ? 'external_job_failed' : 'external_job_updated')

    await createNotification(supabase, {
      recipientType: 'agent',
      recipientId: params.agentId,
      type: notificationType,
      title: `Field check ${updated.status.replace(/_/g, ' ')}`,
      body: `${context.provider} (${context.providerEnv})`,
      data: {
        external_job_id: job.id,
        provider_job_id: context.providerJobId,
        provider: context.provider,
        status: updated.status,
        bounty_id: job.bounty_id ?? null,
        booking_id: job.booking_id ?? null,
      },
    })
  }

  return { job: updated }
}

export async function cancelExternalJob(
  supabase: SupabaseClient,
  params: { agentId: string; jobId: string; fetchFn?: typeof fetch }
) {
  const job = await getJobForAgent(supabase, { jobId: params.jobId, agentId: params.agentId })
  const provider = job.provider as ExternalProvider
  const providerEnv = job.provider_env as ExternalProviderEnv

  const runtime = await resolveProviderRuntime(supabase, { agentId: params.agentId, provider, providerEnv })
  if (!runtime.plugin.cancelFieldCheck) {
    throw toProviderNotImplementedError(provider, 'cancel_field_check')
  }

  const providerJobId = String(job.provider_job_id || '')
  if (!providerJobId) {
    throw new Error('External job is missing provider_job_id')
  }

  await runtime.plugin.cancelFieldCheck({
    env: providerEnv,
    credentials: runtime.credentials,
    providerJobId,
    fetchFn: params.fetchFn,
  })

  const updated = await updateJobStatus(supabase, {
    jobId: job.id,
    nextStatus: 'cancelled',
    errorMessage: null,
  })

  await appendEvent(supabase, {
    jobId: job.id,
    agentId: params.agentId,
    provider,
    providerEnv,
    source: 'provider_api',
    eventName: 'provider_cancelled',
    payload: { provider_job_id: providerJobId },
  })

  await createNotification(supabase, {
    recipientType: 'agent',
    recipientId: params.agentId,
    type: 'external_job_updated',
    title: 'Field check cancelled',
    body: `${provider} (${providerEnv})`,
    data: {
      external_job_id: job.id,
      provider_job_id: providerJobId,
      provider,
      status: updated.status,
      bounty_id: job.bounty_id ?? null,
      booking_id: job.booking_id ?? null,
    },
  })

  return { job: updated }
}

export async function approveExternalJob(
  supabase: SupabaseClient,
  params: { agentId: string; jobId: string; fetchFn?: typeof fetch }
) {
  const job = await getJobForAgent(supabase, { jobId: params.jobId, agentId: params.agentId })
  const provider = job.provider as ExternalProvider
  const providerEnv = job.provider_env as ExternalProviderEnv

  const runtime = await resolveProviderRuntime(supabase, { agentId: params.agentId, provider, providerEnv })
  if (!runtime.plugin.approveFieldCheck) {
    throw toProviderNotImplementedError(provider, 'approve_field_check')
  }

  const providerJobId = String(job.provider_job_id || '')
  if (!providerJobId) {
    throw new Error('External job is missing provider_job_id')
  }

  await runtime.plugin.approveFieldCheck({
    env: providerEnv,
    credentials: runtime.credentials,
    providerJobId,
    fetchFn: params.fetchFn,
  })

  await appendEvent(supabase, {
    jobId: job.id,
    agentId: params.agentId,
    provider,
    providerEnv,
    source: 'provider_api',
    eventName: 'provider_approved',
    payload: { provider_job_id: providerJobId },
  })

  return refreshExternalJob(supabase, { agentId: params.agentId, jobId: job.id, fetchFn: params.fetchFn })
}

export async function rejectExternalJob(
  supabase: SupabaseClient,
  params: {
    agentId: string
    jobId: string
    reason: string
    clarification?: string
    fetchFn?: typeof fetch
  }
) {
  const job = await getJobForAgent(supabase, { jobId: params.jobId, agentId: params.agentId })
  const provider = job.provider as ExternalProvider
  const providerEnv = job.provider_env as ExternalProviderEnv

  const runtime = await resolveProviderRuntime(supabase, { agentId: params.agentId, provider, providerEnv })
  if (!runtime.plugin.rejectFieldCheck) {
    throw toProviderNotImplementedError(provider, 'reject_field_check')
  }

  const providerJobId = String(job.provider_job_id || '')
  if (!providerJobId) {
    throw new Error('External job is missing provider_job_id')
  }

  await runtime.plugin.rejectFieldCheck({
    env: providerEnv,
    credentials: runtime.credentials,
    providerJobId,
    reason: params.reason,
    clarification: params.clarification,
    fetchFn: params.fetchFn,
  })

  await appendEvent(supabase, {
    jobId: job.id,
    agentId: params.agentId,
    provider,
    providerEnv,
    source: 'provider_api',
    eventName: 'provider_rejected',
    payload: { provider_job_id: providerJobId, reason: params.reason },
  })

  return refreshExternalJob(supabase, { agentId: params.agentId, jobId: job.id, fetchFn: params.fetchFn })
}

export async function sendExternalJobMessage(
  supabase: SupabaseClient,
  params: { agentId: string; jobId: string; text: string; fetchFn?: typeof fetch }
) {
  const job = await getJobForAgent(supabase, { jobId: params.jobId, agentId: params.agentId })
  const provider = job.provider as ExternalProvider
  const providerEnv = job.provider_env as ExternalProviderEnv

  const runtime = await resolveProviderRuntime(supabase, { agentId: params.agentId, provider, providerEnv })
  if (!runtime.plugin.sendFieldCheckMessage) {
    throw toProviderNotImplementedError(provider, 'send_field_check_message')
  }

  const providerJobId = String(job.provider_job_id || '')
  if (!providerJobId) {
    throw new Error('External job is missing provider_job_id')
  }

  const message = await runtime.plugin.sendFieldCheckMessage({
    env: providerEnv,
    credentials: runtime.credentials,
    providerJobId,
    text: params.text,
    fetchFn: params.fetchFn,
  })

  await appendEvent(supabase, {
    jobId: job.id,
    agentId: params.agentId,
    provider,
    providerEnv,
    source: 'provider_api',
    eventName: 'provider_message_sent',
    payload: { provider_job_id: providerJobId, message },
  })

  return { job, message }
}

export async function listProviderTemplates(
  supabase: SupabaseClient,
  params: {
    agentId: string
    provider: ExternalProvider
    providerEnv: ExternalProviderEnv
    page?: number
    perPage?: number
    fetchFn?: typeof fetch
  }
) {
  const provider = normalizeProvider(params.provider)

  if (!isExternalProvider(provider)) {
    throw new Error(`Unknown provider: ${provider}`)
  }

  const runtime = await resolveProviderRuntime(supabase, {
    agentId: params.agentId,
    provider,
    providerEnv: params.providerEnv,
  })

  if (!runtime.plugin.listTemplates) {
    throw toProviderNotImplementedError(provider, 'list_templates')
  }

  return runtime.plugin.listTemplates({
    env: params.providerEnv,
    credentials: runtime.credentials,
    page: params.page,
    perPage: params.perPage,
    fetchFn: params.fetchFn,
  })
}

export async function listProxyPicsTemplates(
  supabase: SupabaseClient,
  params: { agentId: string; providerEnv: ExternalProviderEnv; page?: number; perPage?: number; fetchFn?: typeof fetch }
) {
  return listProviderTemplates(supabase, {
    ...params,
    provider: 'proxypics',
  })
}
