'use client'

import Link from 'next/link'
import { useEffect } from 'react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[dashboard] Unhandled render error', error)
  }, [error])

  return (
    <div className="p-6">
      <div className="max-w-xl bg-card border border-border rounded-xl p-8">
        <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
        <p className="text-muted-foreground mb-6">
          The dashboard hit an unexpected error. You can retry, or go back to your dashboard home.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium hover:bg-primary/90 transition-colors"
          >
            Retry
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 border border-border px-4 py-2 rounded-md font-medium hover:bg-accent transition-colors"
          >
            Back to Dashboard
          </Link>
        </div>
        {process.env.NODE_ENV !== 'production' && (
          <pre className="mt-6 text-xs bg-muted p-3 rounded overflow-auto">{error.message}</pre>
        )}
      </div>
    </div>
  )
}

