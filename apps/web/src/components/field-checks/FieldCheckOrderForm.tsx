'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'

import {
  listAvailableFieldCheckProviders,
  resolveFieldCheckProviderSelection,
  type ExternalProviderCatalogEntry,
} from '@/lib/external-jobs/provider-ui'
import { formatSchemaParityError } from '@/lib/schema-parity-client'

interface FieldCheckOrderFormProps {
  linkedRecordIds?: {
    bounty_id?: string
    booking_id?: string
    application_id?: string
    conversation_id?: string
  }
  initialProviderEnv?: 'live' | 'sandbox'
  submitLabel?: string
  addressPlaceholder?: string
  instructionsPlaceholder?: string
  helperText?: string
  onCreated?: (jobId: string) => Promise<void> | void
  onError?: (message: string | null) => void
}

interface CreateJobResponse {
  success: boolean
  error?: string
  data?: {
    id: string
  }
}

interface ProviderCatalogResponse {
  success: boolean
  error?: string
  data?: ExternalProviderCatalogEntry[]
}

export function FieldCheckOrderForm({
  linkedRecordIds,
  initialProviderEnv = 'live',
  submitLabel = 'Order Field Check',
  addressPlaceholder = 'Address (street, city, state, zip)',
  instructionsPlaceholder = 'Instructions (what to verify + what photos you need)',
  helperText,
  onCreated,
  onError,
}: FieldCheckOrderFormProps) {
  const [providersLoading, setProvidersLoading] = useState(true)
  const [providerCatalog, setProviderCatalog] = useState<ExternalProviderCatalogEntry[]>([])
  const [providerEnv, setProviderEnv] = useState<'live' | 'sandbox'>(initialProviderEnv)
  const [selectedProviderId, setSelectedProviderId] = useState('')

  const [creating, setCreating] = useState(false)
  const [address, setAddress] = useState('')
  const [instructions, setInstructions] = useState('')
  const [templateToken, setTemplateToken] = useState('')
  const [error, setError] = useState<string | null>(null)

  const loadProviderCatalog = useCallback(async () => {
    setProvidersLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/v1/integrations/providers')
      const result = await response.json() as ProviderCatalogResponse

      if (!response.ok || !result.success) {
        setError(formatSchemaParityError(result, 'Failed to load integration providers'))
        return
      }

      setProviderCatalog(result.data || [])
    } catch {
      setError('Failed to load integration providers')
    } finally {
      setProvidersLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProviderCatalog()
  }, [loadProviderCatalog])

  const availableProviders = useMemo(() => {
    return listAvailableFieldCheckProviders(providerCatalog, providerEnv)
  }, [providerCatalog, providerEnv])

  const selectedProvider = useMemo(() => {
    return availableProviders.find((provider) => provider.id === selectedProviderId) || null
  }, [availableProviders, selectedProviderId])

  useEffect(() => {
    const nextProviderId = resolveFieldCheckProviderSelection({
      providerCatalog,
      providerEnv,
      selectedProviderId,
    })

    if (nextProviderId !== selectedProviderId) {
      setSelectedProviderId(nextProviderId)
    }
  }, [providerCatalog, providerEnv, selectedProviderId])

  async function createFieldCheck() {
    if (creating) return

    if (!address.trim() || !instructions.trim()) {
      const message = 'Address and instructions are required'
      setError(message)
      onError?.(message)
      return
    }

    if (!selectedProviderId) {
      const message = `No active provider configured for ${providerEnv}. Configure credentials in Settings first.`
      setError(message)
      onError?.(message)
      return
    }

    setCreating(true)
    setError(null)
    onError?.(null)

    try {
      const response = await fetch('/api/v1/external-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'field_check',
          address: address.trim(),
          instructions: instructions.trim(),
          provider: selectedProviderId,
          provider_env: providerEnv,
          public_only: true,
          auto_approve: true,
          template_token: templateToken.trim() || null,
          ...linkedRecordIds,
        }),
      })
      const result = await response.json() as CreateJobResponse

      if (!response.ok || !result.success || !result.data?.id) {
        const message = formatSchemaParityError(result, 'Failed to create field check')
        setError(message)
        onError?.(message)
        return
      }

      setAddress('')
      setInstructions('')
      setTemplateToken('')

      await onCreated?.(result.data.id)
    } catch {
      const message = 'Failed to create field check'
      setError(message)
      onError?.(message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
          {error}
        </div>
      )}

      {!providersLoading && availableProviders.length === 0 && (
        <div className="p-3 border border-border rounded-lg text-sm text-muted-foreground">
          No active field-check providers configured for {providerEnv}.{' '}
          <Link href="/dashboard/settings" className="text-primary hover:underline">
            Configure integrations
          </Link>
          .
        </div>
      )}

      {helperText && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}

      {selectedProvider && (
        <div className="text-xs text-muted-foreground">
          Selected provider: {selectedProvider.displayName}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <select
          value={providerEnv}
          onChange={(e) => setProviderEnv(e.target.value === 'sandbox' ? 'sandbox' : 'live')}
          className="px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="live">Live</option>
          <option value="sandbox">Sandbox</option>
        </select>
        <select
          value={selectedProviderId}
          onChange={(e) => setSelectedProviderId(e.target.value)}
          disabled={providersLoading || availableProviders.length === 0}
          className="px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        >
          {availableProviders.length === 0 ? (
            <option value="">No configured providers</option>
          ) : (
            availableProviders.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.displayName}
              </option>
            ))
          )}
        </select>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={addressPlaceholder}
          className="flex-1 px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <input
        value={templateToken}
        onChange={(e) => setTemplateToken(e.target.value)}
        placeholder="Optional provider template token (if supported)"
        className="px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
      />

      <textarea
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder={instructionsPlaceholder}
        className="min-h-[120px] px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
      />

      <button
        onClick={createFieldCheck}
        disabled={creating || providersLoading || !selectedProviderId}
        className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {creating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Ordering...
          </>
        ) : (
          submitLabel
        )}
      </button>
    </div>
  )
}
