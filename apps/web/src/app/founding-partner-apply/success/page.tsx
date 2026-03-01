import Link from 'next/link'

export default function FoundingPartnerApplySuccessPage() {
  return (
    <main className="min-h-screen bg-background py-20">
      <div className="mx-auto w-full max-w-2xl px-4 text-center">
        <h1 className="text-3xl font-bold">Application received</h1>
        <p className="mt-4 text-muted-foreground">
          Thank you. We received your founding partner application and will follow up by email.
        </p>
        <div className="mt-8">
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Return to home
          </Link>
        </div>
      </div>
    </main>
  )
}
