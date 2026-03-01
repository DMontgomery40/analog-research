import type { ProviderCredentialField } from '@/lib/external-jobs/providers/types'
import type { ExternalProviderEnv } from '@/lib/external-jobs/types'
import type { TalentProvider } from '@/lib/talent-connectors/types'

// ---------------------------------------------------------------------------
// Provider capabilities
// ---------------------------------------------------------------------------

export type TalentProviderCapability =
  | 'test_connection'
  | 'search_workers'
  | 'contact_worker'
  | 'create_task'
  | 'sync_object'

// ---------------------------------------------------------------------------
// Provider descriptor (static metadata — source of truth for UI + policy)
// ---------------------------------------------------------------------------

export interface TalentProviderDescriptor {
  id: TalentProvider
  displayName: string
  status: 'active' | 'partner_onboarding' | 'researching'
  description: string
  supportedEnvs: ExternalProviderEnv[]
  capabilities: Record<TalentProviderCapability, boolean>
  credentialFields: ProviderCredentialField[]
  /** Hard invariant: always false. Cold outreach is never allowed. */
  supportsColdOutreach: false
}

// ---------------------------------------------------------------------------
// Search result from provider
// ---------------------------------------------------------------------------

export interface TalentWorkerSearchResult {
  providerWorkerId: string
  displayName: string | null
  profileUrl: string | null
  skills: string[]
  rateJson: Record<string, unknown> | null
  availabilityJson: Record<string, unknown> | null
  location: string | null
  rating: number | null
  reviewsCount: number
  providerPayload: Record<string, unknown>
}

export interface TalentWorkerSearchOutput {
  workers: TalentWorkerSearchResult[]
  meta?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Provider plugin interface (methods are optional per capability)
// ---------------------------------------------------------------------------

export type CredentialsValidationResult<T> =
  | { ok: true; credentials: T }
  | { ok: false; error: string }

export interface TalentProviderPlugin<TCredentials> {
  descriptor: TalentProviderDescriptor

  validateCredentials(input: unknown): CredentialsValidationResult<TCredentials>

  testConnection?(params: {
    env: ExternalProviderEnv
    credentials: TCredentials
    fetchFn?: typeof fetch
  }): Promise<void>

  searchWorkers?(params: {
    env: ExternalProviderEnv
    credentials: TCredentials
    query: string
    skills?: string[]
    location?: string
    limit?: number
    offset?: number
    fetchFn?: typeof fetch
  }): Promise<TalentWorkerSearchOutput>

  contactWorker?(params: {
    env: ExternalProviderEnv
    credentials: TCredentials
    providerWorkerId: string
    message: string
    fetchFn?: typeof fetch
  }): Promise<Record<string, unknown>>

  createTaskOrBooking?(params: {
    env: ExternalProviderEnv
    credentials: TCredentials
    providerWorkerId: string
    title: string
    description: string
    budgetCents?: number
    fetchFn?: typeof fetch
  }): Promise<Record<string, unknown>>

  syncObject?(params: {
    env: ExternalProviderEnv
    credentials: TCredentials
    providerWorkerId: string
    fetchFn?: typeof fetch
  }): Promise<TalentWorkerSearchResult>
}
