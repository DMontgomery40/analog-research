import type { ExternalJobStatus } from './types'

export type ProxyPicsEnv = 'live' | 'sandbox'

export interface ProxyPicsCredentials {
  apiKey: string
}

export interface ProxyPicsTaskInput {
  title: string
  description: string
  photo_map?: string
}

export interface ProxyPicsUnlimitedSectionInput {
  title: string
  tasks_attributes: ProxyPicsTaskInput[]
}

export interface ProxyPicsCreatePhotoRequestInput {
  address: string
  additional_notes?: string
  external_id?: string
  template_token?: string
  photo_request_platform?: 'crowdsource' | 'direct'
  property_owner_phone?: string
  direct_due_date?: string
  expires_at?: string
  scheduled_at?: string
  price_boost?: number
  unlimited_tasks?: boolean
  unlimited_tasks_descriptions?: string
  unlimited_sections_attributes?: ProxyPicsUnlimitedSectionInput[]
  tasks?: ProxyPicsTaskInput[] | null
}

export interface ProxyPicsPhotoRequest {
  id: number
  status?: string
  external_id?: string
  cost?: number
  created_at?: string
  completed_at?: string
  expires_at?: string
  download_photos_url?: string
  download_report_url?: string
  download_url?: string
  [key: string]: unknown
}

export interface ProxyPicsMessage {
  id?: number
  text?: string
  sender_id?: string
  sender_name?: string
  photo_request_id?: number
  created_at?: string
  [key: string]: unknown
}

export interface ProxyPicsPhotoRequestTemplate {
  id: number
  name: string
  token: string
  photo_request_platform?: string
  tasks?: unknown[]
  created_at?: string
  [key: string]: unknown
}

export function proxypicsBaseUrl(env: ProxyPicsEnv): string {
  return env === 'sandbox'
    ? 'https://sandbox.proxypics.com/api/v3'
    : 'https://api.proxypics.com/api/v3'
}

