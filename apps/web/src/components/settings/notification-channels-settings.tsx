'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bell, Loader2, Plus, Save, Send, Trash2 } from 'lucide-react'
import { formatSchemaParityError } from '@/lib/schema-parity-client'

type ChannelType = 'webhook' | 'email' | 'slack' | 'discord'

type NotificationChannel = {
  id: string
  channel_type: ChannelType
  channel_config: Record<string, unknown>
  name: string | null
  enabled: boolean
  created_at: string
}

type ChannelFormState = {
  channelType: ChannelType
  name: string
  enabled: boolean
  webhookUrl: string
  webhookSecret: string
  emailAddress: string
  slackWebhookUrl: string
  discordWebhookUrl: string
}

const EMPTY_FORM: ChannelFormState = {
  channelType: 'webhook',
  name: '',
  enabled: true,
  webhookUrl: '',
  webhookSecret: '',
  emailAddress: '',
  slackWebhookUrl: '',
  discordWebhookUrl: '',
}

function toString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function formFromChannel(channel: NotificationChannel): ChannelFormState {
  return {
    channelType: channel.channel_type,
    name: channel.name || '',
    enabled: channel.enabled,
    webhookUrl: toString(channel.channel_config.url),
    webhookSecret: toString(channel.channel_config.secret),
    emailAddress: toString(channel.channel_config.address),
    slackWebhookUrl: toString(channel.channel_config.webhook_url),
    discordWebhookUrl: toString(channel.channel_config.webhook_url),
  }
}

function buildChannelConfig(form: ChannelFormState): Record<string, unknown> {
  if (form.channelType === 'webhook') {
    return {
      url: form.webhookUrl.trim(),
      ...(form.webhookSecret.trim() ? { secret: form.webhookSecret.trim() } : {}),
    }
  }

  if (form.channelType === 'email') {
    return { address: form.emailAddress.trim() }
  }

  if (form.channelType === 'slack') {
    return { webhook_url: form.slackWebhookUrl.trim() }
  }

  return { webhook_url: form.discordWebhookUrl.trim() }
}

