import type { ExternalJobStatus } from './types'

export interface WeGoLookCredentials {
  apiKey: string
}

export function mapWeGoLookStatusToExternalJobStatus(_status: string | null | undefined): ExternalJobStatus {
  // TODO: implement once partner API docs are available.
  return 'in_progress'
}

