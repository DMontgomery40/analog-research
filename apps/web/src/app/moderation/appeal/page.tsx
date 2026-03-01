'use client'

import { FormEvent, Suspense, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, CheckCircle2, ShieldAlert } from 'lucide-react'

function AppealPageFallback() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto">
          <div className="bg-card border border-border rounded-xl p-6">
            <p className="text-sm text-muted-foreground">Loading appeal form...</p>
          </div>
        </div>
      </main>
    </div>
  )
}

function ModerationAppealForm() {
  const searchParams = useSearchParams()

  const decisionId = useMemo(() => searchParams.get('decision_id') || '', [searchParams])
  const contentType = useMemo(() => searchParams.get('content_type') || '', [searchParams])
  const contentId = useMemo(() => searchParams.get('content_id') || '', [searchParams])

  const [email, setEmail] = useState('')
  const [appealReason, setAppealReason] = useState('')
  const [context, setContext] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const formData = new URLSearchParams()
      formData.append('form-name', 'moderation_appeal_v1')
      formData.append('bot-field', '')
      formData.append('decision_id', decisionId)
      formData.append('content_type', contentType)
      formData.append('content_id', contentId)
      formData.append('email', email)
      formData.append('appeal_reason', appealReason)
      formData.append('freeform_context', context)

      const response = await fetch('/netlify-forms.html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      })

      if (!response.ok) {
        setError('Failed to submit appeal. Please try again.')
        return
      }

      setIsSuccess(true)
    } catch {
      setError('Failed to submit appeal. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border">
          <div className="container mx-auto px-4 py-4">
            <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
              Back to home
            </Link>
          </div>
        </header>

        <main className="container mx-auto px-4 py-12">
          <div className="max-w-xl mx-auto text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Appeal Submitted</h1>
            <p className="text-muted-foreground mb-6">
              Thanks. We received your appeal and will review it shortly.
            </p>
            <Link href="/dashboard" className="text-primary hover:underline">
              Back to dashboard
            </Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <ShieldAlert className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-3xl font-bold mb-2">Moderation Appeal</h1>
            <p className="text-muted-foreground">
              If your content was blocked, you can request a manual review.
            </p>
          </div>

          <div className="bg-card border border-border rounded-xl p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                  {error}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="decision_id" className="block text-sm font-medium mb-2">Decision ID</label>
                  <input
                    id="decision_id"
                    value={decisionId}
                    disabled
                    className="w-full px-3 py-2 bg-muted border border-input rounded-md text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="content_type" className="block text-sm font-medium mb-2">Content Type</label>
                  <input
                    id="content_type"
                    value={contentType}
                    disabled
                    className="w-full px-3 py-2 bg-muted border border-input rounded-md text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="content_id" className="block text-sm font-medium mb-2">Content ID</label>
                  <input
                    id="content_id"
                    value={contentId}
                    disabled
                    className="w-full px-3 py-2 bg-muted border border-input rounded-md text-sm"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium mb-2">Contact Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>

              <div>
                <label htmlFor="appeal_reason" className="block text-sm font-medium mb-2">Why should this be reconsidered?</label>
                <textarea
                  id="appeal_reason"
                  value={appealReason}
                  onChange={(event) => setAppealReason(event.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  required
                />
              </div>

              <div>
                <label htmlFor="context" className="block text-sm font-medium mb-2">Additional Context (optional)</label>
                <textarea
                  id="context"
                  value={context}
                  onChange={(event) => setContext(event.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-primary text-primary-foreground py-2 rounded-md font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Appeal'}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  )
}

export default function ModerationAppealPage() {
  return (
    <Suspense fallback={<AppealPageFallback />}>
      <ModerationAppealForm />
    </Suspense>
  )
}
