#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { getRepoRoot } from './common.mjs'

const repoRoot = getRepoRoot()
process.chdir(repoRoot)

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const out = {}

  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }

  return out
}

function envValue(key, fileEnv) {
  const processValue = process.env[key]
  if (typeof processValue === 'string' && processValue.trim().length > 0) {
    return processValue.trim()
  }
  const fileValue = fileEnv[key]
  if (typeof fileValue === 'string' && fileValue.trim().length > 0) {
    return fileValue.trim()
  }
  return ''
}

async function stripePost(pathname, params, secretKey) {
  const body = new URLSearchParams(params)
  const response = await fetch(`https://api.stripe.com${pathname}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  const text = await response.text()
  let payload = null
  try {
    payload = JSON.parse(text)
  } catch {
    payload = { raw: text }
  }

  return { status: response.status, payload }
}

async function stripeGet(pathname, secretKey) {
  const response = await fetch(`https://api.stripe.com${pathname}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${secretKey}`,
    },
  })

  const text = await response.text()
  let payload = null
  try {
    payload = JSON.parse(text)
  } catch {
    payload = { raw: text }
  }

  return { status: response.status, payload }
}

async function refundPaymentIntent(paymentIntentId, amount, secretKey) {
  const refund = await stripePost(
    '/v1/refunds',
    {
      payment_intent: paymentIntentId,
      amount: String(amount),
      'metadata[source]': 'codex_quality_gate',
    },
    secretKey
  )

  if (refund.status < 200 || refund.status >= 300 || !refund.payload || refund.payload.object !== 'refund') {
    return { ok: false, error: refund.payload?.error?.message || 'failed to create refund', refund: refund.payload }
  }

  return { ok: true, refundId: refund.payload.id }
}

const fileEnv = readEnvFile(path.join(repoRoot, 'apps/web/.env.local'))
const stripeSecret = envValue('STRIPE_CANARY_SECRET_KEY', fileEnv) || envValue('STRIPE_SECRET_KEY', fileEnv)
const destinationAccount = envValue('STRIPE_CANARY_CONNECTED_ACCOUNT_ID', fileEnv)
const amount = Number.parseInt(envValue('STRIPE_CANARY_AMOUNT_CENTS', fileEnv) || '50', 10)
const currency = (envValue('STRIPE_CANARY_CURRENCY', fileEnv) || 'usd').toLowerCase()

if (!stripeSecret) {
  console.error('[live-money-flow] FAIL missing STRIPE_CANARY_SECRET_KEY (or STRIPE_SECRET_KEY fallback).')
  process.exit(1)
}

const keyMode = stripeSecret.startsWith('sk_live_')
  ? 'live'
  : stripeSecret.startsWith('sk_test_')
    ? 'test'
    : ''

if (!keyMode) {
  console.error('[live-money-flow] FAIL Stripe key must be sk_live_* or sk_test_*.')
  process.exit(1)
}

if (!destinationAccount) {
  console.error('[live-money-flow] FAIL missing STRIPE_CANARY_CONNECTED_ACCOUNT_ID.')
  process.exit(1)
}

if (!destinationAccount.startsWith('acct_')) {
  console.error('[live-money-flow] FAIL STRIPE_CANARY_CONNECTED_ACCOUNT_ID must be a Stripe connected account id (acct_*).')
  process.exit(1)
}

if (destinationAccount.includes('REQUIRES_CONNECT_SETUP') || !/^acct_[A-Za-z0-9]+$/.test(destinationAccount)) {
  console.error('[live-money-flow] FAIL STRIPE_CANARY_CONNECTED_ACCOUNT_ID is a placeholder or invalid. Set a real connected account id after enabling Stripe Connect.')
  process.exit(1)
}

if (!Number.isInteger(amount) || amount <= 0) {
  console.error('[live-money-flow] FAIL STRIPE_CANARY_AMOUNT_CENTS must be a positive integer.')
  process.exit(1)
}

const canaryTag = `money_canary_${Date.now()}`

const platformAccount = await stripeGet('/v1/account', stripeSecret)
if (platformAccount.status >= 400 || !platformAccount.payload || platformAccount.payload.object !== 'account') {
  const message = typeof platformAccount.payload?.error?.message === 'string'
    ? platformAccount.payload.error.message
    : 'Unknown Stripe error while retrieving platform account'
  console.error(`[live-money-flow] FAIL unable to retrieve platform account: ${message}`)
  process.exit(1)
}

