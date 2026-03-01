import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export type WebhookUrlPolicy = {
  allowHttp: boolean
  allowPrivateNetworks: boolean
}

export type WebhookUrlValidationResult =
  | { ok: true; url: URL }
  | { ok: false; error: string }

function parseBooleanEnv(value: string | undefined): boolean {
  const normalized = (value || '').trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

export function resolveWebhookUrlPolicyFromEnv(): WebhookUrlPolicy {
  return {
    allowHttp: parseBooleanEnv(process.env.WEBHOOKS_ALLOW_HTTP),
    allowPrivateNetworks: parseBooleanEnv(process.env.WEBHOOKS_ALLOW_PRIVATE_NETWORKS),
  }
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null

  const nums = parts.map((part) => {
    if (!/^\d+$/.test(part)) return null
    const n = Number(part)
    if (!Number.isInteger(n) || n < 0 || n > 255) return null
    return n
  })

  if (nums.some((n) => n === null)) return null

  const [a, b, c, d] = nums as number[]
  return (a * 256 ** 3) + (b * 256 ** 2) + (c * 256) + d
}

function ipv6ToBigInt(ip: string): bigint | null {
  const normalized = ip.trim().toLowerCase()
  if (!normalized) return null

  const hasDouble = normalized.includes('::')
  const [leftRaw, rightRaw] = hasDouble ? normalized.split('::') : [normalized, '']
  if (hasDouble && normalized.split('::').length !== 2) return null

  const leftParts = leftRaw ? leftRaw.split(':').filter(Boolean) : []
  const rightParts = rightRaw ? rightRaw.split(':').filter(Boolean) : []

  const expandIpv4Tail = (parts: string[]) => {
    if (parts.length === 0) return parts
    const last = parts[parts.length - 1]
    if (!last.includes('.')) return parts
    const ipv4 = ipv4ToInt(last)
    if (ipv4 === null) return null
    const high = Math.floor(ipv4 / 65536)
    const low = ipv4 % 65536
    return [...parts.slice(0, -1), high.toString(16), low.toString(16)]
  }

  const leftExpanded = expandIpv4Tail(leftParts)
  if (!leftExpanded) return null
  const rightExpanded = expandIpv4Tail(rightParts)
  if (!rightExpanded) return null

  const totalGroups = leftExpanded.length + rightExpanded.length
  if (!hasDouble && totalGroups !== 8) return null
  if (hasDouble && totalGroups > 8) return null

  const missing = hasDouble ? 8 - totalGroups : 0
  const groups = [
    ...leftExpanded,
    ...Array.from({ length: missing }, () => '0'),
    ...rightExpanded,
  ]

  if (groups.length !== 8) return null

  let value = 0n
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return null
    const n = BigInt(`0x${group}`)
    value = (value << 16n) + n
  }
  return value
}

function v4CidrRange(base: string, prefixBits: number): { start: number; end: number } | null {
  const baseInt = ipv4ToInt(base)
  if (baseInt === null) return null
  const prefix = Math.max(0, Math.min(32, Math.floor(prefixBits)))
  const hostBits = 32 - prefix
  const size = 2 ** hostBits
  const start = Math.floor(baseInt / size) * size
  const end = start + size - 1
  return { start, end }
}

function v6CidrRange(base: string, prefixBits: number): { start: bigint; end: bigint } | null {
  const baseInt = ipv6ToBigInt(base)
  if (baseInt === null) return null
  const prefix = Math.max(0, Math.min(128, Math.floor(prefixBits)))
  const hostBits = 128 - prefix
  const shift = BigInt(hostBits)
  const start = (baseInt >> shift) << shift
  const end = start + ((1n << shift) - 1n)
  return { start, end }
}

const IPV4_BLOCK_RANGES = [
  v4CidrRange('0.0.0.0', 8),
  v4CidrRange('10.0.0.0', 8),
  v4CidrRange('100.64.0.0', 10), // carrier-grade NAT
  v4CidrRange('127.0.0.0', 8),
  v4CidrRange('169.254.0.0', 16),
  v4CidrRange('172.16.0.0', 12),
  v4CidrRange('192.0.0.0', 24),
  v4CidrRange('192.0.2.0', 24),
  v4CidrRange('192.168.0.0', 16),
  v4CidrRange('198.18.0.0', 15),
  v4CidrRange('198.51.100.0', 24),
  v4CidrRange('203.0.113.0', 24),
  v4CidrRange('224.0.0.0', 4), // multicast
  v4CidrRange('240.0.0.0', 4), // reserved
].filter(Boolean) as Array<{ start: number; end: number }>

const IPV6_BLOCK_RANGES = [
  v6CidrRange('::', 128), // unspecified
  v6CidrRange('::1', 128), // loopback
  v6CidrRange('fe80::', 10), // link-local
  v6CidrRange('fc00::', 7), // unique local
  v6CidrRange('ff00::', 8), // multicast
  v6CidrRange('2001:db8::', 32), // documentation
].filter(Boolean) as Array<{ start: bigint; end: bigint }>

const IPV6_IPV4_MAPPED_RANGE = v6CidrRange('::ffff:0:0', 96)
const IPV6_IPV4_COMPAT_RANGE = v6CidrRange('::', 96)

