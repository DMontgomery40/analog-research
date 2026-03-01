import { createHmac } from 'crypto'
import { afterEach, describe, expect, it } from 'vitest'

import {
  getCoinbaseTransactionHash,
  getConfiguredCoinbaseSupportedCurrencies,
  isCoinbaseCurrencySupported,
  verifyCoinbaseWebhookSignature,
} from '@/lib/coinbase'

const originalSupportedCurrencies = process.env.COINBASE_COMMERCE_SUPPORTED_SETTLEMENT_CURRENCIES

afterEach(() => {
  if (originalSupportedCurrencies === undefined) {
    delete process.env.COINBASE_COMMERCE_SUPPORTED_SETTLEMENT_CURRENCIES
    return
  }

  process.env.COINBASE_COMMERCE_SUPPORTED_SETTLEMENT_CURRENCIES = originalSupportedCurrencies
})

describe('coinbase helpers', () => {
  it('parses configured settlement currencies as uppercase unique values', () => {
    process.env.COINBASE_COMMERCE_SUPPORTED_SETTLEMENT_CURRENCIES = 'usd, eur,USDC,usd'

    expect(getConfiguredCoinbaseSupportedCurrencies()).toEqual(['USD', 'EUR', 'USDC'])
  })

  it('checks whether a settlement currency is supported', () => {
    process.env.COINBASE_COMMERCE_SUPPORTED_SETTLEMENT_CURRENCIES = 'USD,EUR'

    expect(isCoinbaseCurrencySupported('eur')).toBe(true)
    expect(isCoinbaseCurrencySupported('jpy')).toBe(false)
  })

  it('verifies hook0 webhook signatures', () => {
    const body = '{"id":"evt_1"}'
    const hookId = 'hook_123'
    const nowSeconds = 1_700_000_000
    const timestamp = String(nowSeconds)
    const secret = 'test_secret'

    const headerNames = 'x-hook0-id,x-hook0-timestamp'
    const headerValues = `${hookId},${timestamp}`
    const message = `${timestamp}.${headerNames}.${headerValues}.${body}`
    const signature = createHmac('sha256', secret).update(message).digest('hex')

    const validHeaders = new Headers({
      'x-hook0-id': hookId,
      'x-hook0-timestamp': timestamp,
      'x-hook0-signature': `t=${timestamp},h=${headerNames},v1=${signature}`,
    })

    const invalidHeaders = new Headers({
      'x-hook0-id': hookId,
      'x-hook0-timestamp': timestamp,
      'x-hook0-signature': `t=${timestamp},h=${headerNames},v1=deadbeef`,
    })

    expect(verifyCoinbaseWebhookSignature(body, validHeaders, secret, { nowSeconds })).toBe(true)
    expect(verifyCoinbaseWebhookSignature(body, invalidHeaders, secret, { nowSeconds })).toBe(false)
  })

  it('rejects stale webhook timestamps', () => {
    const body = '{"id":"evt_stale"}'
    const hookId = 'hook_123'
    const nowSeconds = 1_700_000_000
    const staleTimestamp = String(nowSeconds - 3_601)
    const secret = 'test_secret'

    const headerNames = 'x-hook0-id,x-hook0-timestamp'
    const headerValues = `${hookId},${staleTimestamp}`
    const message = `${staleTimestamp}.${headerNames}.${headerValues}.${body}`
    const signature = createHmac('sha256', secret).update(message).digest('hex')
    const headers = new Headers({
      'x-hook0-id': hookId,
      'x-hook0-timestamp': staleTimestamp,
      'x-hook0-signature': `t=${staleTimestamp},h=${headerNames},v1=${signature}`,
    })

    expect(
      verifyCoinbaseWebhookSignature(body, headers, secret, {
        nowSeconds,
        maxAgeSeconds: 3600,
      })
    ).toBe(false)
  })

  it('rejects webhooks with missing headers', () => {
    const body = '{"id":"evt_1"}'
    const secret = 'test_secret'

    // Missing all headers
    expect(verifyCoinbaseWebhookSignature(body, new Headers(), secret)).toBe(false)

    // Missing hook ID
    expect(verifyCoinbaseWebhookSignature(body, new Headers({
      'x-hook0-timestamp': '1700000000',
      'x-hook0-signature': 'v1=deadbeef',
    }), secret)).toBe(false)

    // Missing timestamp
    expect(verifyCoinbaseWebhookSignature(body, new Headers({
      'x-hook0-id': 'hook_123',
      'x-hook0-signature': 'v1=deadbeef',
    }), secret)).toBe(false)

    // Missing signature
    expect(verifyCoinbaseWebhookSignature(body, new Headers({
      'x-hook0-id': 'hook_123',
      'x-hook0-timestamp': '1700000000',
    }), secret)).toBe(false)
  })

  it('rejects webhooks with invalid timestamp format', () => {
    const body = '{"id":"evt_1"}'
    const secret = 'test_secret'

    const headers = new Headers({
      'x-hook0-id': 'hook_123',
      'x-hook0-timestamp': 'not-a-number',
      'x-hook0-signature': 'v1=a'.repeat(64),
    })

    expect(verifyCoinbaseWebhookSignature(body, headers, secret)).toBe(false)
  })

  it('rejects webhooks with malformed signature format', () => {
    const body = '{"id":"evt_1"}'
    const secret = 'test_secret'
    const nowSeconds = 1_700_000_000

    // Signature too short (not 64 hex chars)
    const headersShort = new Headers({
      'x-hook0-id': 'hook_123',
      'x-hook0-timestamp': String(nowSeconds),
      'x-hook0-signature': `t=${nowSeconds},v1=tooshort`,
    })

    expect(verifyCoinbaseWebhookSignature(body, headersShort, secret, { nowSeconds })).toBe(false)

    // Signature with invalid hex characters
    const headersInvalidHex = new Headers({
      'x-hook0-id': 'hook_123',
      'x-hook0-timestamp': String(nowSeconds),
      'x-hook0-signature': `t=${nowSeconds},v1=${'g'.repeat(64)}`,
    })

    expect(verifyCoinbaseWebhookSignature(body, headersInvalidHex, secret, { nowSeconds })).toBe(false)
  })

  it('rejects webhooks with empty secret', () => {
    const body = '{"id":"evt_1"}'

    const headers = new Headers({
      'x-hook0-id': 'hook_123',
      'x-hook0-timestamp': '1700000000',
      'x-hook0-signature': 'v1=' + 'a'.repeat(64),
    })

    expect(verifyCoinbaseWebhookSignature(body, headers, '')).toBe(false)
  })

  it('extracts transaction hashes from top-level and nested payment operation fields', () => {
    expect(getCoinbaseTransactionHash({ id: 'p1', transactionHash: '0xabc' })).toBe('0xabc')
    expect(getCoinbaseTransactionHash({
      id: 'p2',
      paymentOperation: {
        transactionHash: '0xdef',
      },
    })).toBe('0xdef')
    expect(getCoinbaseTransactionHash({
      id: 'p3',
      paymentOperation: {
        txHash: '0x123',
      },
    })).toBe('0x123')
    expect(getCoinbaseTransactionHash(null)).toBeNull()
  })
})