export function NotificationChannelsSettings() {
  const [asAgent, setAsAgent] = useState(true)
  const [channels, setChannels] = useState<NotificationChannel[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ChannelFormState>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const loadAbortRef = useRef<AbortController | null>(null)
  const loadRequestIdRef = useRef(0)

  const querySuffix = useMemo(() => (asAgent ? '?as=agent' : ''), [asAgent])

  const resetForm = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  const loadChannels = useCallback(async () => {
    const requestId = loadRequestIdRef.current + 1
    loadRequestIdRef.current = requestId
    loadAbortRef.current?.abort()
    const controller = new AbortController()
    loadAbortRef.current = controller

    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/v1/notification-channels${querySuffix}`, {
        signal: controller.signal,
      })
      const payload = await response.json()
      if (loadRequestIdRef.current !== requestId) {
        return
      }
      if (!response.ok || !payload.success) {
        setError(formatSchemaParityError(payload, 'Failed to load notification channels'))
        return
      }
      setChannels(payload.data?.channels || [])
    } catch {
      if (controller.signal.aborted || loadRequestIdRef.current !== requestId) {
        return
      }

      setError('Failed to load notification channels')
    } finally {
      if (loadRequestIdRef.current === requestId) {
        setLoading(false)
      }
    }
  }, [querySuffix])

  useEffect(() => {
    void loadChannels()

    return () => {
      loadAbortRef.current?.abort()
    }
  }, [loadChannels])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const body = {
        channel_type: form.channelType,
        channel_config: buildChannelConfig(form),
        name: form.name.trim() || undefined,
        enabled: form.enabled,
      }

      const endpoint = editingId
        ? `/api/v1/notification-channels/${editingId}${querySuffix}`
        : `/api/v1/notification-channels${querySuffix}`
      const method = editingId ? 'PATCH' : 'POST'
      const requestBody = editingId
        ? {
            channel_config: body.channel_config,
            name: body.name,
            enabled: body.enabled,
          }
        : body

      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
      const payload = await response.json()
      if (!response.ok || !payload.success) {
        setError(formatSchemaParityError(payload, 'Failed to save notification channel'))
        return
      }

      setSuccess(editingId ? 'Notification channel updated.' : 'Notification channel created.')
      resetForm()
      await loadChannels()
    } catch {
      setError('Failed to save notification channel')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (channelId: string) => {
    setDeletingId(channelId)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch(`/api/v1/notification-channels/${channelId}${querySuffix}`, {
        method: 'DELETE',
      })
      const payload = await response.json()
      if (!response.ok || !payload.success) {
        setError(formatSchemaParityError(payload, 'Failed to delete notification channel'))
        return
      }
      setSuccess('Notification channel deleted.')
      if (editingId === channelId) {
        resetForm()
      }
      await loadChannels()
    } catch {
      setError('Failed to delete notification channel')
    } finally {
      setDeletingId(null)
    }
  }

  const handleTest = async (channelId: string) => {
    setTestingId(channelId)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch(`/api/v1/notification-channels/${channelId}/test${querySuffix}`, {
        method: 'POST',
      })
      const payload = await response.json()
      if (!response.ok || !payload.success) {
        setError(
          formatSchemaParityError(
            payload,
            (typeof payload?.details === 'string' && payload.details.trim().length > 0)
              ? payload.details
              : 'Test notification failed'
          )
        )
        return
      }
      setSuccess('Test notification sent.')
    } catch {
      setError('Test notification failed')
    } finally {
      setTestingId(null)
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
          <Bell className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h2 className="font-semibold">Notification Channels</h2>
          <p className="text-sm text-muted-foreground">
            Configure where workflow events are delivered.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => {
            setAsAgent(true)
            resetForm()
          }}
          className={`px-3 py-1.5 rounded-md text-sm ${asAgent ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
        >
          ResearchAgent channels
        </button>
        <button
          onClick={() => {
            setAsAgent(false)
            resetForm()
          }}
          className={`px-3 py-1.5 rounded-md text-sm ${!asAgent ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
        >
          Human channels
        </button>
      </div>

      {error && <div className="mb-4 p-3 text-sm rounded-md border border-destructive/30 bg-destructive/10 text-destructive">{error}</div>}
      {success && <div className="mb-4 p-3 text-sm rounded-md border border-green-500/30 bg-green-500/10 text-green-600">{success}</div>}

      <div className="border border-border rounded-lg p-4 mb-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm">{editingId ? 'Edit channel' : 'Add channel'}</h3>
          {editingId && (
            <button onClick={resetForm} className="text-xs text-muted-foreground hover:text-foreground">
              Cancel edit
            </button>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            <span className="block mb-1 text-muted-foreground">Type</span>
            <select
              value={form.channelType}
              onChange={(e) => setForm((prev) => ({ ...prev, channelType: e.target.value as ChannelType }))}
              disabled={Boolean(editingId)}
              className="w-full px-3 py-2 bg-background border border-input rounded-md"
            >
              <option value="webhook">Webhook</option>
              <option value="email">Email</option>
              <option value="slack">Slack</option>
              <option value="discord">Discord</option>
            </select>
          </label>

          <label className="text-sm">
            <span className="block mb-1 text-muted-foreground">Name (optional)</span>
            <input
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 bg-background border border-input rounded-md"
              placeholder="Primary webhook"
            />
          </label>
        </div>

        {form.channelType === 'webhook' && (
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              <span className="block mb-1 text-muted-foreground">Webhook URL</span>
              <input
                value={form.webhookUrl}
                onChange={(e) => setForm((prev) => ({ ...prev, webhookUrl: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-input rounded-md"
                placeholder="https://example.com/webhooks/analogresearch"
              />
            </label>
            <label className="text-sm">
              <span className="block mb-1 text-muted-foreground">Secret (optional)</span>
              <input
                value={form.webhookSecret}
                onChange={(e) => setForm((prev) => ({ ...prev, webhookSecret: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-input rounded-md"
                placeholder="shared-secret"
              />
            </label>
          </div>
        )}

        {form.channelType === 'email' && (
          <label className="text-sm">
            <span className="block mb-1 text-muted-foreground">Email address</span>
            <input
              value={form.emailAddress}
              onChange={(e) => setForm((prev) => ({ ...prev, emailAddress: e.target.value }))}
              className="w-full px-3 py-2 bg-background border border-input rounded-md"
              placeholder="alerts@example.com"
            />
          </label>
        )}

        {form.channelType === 'slack' && (
          <label className="text-sm">
            <span className="block mb-1 text-muted-foreground">Slack webhook URL</span>
            <input
              value={form.slackWebhookUrl}
              onChange={(e) => setForm((prev) => ({ ...prev, slackWebhookUrl: e.target.value }))}
              className="w-full px-3 py-2 bg-background border border-input rounded-md"
              placeholder="https://hooks.slack.com/services/..."
            />
          </label>
        )}

        {form.channelType === 'discord' && (
          <label className="text-sm">
            <span className="block mb-1 text-muted-foreground">Discord webhook URL</span>
            <input
              value={form.discordWebhookUrl}
              onChange={(e) => setForm((prev) => ({ ...prev, discordWebhookUrl: e.target.value }))}
              className="w-full px-3 py-2 bg-background border border-input rounded-md"
              placeholder="https://discord.com/api/webhooks/..."
            />
          </label>
        )}

        <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm((prev) => ({ ...prev, enabled: e.target.checked }))}
          />
          Enabled
        </label>

        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editingId ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {editingId ? 'Save channel' : 'Create channel'}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : channels.length === 0 ? (
        <p className="text-sm text-muted-foreground">No channels configured.</p>
      ) : (
        <div className="space-y-2">
          {channels.map((channel) => (
            <div key={channel.id} className="border border-border rounded-lg p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium">
                  {channel.name || channel.channel_type}
                  <span className="ml-2 text-xs text-muted-foreground uppercase">{channel.channel_type}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {channel.enabled ? 'Enabled' : 'Disabled'} · Created {new Date(channel.created_at).toLocaleDateString()}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setEditingId(channel.id)
                    setForm(formFromChannel(channel))
                  }}
                  className="text-sm px-2 py-1 border border-border rounded-md hover:bg-accent"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleTest(channel.id)}
                  disabled={testingId === channel.id || !channel.enabled}
                  className="text-sm px-2 py-1 border border-border rounded-md hover:bg-accent disabled:opacity-50 inline-flex items-center gap-1"
                >
                  {testingId === channel.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Test
                </button>
                <button
                  onClick={() => handleDelete(channel.id)}
                  disabled={deletingId === channel.id}
                  className="text-sm px-2 py-1 border border-destructive/40 text-destructive rounded-md hover:bg-destructive/10 disabled:opacity-50 inline-flex items-center gap-1"
                >
                  {deletingId === channel.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
