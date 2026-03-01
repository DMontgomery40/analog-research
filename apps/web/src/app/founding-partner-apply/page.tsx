import { Suspense } from 'react'
import { FoundingPartnerApplyForm } from './ui'

function LoadingFallback() {
  return (
    <main className="min-h-screen bg-background py-12">
      <div className="mx-auto w-full max-w-3xl px-4">
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">Loading application form...</p>
        </div>
      </div>
    </main>
  )
}

export default function FoundingPartnerApplyPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <FoundingPartnerApplyForm />
    </Suspense>
  )
}
