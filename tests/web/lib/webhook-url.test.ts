import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  validateDiscordWebhookUrl,
  validateOutboundWebhookUrl,
  validateSlackWebhookUrl,
} from '@/lib/webhook-url'

const ORIGINAL_ALLOW_HTTP = process.env.WEBHOOKS_ALLOW_HTTP
const ORIGINAL_ALLOW_PRIVATE = process.env.WEBHOOKS_ALLOW_PRIVATE_NETWORKS
const DNS_TIMEOUT_MS = 15000

function resetEnv() {
  if (ORIGINAL_ALLOW_HTTP === undefined) {
    delete process.env.WEBHOOKS_ALLOW_HTTP
  } else {
    process.env.WEBHOOKS_ALLOW_HTTP = ORIGINAL_ALLOW_HTTP
  }

  if (ORIGINAL_ALLOW_PRIVATE === undefined) {
    delete process.env.WEBHOOKS_ALLOW_PRIVATE_NETWORKS
  } else {
    process.env.WEBHOOKS_ALLOW_PRIVATE_NETWORKS = ORIGINAL_ALLOW_PRIVATE
  }
}

describe('webhook-url validation', () => {
  beforeEach(() => {
    delete process.env.WEBHOOKS_ALLOW_HTTP
    delete process.env.WEBHOOKS_ALLOW_PRIVATE_NETWORKS
  })

  afterEach(() => {
    resetEnv()
  })

  it('accepts https URLs to public hosts', { timeout: DNS_TIMEOUT_MS }, async () => {
    const result = await validateOutboundWebhookUrl('https://example.com/webhook')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.url.hostname).toBe('example.com')
    }
  })

  it('rejects http by default', { timeout: DNS_TIMEOUT_MS }, async () => {
    const result = await validateOutboundWebhookUrl('http://example.com/webhook')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('https')
    }
  })

  it('allows http when WEBHOOKS_ALLOW_HTTP=true', { timeout: DNS_TIMEOUT_MS }, async () => {
    process.env.WEBHOOKS_ALLOW_HTTP = 'true'

    const result = await validateOutboundWebhookUrl('http://example.com/webhook')

    expect(result.ok).toBe(true)
  })

  it('rejects credentials and fragments', { timeout: DNS_TIMEOUT_MS }, async () => {
    const withCreds = await validateOutboundWebhookUrl('https://user:pass@example.com/webhook')
    expect(withCreds.ok).toBe(false)

    const withFragment = await validateOutboundWebhookUrl('https://example.com/webhook#frag')
    expect(withFragment.ok).toBe(false)
  })

  it('rejects private/localhost destinations by default', { timeout: DNS_TIMEOUT_MS }, async () => {
    const localhost = await validateOutboundWebhookUrl('https://localhost/webhook')
    expect(localhost.ok).toBe(false)

    const loopback = await validateOutboundWebhookUrl('https://127.0.0.1/webhook')
    expect(loopback.ok).toBe(false)
  })

  it('allows private destinations when WEBHOOKS_ALLOW_PRIVATE_NETWORKS=true', { timeout: DNS_TIMEOUT_MS }, async () => {
    process.env.WEBHOOKS_ALLOW_PRIVATE_NETWORKS = 'true'

    const loopback = await validateOutboundWebhookUrl('https://127.0.0.1/webhook')
    expect(loopback.ok).toBe(true)
  })

  it('validates Slack and Discord webhook allowlists', { timeout: DNS_TIMEOUT_MS }, async () => {
    const slack = await validateSlackWebhookUrl('https://hooks.slack.com/services/T000/B000/XXX')
    expect(slack.ok).toBe(true)

    const discord = await validateDiscordWebhookUrl('https://discord.com/api/webhooks/123/token')
    expect(discord.ok).toBe(true)

    const discordSpoof = await validateDiscordWebhookUrl('https://evil.example.com/api/webhooks/123/token')
    expect(discordSpoof.ok).toBe(false)
  })
})
