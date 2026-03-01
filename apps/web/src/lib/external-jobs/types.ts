export const EXTERNAL_PROVIDERS = ['proxypics', 'wegolook'] as const
export type ExternalProvider = (typeof EXTERNAL_PROVIDERS)[number]

export const EXTERNAL_PROVIDER_ENVS = ['live', 'sandbox'] as const
export type ExternalProviderEnv = (typeof EXTERNAL_PROVIDER_ENVS)[number]

export const EXTERNAL_JOB_KINDS = ['field_check'] as const
export type ExternalJobKind = (typeof EXTERNAL_JOB_KINDS)[number]

export const EXTERNAL_JOB_STATUSES = [
  'open',
  'in_progress',
  'action_required',
  'completed',
  'cancelled',
  'expired',
  'failed',
] as const
export type ExternalJobStatus = (typeof EXTERNAL_JOB_STATUSES)[number]

export interface ExternalJobTaskInput {
  title: string
  description: string
}

export interface CreateFieldCheckInput {
  kind: 'field_check'
  title?: string
  instructions: string
  address: string
  provider?: ExternalProvider
  provider_env?: ExternalProviderEnv
  expires_at?: string | null
  scheduled_at?: string | null
  public_only?: boolean
  auto_approve?: boolean
  template_token?: string | null
  tasks?: ExternalJobTaskInput[] | null
  price_boost_cents?: number | null
  unlimited_tasks?: boolean | null
  unlimited_tasks_descriptions?: string | null
  bounty_id?: string | null
  booking_id?: string | null
  application_id?: string | null
  conversation_id?: string | null
}

export type ExternalJobCreateResult = {
  job: any
}

export function normalizeExternalJobStatus(status: string): ExternalJobStatus | null {
  if (status === 'canceled') return 'cancelled'
  if ((EXTERNAL_JOB_STATUSES as readonly string[]).includes(status)) {
    return status as ExternalJobStatus
  }
  return null
}
