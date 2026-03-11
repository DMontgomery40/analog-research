import { decryptIntegrationCredentials } from '@/lib/integrations-secrets'
import { getExternalProviderPlugin } from '@/lib/external-jobs/providers/registry'
import type { ExternalProvider, ExternalProviderEnv } from '@/lib/external-jobs/types'

interface VerifyProviderConnectionParams {
  serviceClient: any
  actingAgentId: string
  provider: ExternalProvider
  env: ExternalProviderEnv
}

export type VerifyProviderConnectionResult =
  | {
      ok: true
      verifiedAt: string
    }
  | {
      ok: false
      status: number
      error: string
      operatorHint: string
    }

/**
 * Verifies an integration configuration by loading active credentials and
 * running the provider's runtime test_connection capability.
 */
export async function verifyProviderConnection(
  params: VerifyProviderConnectionParams
): Promise<VerifyProviderConnectionResult> {
  const { serviceClient, actingAgentId, provider, env } = params

  const { data: integration, error } = await serviceClient
    .from('external_integrations')
    .select('credentials_encrypted')
    .eq('agent_id', actingAgentId)
    .eq('provider', provider)
    .eq('env', env)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    return {
      ok: false,
      status: 500,
      error: error.message,
      operatorHint:
        'verifyProviderConnection -> external_integrations maybeSingle for actingAgentId/provider/env',
    }
  }

  if (!integration) {
    return {
      ok: false,
      status: 404,
      error: `Integration not configured for ${provider} (${env})`,
      operatorHint:
        'verifyProviderConnection expected an active external_integrations row for actingAgentId/provider/env',
    }
  }

  const plugin = getExternalProviderPlugin(provider)
  if (!plugin.testConnection) {
    return {
      ok: false,
      status: 501,
      error: `Provider ${provider} does not support test_connection yet`,
      operatorHint:
        'verifyProviderConnection reached provider plugin without testConnection implementation',
    }
  }

  let decrypted: unknown
  try {
    decrypted = decryptIntegrationCredentials<unknown>(integration.credentials_encrypted)
  } catch {
    return {
      ok: false,
      status: 500,
      error: `Stored integration credentials for ${provider} could not be decrypted`,
      operatorHint:
        'verifyProviderConnection -> decryptIntegrationCredentials could not decode stored credentials',
    }
  }

  const validation = plugin.validateCredentials(decrypted)
  if (!validation.ok) {
    return {
      ok: false,
      status: 400,
      error: validation.error,
      operatorHint:
        'verifyProviderConnection decrypted credentials then plugin.validateCredentials rejected the stored shape',
    }
  }

  try {
    await plugin.testConnection({
      env,
      credentials: validation.credentials,
    })
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : `Failed to contact ${provider}`,
      operatorHint:
        'verifyProviderConnection -> plugin.testConnection rejected provider credentials or upstream reachability',
    }
  }

  return {
    ok: true,
    verifiedAt: new Date().toISOString(),
  }
}
