'use client'

import { useState, useEffect } from 'react'
import { Loader2, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react'

interface PaymentsPauseConfig {
  paymentsPaused: boolean
  pauseReason: string | null
  pausedAt: string | null
  resumedAt: string | null
  updatedBy: string | null
  updatedAt: string | null
}

export default function AdminPaymentsConfigPage() {
  const [config, setConfig] = useState<PaymentsPauseConfig | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pauseReason, setPauseReason] = useState('')
  const [confirmingAction, setConfirmingAction] = useState<'pause' | 'resume' | null>(null)

  const fetchConfig = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/admin/payments/config')
      const data = await res.json()
      if (!data.success) {
        setError(data.error || 'Failed to fetch config')
        return
      }
      setConfig(data.data)
      setPauseReason(data.data?.pauseReason || '')
    } catch {
      setError('Failed to fetch config')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchConfig()
  }, [])

  const handleToggle = async (newPaused: boolean) => {
    if (!config) return
    setIsSaving(true)
    setError(null)
    setSuccess(null)
    setConfirmingAction(null)

    try {
      const res = await fetch('/api/v1/admin/payments/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentsPaused: newPaused,
          pauseReason: newPaused ? (pauseReason.trim() || null) : null,
        }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error || 'Failed to update config')
        return
      }
      setConfig(data.data)
      setPauseReason(data.data?.pauseReason || '')
      setSuccess(newPaused ? 'Payments are now PAUSED.' : 'Payments are now ACTIVE.')
    } catch {
      setError('Failed to update config')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const isPaused = config?.paymentsPaused ?? false

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Payments Control</h1>
          <p className="text-muted-foreground">
            Pause or resume all escrow funding and booking completion.
          </p>
        </div>
        <button
          onClick={fetchConfig}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-3 py-2 border border-border rounded-md text-sm hover:bg-accent transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4 text-green-700 dark:text-green-400">
          {success}
        </div>
      )}

      {/* Big status card */}
      <div
        className={`rounded-xl border-2 p-8 text-center ${
          isPaused
            ? 'border-red-500 bg-red-50 dark:bg-red-950/20'
            : 'border-green-500 bg-green-50 dark:bg-green-950/20'
        }`}
      >
        <div className="flex justify-center mb-4">
          {isPaused ? (
            <ShieldAlert className="w-16 h-16 text-red-500" />
          ) : (
            <ShieldCheck className="w-16 h-16 text-green-500" />
          )}
        </div>
        <h2 className={`text-3xl font-bold mb-2 ${isPaused ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>
          {isPaused ? 'PAYMENTS PAUSED' : 'PAYMENTS ACTIVE'}
        </h2>
        <p className="text-muted-foreground">
          {isPaused
            ? 'No escrow funding or booking completion is allowed.'
            : 'Escrow funding and booking completion are operating normally.'}
        </p>

        {isPaused && config?.pauseReason && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">
            Reason: {config.pauseReason}
          </p>
        )}
      </div>

      {/* Pause reason input (shown when about to pause or already paused) */}
      {(!isPaused || confirmingAction === 'pause') && (
        <div>
          <label className="block text-sm font-medium mb-2">
            Pause reason (optional, shown to users)
          </label>
          <input
            type="text"
            value={pauseReason}
            onChange={(e) => setPauseReason(e.target.value)}
            placeholder="e.g. Upgrading infrastructure, scaling for traffic spike"
            className="w-full px-3 py-2 border border-border rounded-md bg-background"
            maxLength={500}
          />
        </div>
      )}

      {/* Toggle button with confirmation */}
      {confirmingAction ? (
        <div className={`rounded-lg border p-4 ${
          confirmingAction === 'pause'
            ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/20'
            : 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/20'
        }`}>
          <p className="font-medium mb-3">
            {confirmingAction === 'pause'
              ? 'Are you sure you want to pause ALL payments?'
              : 'Are you sure you want to resume payments?'}
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            {confirmingAction === 'pause'
              ? 'This will immediately block escrow funding (Stripe + Coinbase) and booking completion for all users and API clients.'
              : 'This will re-enable escrow funding and booking completion for all users and API clients.'}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleToggle(confirmingAction === 'pause')}
              disabled={isSaving}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white transition-colors disabled:opacity-50 ${
                confirmingAction === 'pause'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              {confirmingAction === 'pause' ? 'Yes, pause payments' : 'Yes, resume payments'}
            </button>
            <button
              onClick={() => setConfirmingAction(null)}
              disabled={isSaving}
              className="px-4 py-2 border border-border rounded-md text-sm hover:bg-accent transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setConfirmingAction(isPaused ? 'resume' : 'pause')}
          disabled={isSaving}
          className={`w-full py-4 rounded-xl text-lg font-bold transition-colors disabled:opacity-50 ${
            isPaused
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-red-600 hover:bg-red-700 text-white'
          }`}
        >
          {isPaused ? 'Resume Payments' : 'Pause All Payments'}
        </button>
      )}

      {/* Metadata */}
      {config && (config.pausedAt || config.resumedAt || config.updatedBy) && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-2 text-sm">
          <h3 className="font-semibold">History</h3>
          {config.updatedBy && (
            <p className="text-muted-foreground">
              Last changed by: <span className="font-medium text-foreground">{config.updatedBy}</span>
            </p>
          )}
          {config.updatedAt && (
            <p className="text-muted-foreground">
              Last changed: <span className="font-medium text-foreground">{new Date(config.updatedAt).toLocaleString()}</span>
            </p>
          )}
          {config.pausedAt && (
            <p className="text-muted-foreground">
              Last paused: <span className="font-medium text-foreground">{new Date(config.pausedAt).toLocaleString()}</span>
            </p>
          )}
          {config.resumedAt && (
            <p className="text-muted-foreground">
              Last resumed: <span className="font-medium text-foreground">{new Date(config.resumedAt).toLocaleString()}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
