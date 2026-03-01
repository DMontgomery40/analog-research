'use client'

import { useEffect, useState } from 'react'
import { Button } from '@analoglabor/ui'
import { Save, Loader2, RefreshCw } from 'lucide-react'

interface ModerationConfig {
  provider: string
  modelPrimary: string
  modelEscalation: string
  timeoutMs: number
  failConfidence: number
  warnConfidence: number
  maxInputChars: number
  dailyTokenBudget: number
  policyVersion: string
}

interface ConfigResponse {
  success: boolean
  data?: ModerationConfig
  error?: string
}

export default function AdminModerationConfigPage() {
  const [config, setConfig] = useState<ModerationConfig | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const fetchConfig = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/v1/admin/moderation/config')
      const data: ConfigResponse = await res.json()

      if (!data.success) {
        setError(data.error || 'Failed to fetch config')
        return
      }

      setConfig(data.data || null)
    } catch {
      setError('Failed to fetch config')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchConfig()
  }, [])

  const handleSave = async () => {
    if (!config) return

    setIsSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch('/api/v1/admin/moderation/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      const data: ConfigResponse = await res.json()

      if (!data.success) {
        setError(data.error || 'Failed to save config')
        return
      }

      setSuccess('Configuration saved successfully')
      setConfig(data.data || null)
    } catch {
      setError('Failed to save config')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    )
  }

  if (!config) {
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
          {error || 'Failed to load configuration'}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Moderation Configuration</h1>
          <p className="text-muted-foreground">Adjust runtime moderation settings</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchConfig} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4 text-green-700 dark:text-green-300">
          {success}
        </div>
      )}

      {/* Config Form */}
      <div className="bg-card border border-border rounded-xl">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold">Model Settings</h2>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Provider</label>
            <input
              type="text"
              value={config.provider}
              onChange={(e) => setConfig({ ...config, provider: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-md bg-background"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Policy Version</label>
            <input
              type="text"
              value={config.policyVersion}
              onChange={(e) => setConfig({ ...config, policyVersion: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-md bg-background"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Primary Model</label>
            <input
              type="text"
              value={config.modelPrimary}
              onChange={(e) => setConfig({ ...config, modelPrimary: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-md bg-background"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Escalation Model</label>
            <input
              type="text"
              value={config.modelEscalation}
              onChange={(e) => setConfig({ ...config, modelEscalation: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-md bg-background"
            />
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold">Thresholds</h2>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Fail Confidence Threshold
              <span className="text-muted-foreground ml-2">({(config.failConfidence * 100).toFixed(0)}%)</span>
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={config.failConfidence}
              onChange={(e) => setConfig({ ...config, failConfidence: parseFloat(e.target.value) })}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Warn Confidence Threshold
              <span className="text-muted-foreground ml-2">({(config.warnConfidence * 100).toFixed(0)}%)</span>
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={config.warnConfidence}
              onChange={(e) => setConfig({ ...config, warnConfidence: parseFloat(e.target.value) })}
              className="w-full"
            />
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold">Limits</h2>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Timeout (ms)</label>
            <input
              type="number"
              value={config.timeoutMs}
              onChange={(e) => setConfig({ ...config, timeoutMs: parseInt(e.target.value, 10) })}
              className="w-full px-3 py-2 border border-border rounded-md bg-background"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Max Input Chars</label>
            <input
              type="number"
              value={config.maxInputChars}
              onChange={(e) => setConfig({ ...config, maxInputChars: parseInt(e.target.value, 10) })}
              className="w-full px-3 py-2 border border-border rounded-md bg-background"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Daily Token Budget</label>
            <input
              type="number"
              value={config.dailyTokenBudget}
              onChange={(e) => setConfig({ ...config, dailyTokenBudget: parseInt(e.target.value, 10) })}
              className="w-full px-3 py-2 border border-border rounded-md bg-background"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
