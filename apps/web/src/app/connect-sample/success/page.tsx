import Link from 'next/link'

interface ConnectSampleSuccessPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function ConnectSampleSuccessPage({ searchParams }: ConnectSampleSuccessPageProps) {
  const params = await searchParams
  const rawSessionId = params.session_id
  const sessionId = Array.isArray(rawSessionId) ? rawSessionId[0] : rawSessionId

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <h1 className="text-3xl font-bold">Payment complete</h1>
        <p className="text-muted-foreground">
          Checkout redirected successfully. Use the session id below to inspect details in Stripe.
        </p>

        <div className="rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Checkout Session ID</p>
          <p className="font-mono text-sm break-all">{sessionId || 'missing session_id'}</p>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/connect-sample" className="px-4 py-2 rounded-md border border-border hover:bg-accent">
            Back to storefront
          </Link>
          <Link href="/admin/connect-sample" className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90">
            Back to admin sample
          </Link>
        </div>
      </div>
    </main>
  )
}