function isIntInRanges(value: number, ranges: Array<{ start: number; end: number }>): boolean {
  return ranges.some((range) => value >= range.start && value <= range.end)
}

function isBigIntInRanges(value: bigint, ranges: Array<{ start: bigint; end: bigint }>): boolean {
  return ranges.some((range) => value >= range.start && value <= range.end)
}

function isPrivateOrReservedIpLiteral(host: string): boolean {
  const family = isIP(host)

  if (family === 4) {
    const value = ipv4ToInt(host)
    if (value === null) return true
    return isIntInRanges(value, IPV4_BLOCK_RANGES)
  }

  if (family === 6) {
    const value = ipv6ToBigInt(host)
    if (value === null) return true

    // Handle IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1)
    if (IPV6_IPV4_MAPPED_RANGE && value >= IPV6_IPV4_MAPPED_RANGE.start && value <= IPV6_IPV4_MAPPED_RANGE.end) {
      const ipv4Int = Number(value & 0xffffffffn)
      return isIntInRanges(ipv4Int, IPV4_BLOCK_RANGES)
    }

    // Handle legacy IPv4-compatible IPv6 (::x.x.x.x), still seen occasionally.
    if (IPV6_IPV4_COMPAT_RANGE && value >= IPV6_IPV4_COMPAT_RANGE.start && value <= IPV6_IPV4_COMPAT_RANGE.end) {
      const ipv4Int = Number(value & 0xffffffffn)
      return isIntInRanges(ipv4Int, IPV4_BLOCK_RANGES)
    }

    return isBigIntInRanges(value, IPV6_BLOCK_RANGES)
  }

  return false
}

async function isHostnamePublic(hostname: string): Promise<{ ok: true } | { ok: false; error: string }> {
  // RFC 6761: .localhost is special-use and should never resolve to public destinations.
  const lower = hostname.toLowerCase()
  if (lower === 'localhost' || lower.endsWith('.localhost')) {
    return { ok: false, error: 'localhost is not allowed' }
  }

  // Block obvious IP literals without DNS.
  if (isIP(hostname)) {
    if (isPrivateOrReservedIpLiteral(hostname)) {
      return { ok: false, error: 'Private or reserved IP addresses are not allowed' }
    }
    return { ok: true }
  }

  let results: Array<{ address: string }>
  try {
    results = await lookup(hostname, { all: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'DNS lookup failed'
    return { ok: false, error: `DNS lookup failed: ${message}` }
  }

  if (results.length === 0) {
    return { ok: false, error: 'DNS lookup returned no results' }
  }

  for (const result of results) {
    if (isPrivateOrReservedIpLiteral(result.address)) {
      return { ok: false, error: 'Private or reserved IP destinations are not allowed' }
    }
  }

  return { ok: true }
}

export async function validateOutboundWebhookUrl(
  rawUrl: string,
  options?: { policy?: WebhookUrlPolicy }
): Promise<WebhookUrlValidationResult> {
  const policy = options?.policy ?? resolveWebhookUrlPolicyFromEnv()

  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return { ok: false, error: 'Invalid URL' }
  }

  if (url.username || url.password) {
    return { ok: false, error: 'Webhook URL must not include username or password' }
  }

  if (url.hash) {
    return { ok: false, error: 'Webhook URL must not include a fragment' }
  }

  const isHttps = url.protocol === 'https:'
  const isHttp = url.protocol === 'http:'

  if (!isHttps && !(isHttp && policy.allowHttp)) {
    return { ok: false, error: 'Webhook URL must use https' }
  }

  if (!url.hostname) {
    return { ok: false, error: 'Webhook URL must include a hostname' }
  }

  if (!policy.allowPrivateNetworks) {
    const hostnameResult = await isHostnamePublic(url.hostname)
    if (!hostnameResult.ok) {
      return { ok: false, error: hostnameResult.error }
    }
  }

  return { ok: true, url }
}

export async function validateSlackWebhookUrl(rawUrl: string): Promise<WebhookUrlValidationResult> {
  const base = await validateOutboundWebhookUrl(rawUrl, {
    policy: { allowHttp: false, allowPrivateNetworks: false },
  })
  if (!base.ok) return base

  const url = base.url
  if (url.hostname !== 'hooks.slack.com') {
    return { ok: false, error: 'Must be a Slack webhook URL' }
  }

  if (!url.pathname.startsWith('/services/')) {
    return { ok: false, error: 'Must be a Slack webhook URL' }
  }

  return base
}

export async function validateDiscordWebhookUrl(rawUrl: string): Promise<WebhookUrlValidationResult> {
  const base = await validateOutboundWebhookUrl(rawUrl, {
    policy: { allowHttp: false, allowPrivateNetworks: false },
  })
  if (!base.ok) return base

  const url = base.url
  const allowedHosts = new Set([
    'discord.com',
    'ptb.discord.com',
    'canary.discord.com',
    'discordapp.com',
  ])

  if (!allowedHosts.has(url.hostname)) {
    return { ok: false, error: 'Must be a Discord webhook URL' }
  }

  if (!url.pathname.startsWith('/api/webhooks/')) {
    return { ok: false, error: 'Must be a Discord webhook URL' }
  }

  return base
}