async function proxypicsRequest<T>(
  input: {
    env: ProxyPicsEnv
    credentials: ProxyPicsCredentials
    path: string
    method?: string
    body?: unknown
    fetchFn?: typeof fetch
  }
): Promise<T> {
  const url = `${proxypicsBaseUrl(input.env)}${input.path}`
  const fetcher = input.fetchFn ?? fetch

  const response = await fetcher(url, {
    method: input.method ?? 'GET',
    headers: {
      'x-api-key': input.credentials.apiKey,
      'Content-Type': 'application/json',
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`ProxyPics API error ${response.status}: ${errorText || response.statusText}`)
  }

  return response.json() as Promise<T>
}

export function mapProxyPicsStatusToExternalJobStatus(providerStatus: string | null | undefined): ExternalJobStatus {
  const normalized = (providerStatus || '').toLowerCase().trim()

  switch (normalized) {
    case 'unassigned':
      return 'open'
    case 'assigned':
      return 'in_progress'
    case 'upload_started':
      return 'in_progress'
    case 'appointment_scheduled':
      return 'in_progress'
    case 'awaiting_signatures':
      return 'action_required'
    case 'signature_collected':
      return 'in_progress'
    case 'on_hold':
      return 'action_required'
    case 'completed':
      // Completed but still waiting for review/approval.
      return 'action_required'
    case 'fulfilled':
      return 'completed'
    case 'expired':
      return 'expired'
    case 'canceled':
    case 'cancelled':
      return 'cancelled'
    default:
      // Unknown/new statuses should not break ingestion.
      return 'in_progress'
  }
}

export async function listPhotoRequests(params: {
  env: ProxyPicsEnv
  credentials: ProxyPicsCredentials
  page?: number
  perPage?: number
  fetchFn?: typeof fetch
}): Promise<{ data: ProxyPicsPhotoRequest[]; meta?: unknown }> {
  const query = new URLSearchParams()
  if (params.page) query.set('page', String(params.page))
  if (params.perPage) query.set('per_page', String(params.perPage))
  const path = query.toString().length > 0 ? `/photo-requests?${query}` : '/photo-requests'
  return proxypicsRequest({ env: params.env, credentials: params.credentials, path, fetchFn: params.fetchFn })
}

export async function createPhotoRequest(params: {
  env: ProxyPicsEnv
  credentials: ProxyPicsCredentials
  input: ProxyPicsCreatePhotoRequestInput
  fetchFn?: typeof fetch
}): Promise<ProxyPicsPhotoRequest> {
  return proxypicsRequest({
    env: params.env,
    credentials: params.credentials,
    path: '/photo-requests',
    method: 'POST',
    body: params.input,
    fetchFn: params.fetchFn,
  })
}

export async function getPhotoRequest(params: {
  env: ProxyPicsEnv
  credentials: ProxyPicsCredentials
  id: string
  fetchFn?: typeof fetch
}): Promise<ProxyPicsPhotoRequest> {
  return proxypicsRequest({
    env: params.env,
    credentials: params.credentials,
    path: `/photo-requests/${encodeURIComponent(params.id)}`,
    method: 'GET',
    fetchFn: params.fetchFn,
  })
}

export async function cancelPhotoRequest(params: {
  env: ProxyPicsEnv
  credentials: ProxyPicsCredentials
  id: string
  fetchFn?: typeof fetch
}): Promise<unknown> {
  return proxypicsRequest({
    env: params.env,
    credentials: params.credentials,
    path: `/photo-requests/${encodeURIComponent(params.id)}`,
    method: 'DELETE',
    fetchFn: params.fetchFn,
  })
}

export async function approvePhotoRequest(params: {
  env: ProxyPicsEnv
  credentials: ProxyPicsCredentials
  id: string
  fetchFn?: typeof fetch
}): Promise<unknown> {
  return proxypicsRequest({
    env: params.env,
    credentials: params.credentials,
    path: `/photo-requests/${encodeURIComponent(params.id)}/approve`,
    method: 'PUT',
    fetchFn: params.fetchFn,
  })
}

export async function rejectPhotoRequest(params: {
  env: ProxyPicsEnv
  credentials: ProxyPicsCredentials
  id: string
  reason: string
  clarification?: string
  fetchFn?: typeof fetch
}): Promise<unknown> {
  return proxypicsRequest({
    env: params.env,
    credentials: params.credentials,
    path: `/photo-requests/${encodeURIComponent(params.id)}/reject`,
    method: 'PUT',
    body: {
      reason: params.reason,
      clarification: params.clarification,
    },
    fetchFn: params.fetchFn,
  })
}

export async function sendPhotoRequestMessage(params: {
  env: ProxyPicsEnv
  credentials: ProxyPicsCredentials
  photoRequestId: string
  text: string
  fetchFn?: typeof fetch
}): Promise<ProxyPicsMessage> {
  // Docs show a standalone Messages endpoint taking photo_request_id. Some blueprints also expose
  // /photo-requests/{id}/messages. We try /messages first and fall back for compatibility.
  const body = {
    text: params.text,
    photo_request_id: Number(params.photoRequestId),
  }

  try {
    return await proxypicsRequest({
      env: params.env,
      credentials: params.credentials,
      path: '/messages',
      method: 'POST',
      body,
      fetchFn: params.fetchFn,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/404/.test(message)) {
      throw error
    }

    return proxypicsRequest({
      env: params.env,
      credentials: params.credentials,
      path: `/photo-requests/${encodeURIComponent(params.photoRequestId)}/messages`,
      method: 'POST',
      body,
      fetchFn: params.fetchFn,
    })
  }
}

export async function listPhotoRequestTemplates(params: {
  env: ProxyPicsEnv
  credentials: ProxyPicsCredentials
  page?: number
  perPage?: number
  fetchFn?: typeof fetch
}): Promise<{ data: ProxyPicsPhotoRequestTemplate[]; meta?: unknown }> {
  const query = new URLSearchParams()
  if (params.page) query.set('page', String(params.page))
  if (params.perPage) query.set('per_page', String(params.perPage))
  const path = query.toString().length > 0
    ? `/photo-request-templates?${query}`
    : '/photo-request-templates'

  return proxypicsRequest({ env: params.env, credentials: params.credentials, path, fetchFn: params.fetchFn })
}