if (platformAccount.payload.id === destinationAccount) {
  console.error('[live-money-flow] FAIL STRIPE_CANARY_CONNECTED_ACCOUNT_ID points to the platform account itself.')
  console.error('[live-money-flow] Use a real connected account id (acct_*) different from the platform account.')
  process.exit(1)
}

const connectProbe = await stripeGet('/v1/accounts?limit=1', stripeSecret)
if (connectProbe.status >= 400) {
  const message = typeof connectProbe.payload?.error?.message === 'string'
    ? connectProbe.payload.error.message
    : 'Unknown Stripe error while probing Connect'

  if (message.includes("signed up for Connect")) {
    console.error(`[live-money-flow] FAIL Stripe Connect is not enabled for this ${keyMode} Stripe account.`)
    process.exit(1)
  }

  console.error(`[live-money-flow] FAIL Stripe Connect probe failed: ${message}`)
  process.exit(1)
}

// In test mode, we avoid relying on the platform balance (transfers require available balance).
// Instead, run a destination charge + refund canary using real Stripe APIs and a test PaymentMethod.
if (keyMode === 'test') {
  const fee = Math.max(1, Math.floor(amount * 0.03))
  const charge = await stripePost(
    '/v1/payment_intents',
    {
      amount: String(amount),
      currency,
      confirm: 'true',
      payment_method: 'pm_card_visa',
      // Avoid return_url requirements for redirect-based methods.
      'automatic_payment_methods[enabled]': 'true',
      'automatic_payment_methods[allow_redirects]': 'never',
      // Destination charge: funds to connected account, fee retained by platform.
      application_fee_amount: String(Math.min(fee, amount - 1)),
      'transfer_data[destination]': destinationAccount,
      description: `Analog Research stripe canary destination_charge ${canaryTag}`,
      'metadata[canary_tag]': canaryTag,
      'metadata[source]': 'codex_quality_gate',
    },
    stripeSecret
  )

  if (charge.status < 200 || charge.status >= 300 || !charge.payload || charge.payload.object !== 'payment_intent') {
    console.error('[live-money-flow] FAIL creating test destination charge failed.')
    console.error(JSON.stringify(charge.payload))
    process.exit(1)
  }

  if (charge.payload.status !== 'succeeded') {
    console.error(`[live-money-flow] FAIL test destination charge did not succeed (status=${charge.payload.status}).`)
    console.error(JSON.stringify(charge.payload))
    process.exit(1)
  }

  const refund = await refundPaymentIntent(charge.payload.id, amount, stripeSecret)
  if (!refund.ok) {
    console.error(`[live-money-flow] FAIL test charge succeeded but refund failed: ${refund.error}`)
    console.error(JSON.stringify(refund.refund))
    process.exit(1)
  }

  console.log(
    `[live-money-flow] PASS mode=${keyMode} payment_intent=${charge.payload.id} refund=${refund.refundId} amount=${amount}${currency} destination=${destinationAccount}`
  )
  process.exit(0)
}

async function createTransfer() {
  return stripePost(
    '/v1/transfers',
    {
      amount: String(amount),
      currency,
      destination: destinationAccount,
      description: `Analog Research stripe canary ${canaryTag}`,
      'metadata[canary_tag]': canaryTag,
      'metadata[source]': 'codex_quality_gate',
    },
    stripeSecret
  )
}

let transfer = await createTransfer()

if (transfer.status < 200 || transfer.status >= 300 || !transfer.payload || transfer.payload.object !== 'transfer') {
  console.error('[live-money-flow] FAIL creating Stripe transfer failed.')
  console.error(JSON.stringify(transfer.payload))
  process.exit(1)
}

const transferId = transfer.payload.id

const reversal = await stripePost(
  `/v1/transfers/${transferId}/reversals`,
  {
    amount: String(amount),
    description: `Analog Research live money canary reversal ${canaryTag}`,
    'metadata[canary_tag]': canaryTag,
    'metadata[source]': 'codex_quality_gate',
  },
  stripeSecret
)

if (reversal.status < 200 || reversal.status >= 300 || !reversal.payload || reversal.payload.object !== 'transfer_reversal') {
  console.error(`[live-money-flow] FAIL transfer ${transferId} created but reversal failed. Immediate manual action required.`)
  console.error(JSON.stringify(reversal.payload))
  process.exit(1)
}

console.log(
  `[live-money-flow] PASS mode=${keyMode} transfer=${transferId} reversal=${reversal.payload.id} amount=${amount}${currency}`
)
