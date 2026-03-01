'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

interface AccountStatus {
  readyToReceivePayments: boolean
  onboardingComplete: boolean
  requirementsStatus: string | null
  stripeTransfersStatus: string | null
}

interface ConnectedAccountRow {
  id: string
  user_id: string
  stripe_account_id: string
  display_name: string
  contact_email: string
  created_at: string
  updated_at: string
  status: AccountStatus | null
  statusError?: string
}

interface ProductRow {
  id: string
  name: string
  description: string | null
  active: boolean
  connectedAccountId: string | null
  defaultPrice: {
    id: string
    unitAmount: number | null
    currency: string
  } | null
  created: number
}

function currencyFromCents(cents: number | null | undefined, currency: string | null | undefined): string {
  if (!cents || !currency) return 'N/A'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100)
}

export default function AdminConnectSamplePage() {
  const [accounts, setAccounts] = useState<ConnectedAccountRow[]>([])
  const [products, setProducts] = useState<ProductRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreatingAccount, setIsCreatingAccount] = useState(false)
  const [isCreatingProduct, setIsCreatingProduct] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [displayName, setDisplayName] = useState('')
  const [contactEmail, setContactEmail] = useState('')

  const [productName, setProductName] = useState('')
  const [productDescription, setProductDescription] = useState('')
  const [productPriceInCents, setProductPriceInCents] = useState('500')
  const [productCurrency, setProductCurrency] = useState('usd')
  const [selectedConnectedAccount, setSelectedConnectedAccount] = useState('')

  const connectedAccountOptions = useMemo(
    () => accounts.map((account) => ({
      id: account.stripe_account_id,
      label: `${account.display_name} (${account.stripe_account_id})`,
    })),
    [accounts]
  )

  async function fetchAccounts() {
    const response = await fetch('/api/v1/admin/connect-sample/accounts', { cache: 'no-store' })
    const payload = await response.json()
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || 'Failed to fetch connected accounts')
    }

    const nextAccounts = payload.data.accounts as ConnectedAccountRow[]
    setAccounts(nextAccounts)

    if (!selectedConnectedAccount && nextAccounts.length > 0) {
      setSelectedConnectedAccount(nextAccounts[0].stripe_account_id)
    }
  }

  async function fetchProducts() {
    const response = await fetch('/api/v1/admin/connect-sample/products', { cache: 'no-store' })
    const payload = await response.json()
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || 'Failed to fetch products')
    }

    setProducts(payload.data.products as ProductRow[])
  }

  async function refreshAll() {
    setIsLoading(true)
    setError(null)
    try {
      await Promise.all([fetchAccounts(), fetchProducts()])
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    refreshAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function createConnectedAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsCreatingAccount(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/v1/admin/connect-sample/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName,
          contactEmail,
        }),
      })

      const payload = await response.json()
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to create connected account')
      }

      setSuccess(`Connected account created: ${payload.data.account.id}`)
      setDisplayName('')
      setContactEmail('')
      await refreshAll()
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError))
    } finally {
      setIsCreatingAccount(false)
    }
  }

  async function openOnboarding(accountId: string) {
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch(`/api/v1/admin/connect-sample/accounts/${accountId}/onboarding-link`, {
        method: 'POST',
      })

      const payload = await response.json()
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to create onboarding link')
      }

      window.location.assign(payload.data.url)
    } catch (onboardingError) {
      setError(onboardingError instanceof Error ? onboardingError.message : String(onboardingError))
    }
  }

  async function refreshAccountStatus(accountId: string) {
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch(`/api/v1/admin/connect-sample/accounts/${accountId}/status`, {
        cache: 'no-store',
      })
      const payload = await response.json()
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to refresh account status')
      }

      setAccounts((current) => current.map((account) => (
        account.stripe_account_id === accountId
          ? { ...account, status: payload.data.status }
          : account
      )))

      setSuccess(`Refreshed status for ${accountId}`)
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : String(statusError))
    }
  }

  async function createProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsCreatingProduct(true)
    setError(null)
    setSuccess(null)

    const parsedPrice = Number.parseInt(productPriceInCents, 10)
    if (!Number.isInteger(parsedPrice) || parsedPrice <= 0) {
      setError('Price in cents must be a positive integer.')
      setIsCreatingProduct(false)
      return
    }

    try {
      const response = await fetch('/api/v1/admin/connect-sample/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: productName,
          description: productDescription,
          connectedAccountId: selectedConnectedAccount,
          priceInCents: parsedPrice,
          currency: productCurrency,
        }),
      })

      const payload = await response.json()
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to create product')
      }

      setSuccess(`Product created: ${payload.data.product.id}`)
      setProductName('')
      setProductDescription('')
      setProductPriceInCents('500')
      await fetchProducts()
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError))
    } finally {
      setIsCreatingProduct(false)
    }
  }

  return (
    <div className="p-6 space-y-8 max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Stripe Connect Sample</h1>
          <p className="text-muted-foreground mt-1">
            Admin-only sandbox for Connect v2 onboarding, product creation, and storefront checkout.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/connect-sample"
            className="px-4 py-2 rounded-md border border-border hover:bg-accent transition-colors"
          >
            Open Storefront
          </Link>
          <button
            onClick={refreshAll}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-red-400">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-emerald-400">
          {success}
        </div>
      )}

      <section className="rounded-xl border border-border p-5 space-y-4">
        <h2 className="text-xl font-semibold">1) Create Connected Account</h2>
        <form onSubmit={createConnectedAccount} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Display name"
            className="px-3 py-2 rounded-md border border-border bg-background"
            required
          />
          <input
            value={contactEmail}
            onChange={(event) => setContactEmail(event.target.value)}
            placeholder="contact@example.com"
            type="email"
            className="px-3 py-2 rounded-md border border-border bg-background"
            required
          />
          <button
            type="submit"
            disabled={isCreatingAccount}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {isCreatingAccount ? 'Creating...' : 'Create connected account'}
          </button>
        </form>

        <div className="space-y-3">
          {isLoading ? (
            <p className="text-muted-foreground">Loading connected accounts...</p>
          ) : accounts.length === 0 ? (
            <p className="text-muted-foreground">No mapped connected accounts yet.</p>
          ) : (
            accounts.map((account) => (
              <div key={account.id} className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{account.display_name}</p>
                    <p className="text-sm text-muted-foreground">{account.contact_email}</p>
                    <p className="text-xs text-muted-foreground mt-1">{account.stripe_account_id}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => refreshAccountStatus(account.stripe_account_id)}
                      className="px-3 py-2 rounded-md border border-border hover:bg-accent"
                    >
                      Refresh status
                    </button>
                    <button
                      onClick={() => openOnboarding(account.stripe_account_id)}
                      className="px-3 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90"
                    >
                      Onboard to collect payments
                    </button>
                  </div>
                </div>

                {account.status ? (
                  <div className="text-sm grid grid-cols-1 md:grid-cols-4 gap-2">
                    <div>
                      <span className="text-muted-foreground">Ready to receive:</span>{' '}
                      <span className={account.status.readyToReceivePayments ? 'text-emerald-400' : 'text-amber-400'}>
                        {String(account.status.readyToReceivePayments)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Onboarding complete:</span>{' '}
                      <span className={account.status.onboardingComplete ? 'text-emerald-400' : 'text-amber-400'}>
                        {String(account.status.onboardingComplete)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Requirements:</span>{' '}
                      {account.status.requirementsStatus || 'N/A'}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Transfers capability:</span>{' '}
                      {account.status.stripeTransfersStatus || 'N/A'}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-amber-400">
                    Could not load status: {account.statusError || 'Unknown error'}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-xl border border-border p-5 space-y-4">
        <h2 className="text-xl font-semibold">2) Create Platform Product</h2>
        <form onSubmit={createProduct} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              value={productName}
              onChange={(event) => setProductName(event.target.value)}
              placeholder="Product name"
              className="px-3 py-2 rounded-md border border-border bg-background"
              required
            />
            <select
              value={selectedConnectedAccount}
              onChange={(event) => setSelectedConnectedAccount(event.target.value)}
              className="px-3 py-2 rounded-md border border-border bg-background"
              required
            >
              <option value="">Select connected account</option>
              {connectedAccountOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </div>

          <textarea
            value={productDescription}
            onChange={(event) => setProductDescription(event.target.value)}
            placeholder="Product description"
            className="w-full px-3 py-2 rounded-md border border-border bg-background"
            rows={3}
            required
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              value={productPriceInCents}
              onChange={(event) => setProductPriceInCents(event.target.value)}
              placeholder="Price in cents (e.g. 500)"
              className="px-3 py-2 rounded-md border border-border bg-background"
              required
            />
            <input
              value={productCurrency}
              onChange={(event) => setProductCurrency(event.target.value.toLowerCase())}
              placeholder="usd"
              className="px-3 py-2 rounded-md border border-border bg-background"
              maxLength={3}
              required
            />
            <button
              type="submit"
              disabled={isCreatingProduct}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {isCreatingProduct ? 'Creating...' : 'Create product'}
            </button>
          </div>
        </form>

        <div className="space-y-3">
          {products.length === 0 ? (
            <p className="text-muted-foreground">No products created yet.</p>
          ) : (
            products.map((product) => (
              <div key={product.id} className="rounded-lg border border-border p-4 text-sm space-y-1">
                <p className="font-medium text-base">{product.name}</p>
                <p className="text-muted-foreground">{product.description || 'No description'}</p>
                <p>Product ID: <code>{product.id}</code></p>
                <p>Connected account: <code>{product.connectedAccountId || 'N/A'}</code></p>
                <p>Price: {currencyFromCents(product.defaultPrice?.unitAmount, product.defaultPrice?.currency)}</p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-xl border border-border p-5 space-y-3">
        <h2 className="text-xl font-semibold">3) Webhook setup (thin events)</h2>
        <p className="text-sm text-muted-foreground">
          Configure Stripe to send thin events to <code>/api/v1/webhooks/stripe-connect-sample</code> and set
          <code> STRIPE_CONNECT_SAMPLE_WEBHOOK_SECRET=whsec_***</code> in your env.
        </p>
        <pre className="text-xs bg-muted/40 border border-border rounded-md p-3 overflow-x-auto">
{`stripe listen --thin-events 'v2.core.account[requirements].updated,v2.core.account[configuration.recipient].capability_status_updated' --forward-thin-to https://your-domain.com/api/v1/webhooks/stripe-connect-sample`}
        </pre>
      </section>
    </div>
  )
}
