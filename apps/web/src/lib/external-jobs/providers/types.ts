import type {
  ExternalJobTaskInput,
  ExternalProvider,
  ExternalProviderEnv,
} from '@/lib/external-jobs/types'

export type ProviderCapability =
  | 'test_connection'
  | 'create_field_check'
  | 'refresh_field_check'
  | 'cancel_field_check'
  | 'approve_field_check'
  | 'reject_field_check'
  | 'send_field_check_message'
  | 'list_templates'

export interface ProviderCredentialField {
  name: string
  label: string
  type: 'secret' | 'text'
  required: boolean
  description: string
}

export interface ExternalProviderDescriptor {
  id: ExternalProvider
  displayName: string
  status: 'active' | 'planned'
  description: string
  supportedEnvs: ExternalProviderEnv[]
  capabilities: Record<ProviderCapability, boolean>
  credentialFields: ProviderCredentialField[]
}

export type CredentialsValidationResult<T> =
  | { ok: true; credentials: T }
  | { ok: false; error: string }

export interface CreateFieldCheckProviderParams<TCredentials> {
  env: ExternalProviderEnv
  credentials: TCredentials
  input: {
    jobId: string
    address: string
    additionalNotes: string
    templateToken?: string | null
    tasks?: ExternalJobTaskInput[] | null
    expiresAt?: string | null
    scheduledAt?: string | null
    priceBoostCents?: number | null
    unlimitedTasks?: boolean | null
    unlimitedTasksDescriptions?: string | null
  }
  fetchFn?: typeof fetch
}

export interface FieldCheckProviderSnapshot {
  providerJobId: string
  providerStatus: string | null
  providerPayload: Record<string, unknown>
  resultPayload: Record<string, unknown>
}

export interface RejectFieldCheckProviderParams<TCredentials> {
  env: ExternalProviderEnv
  credentials: TCredentials
  providerJobId: string
  reason: string
  clarification?: string
  fetchFn?: typeof fetch
}

export interface ExternalProviderPlugin<TCredentials> {
  descriptor: ExternalProviderDescriptor
  validateCredentials(input: unknown): CredentialsValidationResult<TCredentials>
  testConnection?(params: {
    env: ExternalProviderEnv
    credentials: TCredentials
    fetchFn?: typeof fetch
  }): Promise<void>
  createFieldCheck?(params: CreateFieldCheckProviderParams<TCredentials>): Promise<FieldCheckProviderSnapshot>
  getFieldCheck?(params: {
    env: ExternalProviderEnv
    credentials: TCredentials
    providerJobId: string
    fetchFn?: typeof fetch
  }): Promise<FieldCheckProviderSnapshot>
  cancelFieldCheck?(params: {
    env: ExternalProviderEnv
    credentials: TCredentials
    providerJobId: string
    fetchFn?: typeof fetch
  }): Promise<void>
  approveFieldCheck?(params: {
    env: ExternalProviderEnv
    credentials: TCredentials
    providerJobId: string
    fetchFn?: typeof fetch
  }): Promise<void>
  rejectFieldCheck?(params: RejectFieldCheckProviderParams<TCredentials>): Promise<void>
  sendFieldCheckMessage?(params: {
    env: ExternalProviderEnv
    credentials: TCredentials
    providerJobId: string
    text: string
    fetchFn?: typeof fetch
  }): Promise<unknown>
  listTemplates?(params: {
    env: ExternalProviderEnv
    credentials: TCredentials
    page?: number
    perPage?: number
    fetchFn?: typeof fetch
  }): Promise<{ data: Array<Record<string, unknown>>; meta?: unknown }>
}
