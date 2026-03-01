import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { requireAdmin } from '@/lib/admin/admin-auth'
import { parseZodJsonBody } from '@/lib/request-body'
import { createServiceClient } from '@/lib/supabase/server'
import {
  deriveConnectSampleAccountStatus,
  getConnectSampleMissingTableErrorMessage,
  getConnectSampleStripeClient,
  isMissingConnectSampleTableError,
} from '@/lib/stripe-connect-sample'

export const runtime = 'nodejs'

const createConnectedAccountSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  contactEmail: z.string().trim().email(),
})

interface ConnectSampleAccountRow {
  id: string
  user_id: string | null
  stripe_account_id: string
  display_name: string
  contact_email: string
  created_at: string
  updated_at: string
}

function normalizeCreatedAt(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString()
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return value
  }
  return new Date().toISOString()
}

async function listAccountsFromStripe(stripeClient: ReturnType<typeof getConnectSampleStripeClient>): Promise<ConnectSampleAccountRow[]> {
  const listed = await stripeClient.v2.core.accounts.list({ limit: 100 })
  const rawAccounts = Array.isArray((listed as { data?: unknown[] }).data)
    ? ((listed as { data?: unknown[] }).data || [])
    : []

  const rows: ConnectSampleAccountRow[] = []
  for (const candidate of rawAccounts) {
    if (!candidate || typeof candidate !== 'object') continue

    const account = candidate as {
      id?: string
      display_name?: string | null
      contact_email?: string | null
      created?: string | number | null
    }

    if (!account.id || typeof account.id !== 'string') continue

    const createdAt = normalizeCreatedAt(account.created)
    rows.push({
      id: `stripe:${account.id}`,
      user_id: null,
      stripe_account_id: account.id,
      display_name: (account.display_name || account.contact_email || account.id),
      contact_email: account.contact_email || '',
      created_at: createdAt,
      updated_at: createdAt,
    })
  }

  return rows
}

export async function GET() {
  const admin = await requireAdmin()
  if (!admin.ok) {
    return NextResponse.json({ success: false, error: admin.error }, { status: admin.status })
  }

  let stripeClient
  try {
    stripeClient = getConnectSampleStripeClient()
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 503 }
    )
  }
  const supabase = await createServiceClient()

  const { data, error } = await supabase
    .from('stripe_connect_sample_accounts')
    .select('id, user_id, stripe_account_id, display_name, contact_email, created_at, updated_at')
    .order('created_at', { ascending: false })

  let warnings: string[] = []

  let rows = Array.isArray(data) ? (data as ConnectSampleAccountRow[]) : []

  if (error) {
    if (isMissingConnectSampleTableError(error)) {
      warnings = [getConnectSampleMissingTableErrorMessage()]
      try {
        rows = await listAccountsFromStripe(stripeClient)
      } catch (stripeListError) {
        return NextResponse.json(
          {
            success: false,
            error: stripeListError instanceof Error
              ? stripeListError.message
              : 'Failed to list Stripe connected accounts',
          },
          { status: 502 }
        )
      }
    } else {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
  }

  const accounts = await Promise.all(rows.map(async (row) => {
    try {
      // For this sample we always read account status live from Stripe API.
      const account = await stripeClient.v2.core.accounts.retrieve(row.stripe_account_id, {
        include: ['configuration.recipient', 'requirements'],
      })
      const status = deriveConnectSampleAccountStatus(account)

      return {
        ...row,
        status,
      }
    } catch (accountError) {
      return {
        ...row,
        status: null,
        statusError: accountError instanceof Error ? accountError.message : String(accountError),
      }
    }
  }))

  return NextResponse.json({ success: true, data: { accounts, warnings } })
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin.ok || !admin.userId) {
    return NextResponse.json({ success: false, error: admin.error }, { status: admin.status })
  }

  const parsed = await parseZodJsonBody(request, createConnectedAccountSchema)
  if (!parsed.ok) return parsed.response

  let stripeClient
  try {
    stripeClient = getConnectSampleStripeClient()
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 503 }
    )
  }
  const supabase = await createServiceClient()

  let account
  try {
    // Stripe Connect v2 Account creation. Only the requested properties are used.
    account = await stripeClient.v2.core.accounts.create({
      display_name: parsed.data.displayName,
      contact_email: parsed.data.contactEmail,
      identity: {
        country: 'us',
      },
      dashboard: 'express',
      defaults: {
        responsibilities: {
          fees_collector: 'application',
          losses_collector: 'application',
        },
      },
      configuration: {
        recipient: {
          capabilities: {
            stripe_balance: {
              stripe_transfers: {
                requested: true,
              },
            },
          },
        },
      },
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create connected account in Stripe' },
      { status: 502 }
    )
  }

  const { data, error } = await supabase
    .from('stripe_connect_sample_accounts')
    .upsert({
      user_id: admin.userId,
      stripe_account_id: account.id,
      display_name: parsed.data.displayName,
      contact_email: parsed.data.contactEmail,
    }, { onConflict: 'user_id' })
    .select('id, user_id, stripe_account_id, display_name, contact_email, created_at, updated_at')
    .single()

  if (error) {
    if (isMissingConnectSampleTableError(error)) {
      return NextResponse.json(
        {
          success: true,
          data: {
            account,
            mapping: null,
            warnings: [getConnectSampleMissingTableErrorMessage()],
          },
        }
      )
    }

    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    data: {
      account,
      mapping: data,
    },
  })
}
