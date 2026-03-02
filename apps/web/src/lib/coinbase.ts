import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { SignJWT, base64url, importJWK, importPKCS8 } from 'jose'
import type { KeyLike } from 'jose'

import { PLATFORM_FEE_BPS } from '@/lib/payments/pricing'

const COINBASE_COMMERCE_API_BASE_URL =
  process.env.COINBASE_COMMERCE_API_BASE_URL || 'https://payments.coinbase.com'

const LEGACY_DEFAULT_CURRENCY = (process.env.COINBASE_COMMERCE_CURRENCY || 'usdc').toUpperCase()
const DEFAULT_CHAIN = (process.env.COINBASE_COMMERCE_CHAIN || 'base').toLowerCase()

function numberFromEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const COINBASE_COMMERCE_PLATFORM_FEE_BPS = Math.max(
  0,
  Math.min(10000, Math.round(numberFromEnv(process.env.COINBASE_COMMERCE_PLATFORM_FEE_BPS, PLATFORM_FEE_BPS))),
)

if (COINBASE_COMMERCE_PLATFORM_FEE_BPS !== PLATFORM_FEE_BPS) {
  throw new Error(`COINBASE_COMMERCE_PLATFORM_FEE_BPS must be ${PLATFORM_FEE_BPS} to match PLATFORM_FEE_BPS`)
}

interface CoinbaseApiErrorResponse {
  message?: string
  error?: string
}

export interface CoinbasePaymentLink {
  id: string
  url?: string
}

export interface CoinbasePaymentOperation {
  id?: string
  paymentId?: string
  status?: string
  type?: string
  metadata?: Record<string, string>
  txHash?: string
  transactionHash?: string
  params?: Record<string, unknown>
}

export interface CoinbasePayment {
  id: string
  paymentLinkId?: string
  paymentLink?: { id?: string }
  txHash?: string
  transactionHash?: string
  paymentOperations?: CoinbasePaymentOperation[]
  status?: string
  metadata?: Record<string, string>
  paymentOperation?: CoinbasePaymentOperation
}

interface CreateCryptoEscrowPaymentLinkInput {
  bookingId: string
  title: string
  description: string
  amountCents: number
  currency: string
  receiverAddress: string
  feeReceiverAddress: string
}

interface CaptureOrAuthorizeInput {
  paymentId: string
  amountCents: number
  currency: string
}

interface CoinbaseWebhookVerificationOptions {
  nowSeconds?: number
  maxAgeSeconds?: number
}

function formatCents(amountCents: number): string {
  return (amountCents / 100).toFixed(2)
}

function normalizeCoinbaseCurrency(currency: string): string {
  return currency.trim().toLowerCase()
}

type CoinbaseJwtSigner = {
  apiKeyId: string
  alg: 'ES256' | 'EdDSA'
  key: KeyLike
}

let cachedSignerPromise: Promise<CoinbaseJwtSigner | null> | null = null

async function getCoinbaseJwtSigner(): Promise<CoinbaseJwtSigner | null> {
  if (cachedSignerPromise) return cachedSignerPromise

  cachedSignerPromise = (async () => {
    const apiKeyId =
      process.env.COINBASE_COMMERCE_API_KEY_ID ||
      process.env.COINBASE_COMMERCE_API_KEY_NAME ||
      ''
    const apiKeySecret = process.env.COINBASE_COMMERCE_API_KEY_SECRET || ''

    if (!apiKeyId || !apiKeySecret) {
      return null
    }

    const trimmedSecret = apiKeySecret.trim()

    if (trimmedSecret.includes('PRIVATE KEY')) {
      const key = await importPKCS8(trimmedSecret, 'ES256')
      return { apiKeyId, alg: 'ES256', key }
    }

    const decoded = Buffer.from(trimmedSecret, 'base64')
    if (decoded.length !== 64) {
      throw new Error('COINBASE_COMMERCE_API_KEY_SECRET must be a PKCS8 private key or a base64 Ed25519 secret (64 bytes)')
    }

    const seed = decoded.subarray(0, 32)
    const publicKey = decoded.subarray(32)

    const jwk = {
      kty: 'OKP',
      crv: 'Ed25519',
      d: base64url.encode(seed),
      x: base64url.encode(publicKey),
    }
    const imported = await importJWK(jwk, 'EdDSA')
    if (imported instanceof Uint8Array) {
      throw new Error('Coinbase Ed25519 key import returned an unexpected symmetric key')
    }
    const key = imported
    return { apiKeyId, alg: 'EdDSA', key }
  })()

  return cachedSignerPromise
}

