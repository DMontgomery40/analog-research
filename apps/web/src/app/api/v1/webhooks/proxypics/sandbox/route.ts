import { NextRequest } from 'next/server'

import { handleProxyPicsWebhook } from '@/lib/external-jobs/proxypics-webhook'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  return handleProxyPicsWebhook({
    request,
    env: 'sandbox',
    expectedToken: process.env.PROXYPICS_WEBHOOK_TOKEN_SANDBOX,
  })
}

