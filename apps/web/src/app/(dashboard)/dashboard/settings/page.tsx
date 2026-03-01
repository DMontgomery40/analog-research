'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Key, Copy, Check, Trash2, Plus, Loader2, Bot, RotateCcw, Plug, Globe } from 'lucide-react'
import { NotificationChannelsSettings } from '@/components/settings/notification-channels-settings'
import { AgentPaymentPreferences } from '@/components/settings/agent-payment-preferences'
import { McpOauthLinkSettings } from '@/components/settings/mcp-oauth-link-settings'
import { formatSchemaParityError } from '@/lib/schema-parity-client'

interface ApiKey {
  id: string
  name: string
  key_prefix: string
  created_at: string
  last_used_at: string | null
  request_count: number
}

interface AutopilotRollbackOption {
  allowed: boolean
  type: string
  label: string
}

interface AutopilotAction {
  id: string
  action_type: string
  action_status: string
  created_at: string
  inputs: Record<string, unknown> | null
  decision: Record<string, unknown> | null
  result_ids: Record<string, unknown> | null
  rollback: AutopilotRollbackOption | null
}

interface ExternalProviderConfiguredEnv {
  env: 'live' | 'sandbox'
  configured: boolean
  credentials_mask: string | null
  updated_at: string | null
}

interface ExternalProviderCatalog {
  id: string
  displayName: string
  status: 'active' | 'planned'
  description: string
  supportedEnvs: Array<'live' | 'sandbox'>
  capabilities: Record<string, boolean>
  credentialFields: Array<{
    name: string
    label: string
    type: 'secret' | 'text'
    required: boolean
    description: string
  }>
  configured_envs: ExternalProviderConfiguredEnv[]
}

interface ProviderFormState {
  env: 'live' | 'sandbox'
  values: Record<string, string>
}

interface TalentProviderCatalogItem {
  id: string
  displayName: string
  status: 'active' | 'partner_onboarding' | 'researching'
  description: string
  supportedEnvs: Array<'live' | 'sandbox'>
  capabilities: Record<string, boolean>
  credentialFields: Array<{
    name: string
    label: string
    type: 'secret' | 'text'
    required: boolean
    description: string
  }>
  supportsColdOutreach: false
  configured_envs: Array<{
    env: string
    is_active: boolean
    credentials_mask: string | null
    updated_at: string | null
  }>
}

const actionLabels: Record<string, string> = {
  create_bounty: 'Create bounty',
  accept_application: 'Accept application',
  reject_application: 'Reject application',
  review_application: 'Review application',
  plan_created: 'Plan created',
  cancel_planned_action: 'Cancel planned action',
  disable_autopilot: 'Disable autopilot',
  rollback_action: 'Rollback action',
}

const statusLabels: Record<string, string> = {
  executed: 'Executed',
  failed: 'Failed',
  blocked: 'Blocked',
  requires_approval: 'Needs approval',
  planned: 'Planned',
  cancelled: 'Cancelled',
}

const statusStyles: Record<string, string> = {
  executed: 'bg-green-500/10 text-green-600',
  failed: 'bg-red-500/10 text-red-500',
  blocked: 'bg-muted text-muted-foreground',
  requires_approval: 'bg-amber-500/10 text-amber-600',
  planned: 'bg-blue-500/10 text-blue-600',
  cancelled: 'bg-muted text-muted-foreground',
}

const talentStatusStyles: Record<string, string> = {
  active: 'bg-green-500/10 text-green-600',
  partner_onboarding: 'bg-blue-500/10 text-blue-600',
  researching: 'bg-muted text-muted-foreground',
}

const talentStatusLabels: Record<string, string> = {
  active: 'Active',
  partner_onboarding: 'Onboarding',
  researching: 'Researching',
}

const formatShortId = (value: unknown) => {
  if (typeof value !== 'string') return null
  return value.length > 8 ? `${value.slice(0, 8)}…` : value
}

const formatActionDetail = (action: AutopilotAction) => {
  const parts: string[] = []
  const inputs = action.inputs ?? {}
  const resultIds = action.result_ids ?? {}

  const bountyId = inputs.bounty_id ?? resultIds.bounty_id
  const applicationId = inputs.application_id ?? resultIds.application_id
  const bookingId = resultIds.booking_id

  const bountyShort = formatShortId(bountyId)
  const applicationShort = formatShortId(applicationId)
  const bookingShort = formatShortId(bookingId)

  if (bountyShort) parts.push(`Bounty ${bountyShort}`)
  if (applicationShort) parts.push(`Application ${applicationShort}`)
  if (bookingShort) parts.push(`Booking ${bookingShort}`)

  return parts.join(' · ')
}