async function getCoinbaseAuthorizationHeader(method: string, url: URL): Promise<string> {
  const staticToken = process.env.COINBASE_COMMERCE_API_TOKEN
  if (staticToken) {
    // Backward-compatible escape hatch for long-lived tokens, if configured.
    return `Bearer ${staticToken}`
  }

  const signer = await getCoinbaseJwtSigner()
  if (!signer) {
    throw new Error(
      'Coinbase auth is not configured. Set COINBASE_COMMERCE_API_TOKEN or (COINBASE_COMMERCE_API_KEY_ID + COINBASE_COMMERCE_API_KEY_SECRET).'
    )
  }

  const nowSeconds = Math.floor(Date.now() / 1000)
  const nonce = randomBytes(16).toString('hex')
  const requestPath = `${url.pathname}${url.search}`
  const uri = `${method.toUpperCase()} ${url.host}${requestPath}`

  const jwt = await new SignJWT({ uris: [uri] })
    .setProtectedHeader({ alg: signer.alg, kid: signer.apiKeyId, nonce, typ: 'JWT' })
    .setIssuer('cdp')
    .setSubject(signer.apiKeyId)
    .setAudience(['cdp_service'])
    .setNotBefore(nowSeconds)
    .setExpirationTime(nowSeconds + 120)
    .sign(signer.key)

  return `Bearer ${jwt}`
}

async function coinbaseRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const baseUrl = new URL(COINBASE_COMMERCE_API_BASE_URL)
  const url = new URL(path, baseUrl)
  const method = (init.method || 'GET').toUpperCase()
  const authorization = await getCoinbaseAuthorizationHeader(method, url)

  const response = await fetch(url.toString(), {
    ...init,
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    const errorPayload = payload as CoinbaseApiErrorResponse
    throw new Error(errorPayload.message || errorPayload.error || `Coinbase API request failed with ${response.status}`)
  }

  return payload as T
}

function sanitizeText(value: string, maxLength: number): string {
  if (!value) return ''
  return value.slice(0, maxLength)
}

export function getConfiguredCoinbaseSupportedCurrencies(): string[] {
  const configured = process.env.COINBASE_COMMERCE_SUPPORTED_SETTLEMENT_CURRENCIES
  if (configured) {
    const parsed = configured
      .split(',')
      .map((token) => token.trim().toUpperCase())
      .filter(Boolean)
    if (parsed.length > 0) {
      return Array.from(new Set(parsed))
    }
  }

  // Backward-compatible fallback while migrating from a single-asset setting.
  return Array.from(new Set(['USD', LEGACY_DEFAULT_CURRENCY]))
}

export function isCoinbaseCurrencySupported(currency: string): boolean {
  const supported = getConfiguredCoinbaseSupportedCurrencies()
  return supported.includes(currency.trim().toUpperCase())
}

export async function createCryptoEscrowPaymentLink(
  input: CreateCryptoEscrowPaymentLinkInput
): Promise<{ id: string; url: string }> {
  const requestCurrency = normalizeCoinbaseCurrency(input.currency)
  const amount = formatCents(input.amountCents)
  const feeBps = COINBASE_COMMERCE_PLATFORM_FEE_BPS

  const networkId = (() => {
    const configured = Number.parseInt(process.env.COINBASE_COMMERCE_NETWORK_ID || '', 10)
    if (Number.isFinite(configured) && configured > 0) return configured

    switch (DEFAULT_CHAIN) {
      case 'base':
        return 8453
      case 'base-sepolia':
        return 84532
      case 'ethereum':
      case 'mainnet':
        return 1
      case 'sepolia':
        return 11155111
      default:
        return undefined
    }
  })()

  const requestBody = {
    chargeAmount: amount,
    feeBps,
    feeReceiver: input.feeReceiverAddress,
    ...(networkId ? { networkId } : {}),
    ...(requestCurrency !== 'usdc'
      ? {
          fiat: {
            currency: requestCurrency,
            amount,
            metadata: { booking_id: input.bookingId },
          },
        }
      : {}),
    merchant: {
      name: sanitizeText(input.title || `Escrow for booking ${input.bookingId}`, 120),
      description: sanitizeText(input.description || 'Analog Research escrow funding', 500),
      metadata: { booking_id: input.bookingId },
    },
    operator: 'and',
    receiver: input.receiverAddress,
  }

  const response = await coinbaseRequest<CoinbasePaymentLink>('/api/v1/payment-links', {
    method: 'POST',
    body: JSON.stringify(requestBody),
  })

  const paymentLink = response
  const url = paymentLink.url

  if (!paymentLink?.id || !url) {
    throw new Error('Coinbase returned an invalid payment link response')
  }

  return {
    id: paymentLink.id,
    url,
  }
}

export async function authorizeCryptoEscrowPayment(
  input: CaptureOrAuthorizeInput
): Promise<CoinbasePayment> {
  const response = await coinbaseRequest<CoinbasePayment>(
    `/api/v1/payments/${input.paymentId}/authorize`,
    {
      method: 'POST',
      body: JSON.stringify({
        amount: formatCents(input.amountCents),
      }),
    }
  )

  return response
}

