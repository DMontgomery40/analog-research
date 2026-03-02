import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS === 'true'
const integrationDescribe = RUN_INTEGRATION_TESTS ? describe : describe.skip

const API_BASE_URL = (process.env.TEST_API_BASE_URL
  || process.env.NEXT_PUBLIC_SITE_URL
  || process.env.NEXT_PUBLIC_APP_URL
  || 'https://analog-research.org').replace(/\/$/, '')

function buildUrl(path: string) {
  return `${API_BASE_URL}${path}`
}

function expectNetlifyRuntime(response: Response) {
  expect(response.headers.get('x-nf-request-id')).toBeTruthy()
}

function requireEnv(name: string): string {
  const value = (process.env[name] || '').trim()
  if (!value) {
    throw new Error(`[discord-hooks.integration] Missing required env var: ${name}`)
  }
  return value
}

type NotificationChannel = {
  id: string
  channel_type: string
  channel_config: Record<string, unknown>
  enabled: boolean
  name?: string | null
}

async function listChannels(apiKey: string) {
  const response = await fetch(buildUrl('/api/v1/notification-channels'), {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
  })

  expectNetlifyRuntime(response)
  const json = await response.json()

  expect(response.status).toBe(200)
  expect(json?.success).toBe(true)
  expect(Array.isArray(json?.data?.channels)).toBe(true)

  return json.data.channels as NotificationChannel[]
}

async function createDiscordChannel(apiKey: string, webhookUrl: string, name: string) {
  const response = await fetch(buildUrl('/api/v1/notification-channels'), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      channel_type: 'discord',
      channel_config: { webhook_url: webhookUrl },
      name,
      enabled: true,
    }),
  })

  expectNetlifyRuntime(response)
  const json = await response.json()

  expect([201, 409]).toContain(response.status)
  return { response, json }
}

async function patchChannel(
  apiKey: string,
  channelId: string,
  updates: { channel_config?: Record<string, unknown>; name?: string; enabled?: boolean }
) {
  const response = await fetch(buildUrl(`/api/v1/notification-channels/${channelId}`), {
    method: 'PATCH',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(updates),
  })

  expectNetlifyRuntime(response)
  const json = await response.json()
  expect(response.status).toBe(200)
  expect(json?.success).toBe(true)
  return json.data as NotificationChannel
}

async function sendTestNotification(apiKey: string, channelId: string) {
  const response = await fetch(buildUrl(`/api/v1/notification-channels/${channelId}/test`), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
  })

  expectNetlifyRuntime(response)
  const json = await response.json()

  expect(response.status).toBe(200)
  expect(json?.success).toBe(true)
  expect(json?.response_status).toBe(204)
}

integrationDescribe('Discord notification hooks (real webhooks)', () => {
  if (!RUN_INTEGRATION_TESTS) return

  if (/localhost|127\\.0\\.0\\.1/.test(API_BASE_URL)) {
    throw new Error(
      `[discord-hooks.integration] API base URL is local (${API_BASE_URL}). Set TEST_API_BASE_URL/NEXT_PUBLIC_SITE_URL to a deployed Netlify URL.`
    )
  }

  const apiKey = (
    process.env.NOTIFICATION_TEST_AGENT_API_KEY
    || process.env.MCP_CHATGPT_ADMIN_API_KEY
    || ''
  ).trim()

  // Required by story acceptance criteria.
  const testUserWebhookUrl = requireEnv('DISCORD_TEST_USER_NOTIFICATION_WEBHOOK_URL')
  const adminWebhookUrl = requireEnv('DISCORD_ADMIN_NOTIFICATION_WEBHOOK_URL')

  if (!apiKey) {
    throw new Error(
      '[discord-hooks.integration] Missing API key for /api/v1/notification-channels. Set NOTIFICATION_TEST_AGENT_API_KEY (preferred) or MCP_CHATGPT_ADMIN_API_KEY.'
    )
  }

  let originalDiscordChannel: NotificationChannel | null = null
  let workingChannelId: string | null = null
  let createdChannel = false

  beforeAll(async () => {
    const channels = await listChannels(apiKey)
    const existing = channels.find((c) => c.channel_type === 'discord') || null
    originalDiscordChannel = existing
    if (existing) {
      workingChannelId = existing.id
      return
    }

    const { response, json } = await createDiscordChannel(apiKey, testUserWebhookUrl, 'Discord (test user)')
    if (response.status === 409) {
      // Another process created it between list + create. Re-list to find it.
      const nextChannels = await listChannels(apiKey)
      const discord = nextChannels.find((c) => c.channel_type === 'discord')
      if (!discord) {
        throw new Error(
          `[discord-hooks.integration] Unexpected 409 conflict creating discord channel, but channel was not found on re-list. Body=${JSON.stringify(json)}`
        )
      }
      workingChannelId = discord.id
      return
    }

    expect(json?.success).toBe(true)
    expect(json?.data?.id).toBeTruthy()
    expect(json?.data?.channel_type).toBe('discord')
    workingChannelId = json.data.id
    createdChannel = true
  })

  afterAll(async () => {
    if (!workingChannelId) return

    // Best-effort cleanup so the test agent's notifications aren't left pointing at the admin hook.
    if (originalDiscordChannel) {
      await patchChannel(apiKey, workingChannelId, {
        channel_config: originalDiscordChannel.channel_config,
        name: originalDiscordChannel.name || undefined,
        enabled: originalDiscordChannel.enabled,
      }).catch(() => {})
      return
    }

    if (createdChannel) {
      await fetch(buildUrl(`/api/v1/notification-channels/${workingChannelId}`), {
        method: 'DELETE',
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
      }).catch(() => {})
    }
  })

  it('creates or updates a Discord channel and delivers to the test-user webhook', async () => {
    if (!workingChannelId) throw new Error('[discord-hooks.integration] Missing working channel id')

    await patchChannel(apiKey, workingChannelId, {
      channel_config: { webhook_url: testUserWebhookUrl },
      name: 'Discord (test user)',
      enabled: true,
    })

    await sendTestNotification(apiKey, workingChannelId)
  })

  it('updates the same channel and delivers to the admin Discord webhook', async () => {
    if (!workingChannelId) throw new Error('[discord-hooks.integration] Missing working channel id')

    await patchChannel(apiKey, workingChannelId, {
      channel_config: { webhook_url: adminWebhookUrl },
      name: 'Discord (admin)',
      enabled: true,
    })

    await sendTestNotification(apiKey, workingChannelId)
  })
})
