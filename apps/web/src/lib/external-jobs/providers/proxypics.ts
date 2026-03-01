import {
  approvePhotoRequest,
  cancelPhotoRequest,
  createPhotoRequest,
  getPhotoRequest,
  listPhotoRequestTemplates,
  listPhotoRequests,
  mapProxyPicsStatusToExternalJobStatus,
  rejectPhotoRequest,
  sendPhotoRequestMessage,
  type ProxyPicsCreatePhotoRequestInput,
} from '@/lib/external-jobs/proxypics'

import type { ExternalProviderPlugin, FieldCheckProviderSnapshot } from './types'

export interface ProxyPicsPluginCredentials {
  apiKey: string
}

function buildSnapshot(providerPayload: Record<string, unknown>): FieldCheckProviderSnapshot {
  const providerJobId = String(providerPayload.id ?? '')
  if (!providerJobId) {
    throw new Error('ProxyPics response is missing id')
  }

  const providerStatus = typeof providerPayload.status === 'string'
    ? providerPayload.status
    : null

  return {
    providerJobId,
    providerStatus,
    providerPayload,
    resultPayload: {
      provider_status: providerStatus,
      normalized_status: mapProxyPicsStatusToExternalJobStatus(providerStatus),
      download_photos_url: providerPayload.download_photos_url ?? null,
      download_report_url: providerPayload.download_report_url ?? null,
      completed_at: providerPayload.completed_at ?? null,
      cost_cents: providerPayload.cost ?? null,
    },
  }
}

export const proxyPicsProviderPlugin: ExternalProviderPlugin<ProxyPicsPluginCredentials> = {
  descriptor: {
    id: 'proxypics',
    displayName: 'ProxyPics',
    status: 'active',
    description: 'Drive-by photo checks and reports via ProxyPics API v3.',
    supportedEnvs: ['live', 'sandbox'],
    capabilities: {
      test_connection: true,
      create_field_check: true,
      refresh_field_check: true,
      cancel_field_check: true,
      approve_field_check: true,
      reject_field_check: true,
      send_field_check_message: true,
      list_templates: true,
    },
    credentialFields: [
      {
        name: 'api_key',
        label: 'API key',
        type: 'secret',
        required: true,
        description: 'ProxyPics x-api-key for the selected environment.',
      },
    ],
  },

  validateCredentials(input: unknown) {
    if (!input || typeof input !== 'object') {
      return { ok: false as const, error: 'Missing credentials object' }
    }

    const rawApiKey = (input as { apiKey?: unknown; api_key?: unknown }).apiKey
      ?? (input as { apiKey?: unknown; api_key?: unknown }).api_key
    if (typeof rawApiKey !== 'string' || rawApiKey.trim().length === 0) {
      return { ok: false as const, error: 'Invalid ProxyPics credentials: missing apiKey' }
    }

    return {
      ok: true as const,
      credentials: { apiKey: rawApiKey.trim() },
    }
  },

  async testConnection(params) {
    await listPhotoRequests({
      env: params.env,
      credentials: params.credentials,
      page: 1,
      perPage: 1,
      fetchFn: params.fetchFn,
    })
  },

  async createFieldCheck(params) {
    const templateToken = params.input.templateToken || undefined
    const tasks = params.input.tasks?.map((task) => ({
      title: task.title,
      description: task.description,
    })) ?? null

    const requestBody: ProxyPicsCreatePhotoRequestInput = {
      address: params.input.address,
      additional_notes: params.input.additionalNotes,
      external_id: params.input.jobId,
      template_token: templateToken,
      expires_at: params.input.expiresAt || undefined,
      scheduled_at: params.input.scheduledAt || undefined,
      price_boost: params.input.priceBoostCents ?? undefined,
      unlimited_tasks: params.input.unlimitedTasks ?? undefined,
      unlimited_tasks_descriptions: params.input.unlimitedTasksDescriptions ?? undefined,
      unlimited_sections_attributes: params.input.unlimitedTasks
        ? [{ title: 'Additional Photos', tasks_attributes: [] }]
        : undefined,
      photo_request_platform: templateToken ? undefined : 'crowdsource',
      tasks: templateToken
        ? null
        : (tasks && tasks.length > 0
          ? tasks
          : [{ title: 'Field Check', description: params.input.additionalNotes }]),
    }

    const created = await createPhotoRequest({
      env: params.env,
      credentials: params.credentials,
      input: requestBody,
      fetchFn: params.fetchFn,
    })

    return buildSnapshot(created as unknown as Record<string, unknown>)
  },

  async getFieldCheck(params) {
    const snapshot = await getPhotoRequest({
      env: params.env,
      credentials: params.credentials,
      id: params.providerJobId,
      fetchFn: params.fetchFn,
    })

    return buildSnapshot(snapshot as unknown as Record<string, unknown>)
  },

  async cancelFieldCheck(params) {
    await cancelPhotoRequest({
      env: params.env,
      credentials: params.credentials,
      id: params.providerJobId,
      fetchFn: params.fetchFn,
    })
  },

  async approveFieldCheck(params) {
    await approvePhotoRequest({
      env: params.env,
      credentials: params.credentials,
      id: params.providerJobId,
      fetchFn: params.fetchFn,
    })
  },

  async rejectFieldCheck(params) {
    await rejectPhotoRequest({
      env: params.env,
      credentials: params.credentials,
      id: params.providerJobId,
      reason: params.reason,
      clarification: params.clarification,
      fetchFn: params.fetchFn,
    })
  },

  async sendFieldCheckMessage(params) {
    return sendPhotoRequestMessage({
      env: params.env,
      credentials: params.credentials,
      photoRequestId: params.providerJobId,
      text: params.text,
      fetchFn: params.fetchFn,
    })
  },

  async listTemplates(params) {
    const response = await listPhotoRequestTemplates({
      env: params.env,
      credentials: params.credentials,
      page: params.page,
      perPage: params.perPage,
      fetchFn: params.fetchFn,
    })

    return {
      data: (response.data ?? []) as Array<Record<string, unknown>>,
      meta: response.meta,
    }
  },
}