export async function captureCryptoEscrowPayment(
  input: CaptureOrAuthorizeInput
): Promise<CoinbasePayment> {
  const feeReceiver = process.env.COINBASE_COMMERCE_FEE_RECEIVER
  if (!feeReceiver) {
    throw new Error('COINBASE_COMMERCE_FEE_RECEIVER is not configured')
  }

  const response = await coinbaseRequest<CoinbasePayment>(
    `/api/v1/payments/${input.paymentId}/capture`,
    {
      method: 'POST',
      body: JSON.stringify({
        amount: formatCents(input.amountCents),
        feeBps: COINBASE_COMMERCE_PLATFORM_FEE_BPS,
        feeReceiver,
      }),
    }
  )

  return response
}

export async function voidCryptoEscrowPayment(
  input: CaptureOrAuthorizeInput
): Promise<CoinbasePayment> {
  const response = await coinbaseRequest<CoinbasePayment>(
    `/api/v1/payments/${input.paymentId}/void`,
    {
      method: 'POST',
      body: JSON.stringify({
        metadata: { source: 'analogresearch' },
      }),
    }
  )

  return response
}

export async function getCryptoPayment(paymentId: string): Promise<CoinbasePayment> {
  return coinbaseRequest<CoinbasePayment>(`/api/v1/payments/${paymentId}`)
}

export function verifyCoinbaseWebhookSignature(
  body: string,
  headers: Headers,
  secret: string,
  options?: CoinbaseWebhookVerificationOptions
): boolean {
  const signature = headers.get('x-hook0-signature')

  if (!signature || !secret) {
    return false
  }

  // The `x-hook0-signature` header is in the form:
  // `t=<timestamp>,h=<header1>,<header2>,v1=<hex>`
  // Note: `h=` contains commas, so we must parse relative to `,v1=`.
  const timestampMatch = signature.match(/(?:^|,)t=([0-9]+)(?:,|$)/)
  const signatureMatch = signature.match(/(?:^|,)v1=([a-f0-9]{64})(?:,|$)/i)
  const headersMatch = signature.match(/(?:^|,)h=(.+?)(?:,v1=|$)/i)

  const timestamp = timestampMatch?.[1] || ''
  const headerNamesRaw = headersMatch?.[1] || ''
  const providedSignature = signatureMatch?.[1] || ''

  const headerNames = headerNamesRaw
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)

  if (!timestamp || headerNames.length === 0 || !providedSignature) {
    return false
  }

  const timestampSeconds = Number.parseInt(timestamp, 10)
  if (!Number.isFinite(timestampSeconds)) {
    return false
  }

  const configuredMaxAge = Number.parseInt(
    process.env.COINBASE_COMMERCE_WEBHOOK_MAX_AGE_SECONDS || '',
    10
  )
  const maxAgeSeconds = options?.maxAgeSeconds
    ?? (Number.isFinite(configuredMaxAge) ? configuredMaxAge : 300)

  const normalizedMaxAgeSeconds = Math.min(Math.max(maxAgeSeconds, 30), 3600)
  const nowSeconds = options?.nowSeconds ?? Math.floor(Date.now() / 1000)
  if (Math.abs(nowSeconds - timestampSeconds) > normalizedMaxAgeSeconds) {
    return false
  }

  if (!/^[a-f0-9]{64}$/i.test(providedSignature)) {
    return false
  }

  const headerValues = headerNames.map((name) => headers.get(name))
  if (headerValues.some((value) => !value)) {
    return false
  }

  const message = `${timestamp}.${headerNames.join(',')}.${headerValues.join(',')}.${body}`
  const expectedSignature = createHmac('sha256', secret).update(message).digest('hex')

  const expectedBuffer = Buffer.from(expectedSignature, 'utf8')
  const providedBuffer = Buffer.from(providedSignature, 'utf8')

  if (expectedBuffer.length !== providedBuffer.length) {
    return false
  }

  return timingSafeEqual(expectedBuffer, providedBuffer)
}

export function getCoinbaseTransactionHash(payment: CoinbasePayment | null | undefined): string | null {
  if (!payment) return null

  const paymentOperationsTxHash = payment.paymentOperations?.find((operation) => operation.txHash || operation.transactionHash)
  const paymentOperationsTx = paymentOperationsTxHash?.txHash || paymentOperationsTxHash?.transactionHash || null

  return (
    payment.txHash ||
    payment.transactionHash ||
    payment.paymentOperation?.transactionHash ||
    payment.paymentOperation?.txHash ||
    paymentOperationsTx ||
    null
  )
}
