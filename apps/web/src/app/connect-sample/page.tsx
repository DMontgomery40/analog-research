'use client'

import { useEffect, useState } from 'react'

interface AccountStatus {
  readyToReceivePayments: boolean
  onboardingComplete: boolean
  requirementsStatus: string | null
  stripeTransfersStatus: string | null
}

interface StorefrontAccount {
  accountId: string
  displayName: string
  status: AccountStatus | null
  statusError?: string
}

interface StorefrontProduct {
  id: string
  name: string
  description: string | null
  connectedAccountId: string | null
  defaultPrice: {
    id: string
    unitAmount: number | null
    currency: string
  } | null
}

function formatPrice(unitAmount: number | null | undefined, currency: string | null | undefined): string {
  if (!unitAmount || !currency) return 'N/A'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(unitAmount / 100)
}

export default function ConnectSampleStorefrontPage() {
  const [accounts, setAccounts] = useState<StorefrontAccount[]>([])
  const [products, setProducts] = useState<StorefrontProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [buyingProductId, setBuyingProductId] = useState<string | null>(null)

  async function loadStorefront() {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/v1/connect-sample/storefront', { cache: 'no-store' })
      const payload = await response.json()

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to load storefront')
      }

      setAccounts(payload.data.accounts || [])
      setProducts(payload.data.products || [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStorefront()
  }, [])

  async function startCheckout(productId: string) {
    setBuyingProductId(productId)
    setError(null)

    try {
      const response = await fetch('/api/v1/connect-sample/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, quantity: 1 }),
      })

      const payload = await response.json()
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to create checkout session')
      }

      window.location.assign(payload.data.url)
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : String(checkoutError))
      setBuyingProductId(null)
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto p-6 space-y-8">
        <header>
          <h1 className="text-3xl font-bold">Connect Sample Storefront</h1>
          <p className="text-muted-foreground mt-2">
            Simple demo storefront that lists connected accounts and products, then uses hosted Checkout.
          </p>
        </header>

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-red-400">
            {error}
          </div>
        )}

        <section className="rounded-xl border border-border p-5 space-y-3">
          <h2 className="text-xl font-semibold">Connected Accounts</h2>
          {loading ? (
            <p className="text-muted-foreground">Loading connected accounts...</p>
          ) : accounts.length === 0 ? (
            <p className="text-muted-foreground">No connected accounts configured yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {accounts.map((account) => (
                <div key={account.accountId} className="rounded-lg border border-border p-3 text-sm space-y-1">
                  <p className="font-medium">{account.displayName}</p>
                  <p className="text-xs text-muted-foreground"><code>{account.accountId}</code></p>

                  {account.status ? (
                    <>
                      <p>Ready to receive: <strong>{String(account.status.readyToReceivePayments)}</strong></p>
                      <p>Onboarding complete: <strong>{String(account.status.onboardingComplete)}</strong></p>
                      <p>Requirements: <strong>{account.status.requirementsStatus || 'N/A'}</strong></p>
                    </>
                  ) : (
                    <p className="text-amber-400">Status unavailable: {account.statusError || 'Unknown error'}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border p-5 space-y-3">
          <h2 className="text-xl font-semibold">Products</h2>
          {loading ? (
            <p className="text-muted-foreground">Loading products...</p>
          ) : products.length === 0 ? (
            <p className="text-muted-foreground">No storefront products yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {products.map((product) => (
                <article key={product.id} className="rounded-lg border border-border p-4 space-y-3">
                  <h3 className="text-lg font-medium">{product.name}</h3>
                  <p className="text-sm text-muted-foreground">{product.description || 'No description'}</p>

                  <p className="text-sm">
                    Price: <strong>{formatPrice(product.defaultPrice?.unitAmount, product.defaultPrice?.currency)}</strong>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Connected account: <code>{product.connectedAccountId || 'N/A'}</code>
                  </p>

                  <button
                    onClick={() => startCheckout(product.id)}
                    disabled={buyingProductId === product.id}
                    className="w-full px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {buyingProductId === product.id ? 'Redirecting to Checkout...' : 'Buy with Stripe Checkout'}
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
