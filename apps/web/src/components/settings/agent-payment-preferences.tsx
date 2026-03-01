'use client'

import { useEffect, useState } from 'react'
import { CreditCard, Loader2, Save } from 'lucide-react'
import { formatSchemaParityError } from '@/lib/schema-parity-client'

type PaymentMethod = 'stripe' | 'crypto' | null

export function AgentPaymentPreferences() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [defaultPaymentMethod, setDefaultPaymentMethod] = useState<PaymentMethod>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadPreferences() {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch('/api/v1/agent/preferences')
        const payload = await response.json()
        if (!response.ok || !payload.success) {
          if (!cancelled) {
            setError(formatSchemaParityError(payload, 'Failed to load ResearchAgent preferences'))
          }
          return
        }

        if (!cancelled) {
          setDefaultPaymentMethod(payload.data?.default_payment_method || null)
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load ResearchAgent preferences')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadPreferences()
    return () => {
      cancelled = true
    }
  }, [])

  const savePreferences = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch('/api/v1/agent/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_payment_method: defaultPaymentMethod }),
      })
      const payload = await response.json()
      if (!response.ok || !payload.success) {
        setError(formatSchemaParityError(payload, 'Failed to save ResearchAgent preferences'))
        return
      }
      setSuccess('Default payment rail updated.')
    } catch {
      setError('Failed to save ResearchAgent preferences')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
          <CreditCard className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <h2 className="font-semibold">ResearchAgent Payment Defaults</h2>
          <p className="text-sm text-muted-foreground">
            Used when creating bounties without an explicit payment rail.
          </p>
        </div>
      </div>

      {error && <div className="mb-4 p-3 text-sm rounded-md border border-destructive/30 bg-destructive/10 text-destructive">{error}</div>}
      {success && <div className="mb-4 p-3 text-sm rounded-md border border-green-500/30 bg-green-500/10 text-green-600">{success}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          <label className="block text-sm">
            <span className="block mb-1 text-muted-foreground">Default payment rail</span>
            <select
              value={defaultPaymentMethod || ''}
              onChange={(event) => {
                const value = event.target.value
                setDefaultPaymentMethod(value ? (value as PaymentMethod) : null)
              }}
              className="w-full max-w-sm px-3 py-2 bg-background border border-input rounded-md"
            >
              <option value="">No default (decide per bounty)</option>
              <option value="stripe">Stripe (USD)</option>
              <option value="crypto">Crypto (Coinbase)</option>
            </select>
          </label>

          <button
            onClick={savePreferences}
            disabled={saving}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save preference
          </button>
        </div>
      )}
    </div>
  )
}
