import Link from 'next/link'

export default function ThankYouPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-16">
      <div className="mx-auto max-w-xl rounded-sm border border-border bg-card p-8 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Thanks for reaching out.</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          We received your message and will follow up soon.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-sm border border-primary bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Return to homepage
        </Link>
      </div>
    </main>
  )
}