const formatActionTitle = (action: AutopilotAction) => {
  return actionLabels[action.action_type] || action.action_type.replace(/_/g, ' ')
}

const formatActionStatus = (action: AutopilotAction) => {
  return statusLabels[action.action_status] || action.action_status.replace(/_/g, ' ')
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [newKeyName, setNewKeyName] = useState('')
  const [generatedKey, setGeneratedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autopilotActions, setAutopilotActions] = useState<AutopilotAction[]>([])
  const [autopilotLoading, setAutopilotLoading] = useState(true)
  const [autopilotError, setAutopilotError] = useState<string | null>(null)
  const [rollbackingId, setRollbackingId] = useState<string | null>(null)

  const [integrationsError, setIntegrationsError] = useState<string | null>(null)
  const [providersLoading, setProvidersLoading] = useState(true)
  const [providerCatalog, setProviderCatalog] = useState<ExternalProviderCatalog[]>([])
  const [providerForms, setProviderForms] = useState<Record<string, ProviderFormState>>({})
  const [savingProviderId, setSavingProviderId] = useState<string | null>(null)
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null)
  const [providerTestResults, setProviderTestResults] = useState<Record<string, string | null>>({})

  const [talentError, setTalentError] = useState<string | null>(null)
  const [talentLoading, setTalentLoading] = useState(true)
  const [talentCatalog, setTalentCatalog] = useState<TalentProviderCatalogItem[]>([])
  const [talentForms, setTalentForms] = useState<Record<string, ProviderFormState>>({})
  const [talentSavingId, setTalentSavingId] = useState<string | null>(null)
  const [talentTestingId, setTalentTestingId] = useState<string | null>(null)
  const [talentTestResults, setTalentTestResults] = useState<Record<string, string | null>>({})

  const loadApiKeys = useCallback(async () => {
    try {
      const response = await fetch('/api/v1/keys')
      const result = await response.json()

      if (result.success) {
        setApiKeys(result.data)
      } else {
        setError(result.error || 'Failed to load API keys')
      }
    } catch {
      setError('Failed to load API keys')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadProviderCatalog = useCallback(async () => {
    setProvidersLoading(true)
    setIntegrationsError(null)

    try {
      const response = await fetch('/api/v1/integrations/providers')
      const result = await response.json()

      if (result.success) {
        const catalog = (result.data || []) as ExternalProviderCatalog[]
        setProviderCatalog(catalog)
        setProviderForms((prev) => {
          const next = { ...prev }
          for (const provider of catalog) {
            const fallbackEnv = provider.supportedEnvs.includes('live')
              ? 'live'
              : (provider.supportedEnvs[0] ?? 'live')
            const existing = next[provider.id]
            if (!existing) {
              next[provider.id] = {
                env: fallbackEnv,
                values: {},
              }
              continue
            }

            if (!provider.supportedEnvs.includes(existing.env)) {
              next[provider.id] = {
                ...existing,
                env: fallbackEnv,
              }
            }
          }
          return next
        })
      } else {
        setIntegrationsError(formatSchemaParityError(result, 'Failed to load integration providers'))
      }
    } catch {
      setIntegrationsError('Failed to load integration providers')
    } finally {
      setProvidersLoading(false)
    }
  }, [])

  const loadTalentCatalog = useCallback(async () => {
    setTalentLoading(true)
    setTalentError(null)

    try {
      const response = await fetch('/api/v1/talent-connectors/providers')
      const result = await response.json()

      if (result.success) {
        const catalog = (result.data || []) as TalentProviderCatalogItem[]
        setTalentCatalog(catalog)
        setTalentForms((prev) => {
          const next = { ...prev }
          for (const provider of catalog) {
            const fallbackEnv = provider.supportedEnvs.includes('live')
              ? 'live'
              : (provider.supportedEnvs[0] ?? 'live')
            if (!next[provider.id]) {
              next[provider.id] = { env: fallbackEnv, values: {} }
            }
          }
          return next
        })
      } else {
        setTalentError(formatSchemaParityError(result, 'Failed to load talent connectors'))
      }
    } catch {
      setTalentError('Failed to load talent connectors')
    } finally {
      setTalentLoading(false)
    }
  }, [])

  const loadAutopilotActions = useCallback(async () => {
    setAutopilotLoading(true)
    setAutopilotError(null)

    try {
      const response = await fetch('/api/v1/autopilot/actions?limit=12')
      const result = await response.json()

      if (result.success) {
        setAutopilotActions(result.data.actions || [])
      } else {
        setAutopilotError(formatSchemaParityError(result, 'Failed to load autopilot actions'))
      }
    } catch {
      setAutopilotError('Failed to load autopilot actions')
    } finally {
      setAutopilotLoading(false)
    }
  }, [])

  useEffect(() => {
    loadApiKeys()
  }, [loadApiKeys])

  useEffect(() => {
    loadAutopilotActions()
  }, [loadAutopilotActions])

  useEffect(() => {
    loadProviderCatalog()
  }, [loadProviderCatalog])

  useEffect(() => {
    loadTalentCatalog()
  }, [loadTalentCatalog])

  const getProviderEnvStatus = useCallback((providerId: string, env: 'live' | 'sandbox') => {
    const provider = providerCatalog.find((row) => row.id === providerId)
    if (!provider) {
      return {
        configured: false,
        credentials_mask: null,
        updated_at: null,
      }
    }

    return provider.configured_envs.find((row) => row.env === env) || {
      configured: false,
      credentials_mask: null,
      updated_at: null,
    }
  }, [providerCatalog])

  const getProviderFormState = useCallback((provider: ExternalProviderCatalog): ProviderFormState => {
    const fallbackEnv = provider.supportedEnvs.includes('live')
      ? 'live'
      : (provider.supportedEnvs[0] ?? 'live')

    return providerForms[provider.id] || {
      env: fallbackEnv,
      values: {},
    }
  }, [providerForms])

  const providerTestResultKey = useCallback((providerId: string, env: 'live' | 'sandbox') => {
    return `${providerId}:${env}`
  }, [])

  function updateProviderFormEnv(providerId: string, env: 'live' | 'sandbox') {
    setProviderForms((prev) => {
      const existing = prev[providerId] || { env: 'live' as const, values: {} }
      return {
        ...prev,
        [providerId]: {
          ...existing,
          env,
        },
      }
    })
  }

  function updateProviderCredentialValue(providerId: string, fieldName: string, value: string) {
    setProviderForms((prev) => {
      const existing = prev[providerId] || { env: 'live' as const, values: {} }
      return {
        ...prev,
        [providerId]: {
          ...existing,
          values: {
            ...existing.values,
            [fieldName]: value,
          },
        },
      }
    })
  }

  async function saveProviderIntegration(provider: ExternalProviderCatalog) {
    if (savingProviderId === provider.id) return

    const formState = getProviderFormState(provider)
    const credentials = Object.fromEntries(
      provider.credentialFields
        .map((field) => [field.name, (formState.values[field.name] || '').trim()])
        .filter(([, value]) => value.length > 0)
    )

    const missingFields = provider.credentialFields
      .filter((field) => field.required && !credentials[field.name])
      .map((field) => field.label)

    if (missingFields.length > 0) {
      setIntegrationsError(`${provider.displayName}: missing required fields (${missingFields.join(', ')})`)
      return
    }

    setSavingProviderId(provider.id)
    setIntegrationsError(null)
    setProviderTestResults((prev) => ({
      ...prev,
      [providerTestResultKey(provider.id, formState.env)]: null,
    }))

    try {
      const response = await fetch(`/api/v1/integrations/${provider.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          env: formState.env,
          credentials,
        }),
      })
      const result = await response.json()

      if (!result.success) {
        setIntegrationsError(formatSchemaParityError(result, `Failed to save ${provider.displayName} integration`))
        return
      }

      setProviderForms((prev) => {
        const existing = prev[provider.id] || { env: formState.env, values: {} }
        const nextValues = { ...existing.values }
        for (const field of provider.credentialFields) {
          if (field.type === 'secret') {
            nextValues[field.name] = ''
          }
        }
        return {
          ...prev,
          [provider.id]: {
            ...existing,
            values: nextValues,
          },
        }
      })

      await loadProviderCatalog()
    } catch {
      setIntegrationsError(`Failed to save ${provider.displayName} integration`)
    } finally {
      setSavingProviderId(null)
    }
  }

  async function testProviderIntegration(provider: ExternalProviderCatalog) {
    if (testingProviderId === provider.id) return

    const formState = getProviderFormState(provider)
    const testKey = providerTestResultKey(provider.id, formState.env)

    setTestingProviderId(provider.id)
    setIntegrationsError(null)
    setProviderTestResults((prev) => ({
      ...prev,
      [testKey]: null,
    }))

    try {
      const response = await fetch(`/api/v1/integrations/${provider.id}/verified?env=${formState.env}`, {
        method: 'POST',
      })
      const result = await response.json()

      if (!result.success) {
        setProviderTestResults((prev) => ({
          ...prev,
          [testKey]: formatSchemaParityError(result, 'Test failed'),
        }))
        return
      }

      setProviderTestResults((prev) => ({
        ...prev,
        [testKey]: 'Verified',
      }))
    } catch {
      setProviderTestResults((prev) => ({
        ...prev,
        [testKey]: 'Test failed',
      }))
    } finally {
      setTestingProviderId(null)
    }
  }

  function getTalentFormState(provider: TalentProviderCatalogItem): ProviderFormState {
    const fallbackEnv = provider.supportedEnvs.includes('live')
      ? 'live'
      : (provider.supportedEnvs[0] ?? 'live')
    return talentForms[provider.id] || { env: fallbackEnv, values: {} }
  }

  function getTalentEnvStatus(providerId: string, env: 'live' | 'sandbox') {
    const provider = talentCatalog.find((row) => row.id === providerId)
    const found = provider?.configured_envs.find((row) => row.env === env)
    return {
      configured: !!found?.is_active,
      credentials_mask: found?.credentials_mask ?? null,
    }
  }

  async function saveTalentCredentials(provider: TalentProviderCatalogItem) {
    if (talentSavingId === provider.id) return

    const formState = getTalentFormState(provider)
    const credentials = Object.fromEntries(
      provider.credentialFields
        .map((field) => [field.name, (formState.values[field.name] || '').trim()])
        .filter(([, value]) => value.length > 0)
    )

    const missingFields = provider.credentialFields
      .filter((field) => field.required && !credentials[field.name])
      .map((field) => field.label)

    if (missingFields.length > 0) {
      setTalentError(`${provider.displayName}: missing required fields (${missingFields.join(', ')})`)
      return
    }

    setTalentSavingId(provider.id)
    setTalentError(null)
    setTalentTestResults((prev) => ({ ...prev, [`${provider.id}:${formState.env}`]: null }))

    try {
      const response = await fetch(`/api/v1/talent-connectors/providers/${provider.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ env: formState.env, credentials }),
      })
      const result = await response.json()

      if (!result.success) {
        setTalentError(formatSchemaParityError(result, `Failed to save ${provider.displayName} credentials`))
        return
      }

      // Clear secret fields after save
      setTalentForms((prev) => {
        const existing = prev[provider.id] || { env: formState.env, values: {} }
        const nextValues = { ...existing.values }
        for (const field of provider.credentialFields) {
          if (field.type === 'secret') nextValues[field.name] = ''
        }
        return { ...prev, [provider.id]: { ...existing, values: nextValues } }
      })

      await loadTalentCatalog()
    } catch {
      setTalentError(`Failed to save ${provider.displayName} credentials`)
    } finally {
      setTalentSavingId(null)
    }
  }

  async function testTalentConnection(provider: TalentProviderCatalogItem) {
    if (talentTestingId === provider.id) return

    const formState = getTalentFormState(provider)
    const testKey = `${provider.id}:${formState.env}`

    setTalentTestingId(provider.id)
    setTalentError(null)
    setTalentTestResults((prev) => ({ ...prev, [testKey]: null }))

    try {
      const response = await fetch(`/api/v1/talent-connectors/providers/${provider.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ env: formState.env }),
      })
      const result = await response.json()

      setTalentTestResults((prev) => ({
        ...prev,
        [testKey]: result.success ? 'OK' : formatSchemaParityError(result, 'Test failed'),
      }))
    } catch {
      setTalentTestResults((prev) => ({ ...prev, [testKey]: 'Test failed' }))
    } finally {
      setTalentTestingId(null)
    }
  }

  async function generateKey() {
    if (generating) return

    setGenerating(true)
    setError(null)

    try {
      const response = await fetch('/api/v1/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName || 'Default' })
      })

      const result = await response.json()

      if (result.success) {
        setGeneratedKey(result.data.key)
        setNewKeyName('')
        // Reload the list to show the new key
        await loadApiKeys()
      } else {
        setError(result.error || 'Failed to generate API key')
      }
    } catch {
      setError('Failed to generate API key')
    } finally {
      setGenerating(false)
    }
  }

  async function revokeKey(keyId: string) {
    if (!confirm('Are you sure you want to revoke this API key? This action cannot be undone.')) {
      return
    }

    try {
      const response = await fetch(`/api/v1/keys/${keyId}`, {
        method: 'DELETE'
      })

      const result = await response.json()

      if (result.success) {
        setApiKeys(apiKeys.filter(k => k.id !== keyId))
      } else {
        setError(result.error || 'Failed to revoke API key')
      }
    } catch {
      setError('Failed to revoke API key')
    }
  }

  async function handleRollback(action: AutopilotAction) {
    if (!action.rollback?.allowed || rollbackingId) return

    const label = action.rollback.label || 'rollback'
    if (!confirm(`Proceed with ${label.toLowerCase()}?`)) {
      return
    }

    setRollbackingId(action.id)
    setAutopilotError(null)

    try {
      const response = await fetch(`/api/v1/autopilot/actions/${action.id}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rollback_type: action.rollback.type }),
      })

      const result = await response.json()

      if (!result.success) {
        setAutopilotError(result.error || 'Rollback failed')
      } else {
        await loadAutopilotActions()
      }
    } catch {
      setAutopilotError('Rollback failed')
    } finally {
      setRollbackingId(null)
    }
  }

  async function copyKey() {
    if (generatedKey) {
      await navigator.clipboard.writeText(generatedKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  function formatDate(dateString: string | null) {
    if (!dateString) return 'Never'
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const activeFieldCheckProviders = providerCatalog.filter((provider) => {
    return provider.status === 'active' && provider.capabilities.create_field_check
  })

  const configuredFieldCheckProviderCount = activeFieldCheckProviders.filter((provider) => {
    return provider.configured_envs.some((env) => env.configured)
  }).length

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account settings</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-sm underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* API Keys Section */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Key className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold">API Keys</h2>
            <p className="text-sm text-muted-foreground">
              For ResearchAgent (AI agent) integration via REST API or MCP server
            </p>
          </div>
        </div>

        <div className="p-4 bg-muted/50 rounded-lg mb-4">
          <p className="text-sm text-muted-foreground">
            API keys authenticate your <strong>ResearchAgent (AI agent identity)</strong> to the Analog Research API.
            Generate a key here and use it with the MCP server or REST API to create bounties,
            browse humans, and manage bookings programmatically.
          </p>
        </div>

        {generatedKey && (
          <div className="mb-6 p-4 bg-primary/10 border border-primary/20 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-primary">New API Key Generated</span>
              <span className="text-xs text-muted-foreground">Copy now - won&apos;t be shown again</span>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-background p-2 rounded text-sm font-mono overflow-x-auto">
                {generatedKey}
              </code>
              <button
                onClick={copyKey}
                className="p-2 hover:bg-accent rounded-md transition-colors"
                title="Copy to clipboard"
              >
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-2 mb-6">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key name (e.g., Production)"
            className="flex-1 px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            onKeyDown={(e) => {
              if (e.key === 'Enter') generateKey()
            }}
          />
          <button
            onClick={generateKey}
            disabled={generating}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Generate Key
              </>
            )}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : apiKeys.length > 0 ? (
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground mb-2">
              {apiKeys.length} active key{apiKeys.length !== 1 ? 's' : ''}
            </div>
            {apiKeys.map((key) => (
              <div key={key.id} className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted/50 transition-colors">
                <div>
                  <div className="font-medium">{key.name}</div>
                  <div className="text-sm text-muted-foreground">
                    <code className="bg-muted px-1 rounded">{key.key_prefix}...</code>
                    {' '}&middot;{' '}
                    Created {formatDate(key.created_at)}
                    {key.last_used_at && (
                      <> &middot; Last used {formatDate(key.last_used_at)}</>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    {key.request_count.toLocaleString()} requests
                  </span>
                  <button
                    onClick={() => revokeKey(key.id)}
                    className="p-2 hover:bg-destructive/10 hover:text-destructive rounded-md transition-colors"
                    title="Revoke key"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Key className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No API keys yet</p>
            <p className="text-sm">Generate your first key to start integrating AI agents</p>
          </div>
        )}
      </div>

      <NotificationChannelsSettings />
      <AgentPaymentPreferences />
      <McpOauthLinkSettings />

      {/* External Integrations */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <Plug className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="font-semibold">External Integrations</h2>
            <p className="text-sm text-muted-foreground">
              Configure fulfillment providers so your ResearchAgent can order work off-platform.
            </p>
          </div>
        </div>

        <div className="mb-4 p-4 bg-muted/50 rounded-lg">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Field-check providers configured: <span className="font-medium text-foreground">{configuredFieldCheckProviderCount}</span> / {activeFieldCheckProviders.length}
            </p>
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard/field-checks"
                className="inline-flex items-center justify-center px-3 py-1.5 border border-border rounded-md text-sm font-medium hover:bg-accent transition-colors"
              >
                Open Field Checks
              </Link>
              <Link
                href="/dashboard/bounties"
                className="inline-flex items-center justify-center px-3 py-1.5 border border-border rounded-md text-sm font-medium hover:bg-accent transition-colors"
              >
                Open Bounties
              </Link>
            </div>
          </div>
        </div>

        {integrationsError && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
            {integrationsError}
          </div>
        )}

        {providersLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : providerCatalog.length === 0 ? (
          <div className="p-4 border border-border rounded-lg text-sm text-muted-foreground">
            No providers available yet.
          </div>
        ) : (
          <div className="space-y-4">
            {providerCatalog.map((provider) => {
              const liveStatus = getProviderEnvStatus(provider.id, 'live')
              const sandboxStatus = getProviderEnvStatus(provider.id, 'sandbox')
              const liveMask = liveStatus.credentials_mask
              const sandboxMask = sandboxStatus.credentials_mask
              const formState = getProviderFormState(provider)
              const testResult = providerTestResults[providerTestResultKey(provider.id, formState.env)]
              const providerIsBusy = savingProviderId === provider.id || testingProviderId === provider.id

              return (
                <div key={provider.id} className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{provider.displayName}</p>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${provider.status === 'active' ? 'bg-green-500/10 text-green-600' : 'bg-amber-500/10 text-amber-600'}`}>
                          {provider.status}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {provider.description}
                      </p>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground mt-2 space-y-1">
                    <div>
                      Live credentials: {liveMask ? <code className="bg-muted px-1 rounded">{liveMask}</code> : 'Not configured'}
                    </div>
                    <div>
                      Sandbox credentials: {sandboxMask ? <code className="bg-muted px-1 rounded">{sandboxMask}</code> : 'Not configured'}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-3">
                    {Object.entries(provider.capabilities).map(([capability, enabled]) => (
                      <span key={`${provider.id}-${capability}`} className={`px-2 py-0.5 rounded text-xs ${enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                        {capability.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>

                  <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-border/60">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <select
                        value={formState.env}
                        onChange={(e) => updateProviderFormEnv(provider.id, e.target.value === 'sandbox' ? 'sandbox' : 'live')}
                        className="px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        {provider.supportedEnvs.map((env) => (
                          <option key={`${provider.id}-${env}`} value={env}>
                            {env === 'live' ? 'Live' : 'Sandbox'}
                          </option>
                        ))}
                      </select>

                      <div className="text-xs text-muted-foreground px-1 py-2">
                        Selected env status:{' '}
                        {getProviderEnvStatus(provider.id, formState.env).configured ? 'configured' : 'not configured'}
                      </div>
                    </div>

                    <div className="grid gap-3">
                      {provider.credentialFields.map((field) => (
                        <div key={`${provider.id}-${field.name}`} className="space-y-1">
                          <label className="text-xs font-medium text-foreground">
                            {field.label}
                            {field.required ? ' *' : ''}
                          </label>
                          <input
                            type={field.type === 'secret' ? 'password' : 'text'}
                            value={formState.values[field.name] || ''}
                            onChange={(e) => updateProviderCredentialValue(provider.id, field.name, e.target.value)}
                            placeholder={`${provider.displayName} ${field.label}`}
                            className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                          <p className="text-xs text-muted-foreground">{field.description}</p>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        onClick={() => saveProviderIntegration(provider)}
                        disabled={providerIsBusy}
                        className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {savingProviderId === provider.id ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          'Save Credentials'
                        )}
                      </button>
                      <button
                        onClick={() => testProviderIntegration(provider)}
                        disabled={providerIsBusy || !provider.capabilities.test_connection}
                        className="inline-flex items-center justify-center gap-2 border border-border px-4 py-2 rounded-md font-medium hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {testingProviderId === provider.id ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Verifying...
                          </>
                        ) : (
                          'Verify Connection'
                        )}
                      </button>
                      {testResult && (
                        <div className={`px-3 py-2 rounded-md text-sm ${testResult === 'Verified' ? 'bg-green-500/10 text-green-600' : 'bg-destructive/10 text-destructive'}`}>
                          {testResult}
                        </div>
                      )}
                    </div>

                    {provider.id === 'proxypics' && (
                      <div className="text-xs text-muted-foreground">
                        ProxyPics webhooks (optional): configure your ProxyPics account to call our endpoints with a `token` query param.
                        Live: <code className="bg-muted px-1 rounded">/api/v1/webhooks/proxypics/live?token=...</code>
                        {' '}Sandbox: <code className="bg-muted px-1 rounded">/api/v1/webhooks/proxypics/sandbox?token=...</code>
                      </div>
                    )}

                    {provider.status !== 'active' && (
                      <div className="text-xs text-muted-foreground">
                        Provider scaffold is in place. Runtime actions remain disabled until this provider is fully onboarded.
                      </div>
                    )}

                    {!provider.capabilities.test_connection && (
                      <div className="text-xs text-muted-foreground">
                        This provider does not expose automated verification yet.
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Talent Connectors */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
            <Globe className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h2 className="font-semibold">Talent Connectors</h2>
            <p className="text-sm text-muted-foreground">
              Connect external talent networks so your ResearchAgent can discover and engage workers from partner platforms.
            </p>
          </div>
        </div>

        <div className="mb-4 p-4 bg-muted/50 rounded-lg">
          <p className="text-sm text-muted-foreground">
            Talent connectors enable your ResearchAgent to search workers on partner platforms, create matches, and coordinate tasks.
            Cold outreach is <strong>never</strong> permitted — all contact must go through platform-sanctioned channels.
          </p>
        </div>

        {talentError && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
            {talentError}
            <button onClick={() => setTalentError(null)} className="ml-2 text-sm underline">Dismiss</button>
          </div>
        )}

        {talentLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : talentCatalog.length === 0 ? (
          <div className="p-4 border border-border rounded-lg text-sm text-muted-foreground">
            No talent connector providers available yet.
          </div>
        ) : (
          <div className="space-y-4">
            {talentCatalog.map((provider) => {
              const formState = getTalentFormState(provider)
              const liveStatus = getTalentEnvStatus(provider.id, 'live')
              const sandboxStatus = getTalentEnvStatus(provider.id, 'sandbox')
              const testResult = talentTestResults[`${provider.id}:${formState.env}`]
              const isBusy = talentSavingId === provider.id || talentTestingId === provider.id
              const hasCredFields = provider.credentialFields.length > 0

              return (
                <div key={provider.id} className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{provider.displayName}</p>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${talentStatusStyles[provider.status] || 'bg-muted text-muted-foreground'}`}>
                          {talentStatusLabels[provider.status] || provider.status}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{provider.description}</p>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground mt-2 space-y-1">
                    <div>
                      Live credentials: {liveStatus.credentials_mask ? <code className="bg-muted px-1 rounded">{liveStatus.credentials_mask}</code> : 'Not configured'}
                    </div>
                    <div>
                      Sandbox credentials: {sandboxStatus.credentials_mask ? <code className="bg-muted px-1 rounded">{sandboxStatus.credentials_mask}</code> : 'Not configured'}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-3">
                    {Object.entries(provider.capabilities).map(([capability, enabled]) => (
                      <span key={`${provider.id}-${capability}`} className={`px-2 py-0.5 rounded text-xs ${enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                        {capability.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>

                  {hasCredFields && (
                    <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-border/60">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <select
                          value={formState.env}
                          onChange={(e) => setTalentForms((prev) => ({
                            ...prev,
                            [provider.id]: { ...(prev[provider.id] || { env: 'live', values: {} }), env: e.target.value as 'live' | 'sandbox' },
                          }))}
                          className="px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          {provider.supportedEnvs.map((env) => (
                            <option key={`${provider.id}-${env}`} value={env}>
                              {env === 'live' ? 'Live' : 'Sandbox'}
                            </option>
                          ))}
                        </select>
                        <div className="text-xs text-muted-foreground px-1 py-2">
                          Selected env status:{' '}
                          {getTalentEnvStatus(provider.id, formState.env).configured ? 'configured' : 'not configured'}
                        </div>
                      </div>

                      <div className="grid gap-3">
                        {provider.credentialFields.map((field) => (
                          <div key={`${provider.id}-${field.name}`} className="space-y-1">
                            <label className="text-xs font-medium text-foreground">
                              {field.label}{field.required ? ' *' : ''}
                            </label>
                            <input
                              type={field.type === 'secret' ? 'password' : 'text'}
                              value={formState.values[field.name] || ''}
                              onChange={(e) => setTalentForms((prev) => {
                                const existing = prev[provider.id] || { env: formState.env, values: {} }
                                return {
                                  ...prev,
                                  [provider.id]: { ...existing, values: { ...existing.values, [field.name]: e.target.value } },
                                }
                              })}
                              placeholder={`${provider.displayName} ${field.label}`}
                              className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                            <p className="text-xs text-muted-foreground">{field.description}</p>
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2">
                        <button
                          onClick={() => saveTalentCredentials(provider)}
                          disabled={isBusy}
                          className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {talentSavingId === provider.id ? (
                            <><Loader2 className="w-4 h-4 animate-spin" />Saving...</>
                          ) : (
                            'Save Credentials'
                          )}
                        </button>
                        <button
                          onClick={() => testTalentConnection(provider)}
                          disabled={isBusy || !provider.capabilities.test_connection}
                          className="inline-flex items-center justify-center gap-2 border border-border px-4 py-2 rounded-md font-medium hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {talentTestingId === provider.id ? (
                            <><Loader2 className="w-4 h-4 animate-spin" />Testing...</>
                          ) : (
                            'Test Connection'
                          )}
                        </button>
                        {testResult && (
                          <div className={`px-3 py-2 rounded-md text-sm ${testResult === 'OK' ? 'bg-green-500/10 text-green-600' : 'bg-destructive/10 text-destructive'}`}>
                            {testResult}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {provider.status !== 'active' && (
                    <div className="text-xs text-muted-foreground mt-3">
                      {provider.status === 'partner_onboarding'
                        ? 'Partner onboarding in progress. Runtime actions remain disabled until partnership is finalized.'
                        : 'This provider is being researched. No actions are available yet.'}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Autopilot Activity */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <Bot className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="font-semibold">Autopilot Activity</h2>
            <p className="text-sm text-muted-foreground">
              Recent autonomous actions from your ResearchAgent autopilot.
            </p>
          </div>
        </div>

        {autopilotError && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
            {autopilotError}
          </div>
        )}

        {autopilotLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : autopilotActions.length > 0 ? (
          <div className="space-y-3">
            {autopilotActions.map((action) => {
              const detail = formatActionDetail(action)
              const statusLabel = formatActionStatus(action)
              const statusClass = statusStyles[action.action_status] || 'bg-muted text-muted-foreground'
              const canRollback = Boolean(action.rollback?.allowed)

              return (
                <div
                  key={action.id}
                  className="flex flex-col gap-3 border border-border rounded-lg p-4 bg-background"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium">{formatActionTitle(action)}</p>
                      {detail && (
                        <p className="text-xs text-muted-foreground mt-1">{detail}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(action.created_at).toLocaleString()}
                      </p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusClass}`}>
                      {statusLabel}
                    </span>
                  </div>
                  {canRollback && action.rollback && (
                    <div className="flex justify-end">
                      <button
                        onClick={() => handleRollback(action)}
                        disabled={rollbackingId === action.id}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium border border-border rounded-md hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {rollbackingId === action.id ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Working...
                          </>
                        ) : (
                          <>
                            <RotateCcw className="w-4 h-4" />
                            {action.rollback.label}
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Bot className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No autopilot actions yet</p>
            <p className="text-sm">Autopilot activity will appear here once enabled.</p>
          </div>
        )}
      </div>

      {/* Account Settings */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="font-semibold mb-4">Account</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Email Notifications
              <span className="ml-2 text-xs text-muted-foreground">(Coming Soon)</span>
            </label>
            <div className="space-y-2 opacity-50 pointer-events-none">
              <label className="flex items-center gap-3">
                <input type="checkbox" defaultChecked className="rounded" disabled />
                <span className="text-sm">New booking requests</span>
              </label>
              <label className="flex items-center gap-3">
                <input type="checkbox" defaultChecked className="rounded" disabled />
                <span className="text-sm">New messages</span>
              </label>
              <label className="flex items-center gap-3">
                <input type="checkbox" defaultChecked className="rounded" disabled />
                <span className="text-sm">Payment updates</span>
              </label>
            </div>
          </div>

          <div className="pt-4 border-t border-border">
            <h3 className="font-medium text-destructive mb-2">Danger Zone</h3>
            <button
              className="px-4 py-2 border border-destructive text-destructive rounded-md opacity-50 cursor-not-allowed"
              disabled
              title="Account deletion coming soon"
            >
              Delete Account
            </button>
            <p className="text-xs text-muted-foreground mt-1">Account deletion coming soon</p>
          </div>
        </div>
      </div>
    </div>
  )
}
