'use client'

import { FormEvent, Suspense, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'

function QualityAppealFallback() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
        </div>
      </header>
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto bg-card border border-border rounded-xl p-6">
          <p className="text-sm text-muted-foreground">Loading form...</p>
        </div>
      </main>
    </div>
  )
}

function QualityAppealForm() {
  const searchParams = useSearchParams()
  const initialScoreType = useMemo(() => (searchParams.get('score_type') || 'hls').toLowerCase(), [searchParams])
  const initialEntityType = useMemo(() => (searchParams.get('entity_type') || 'human').toLowerCase(), [searchParams])
  const initialEntityId = useMemo(() => searchParams.get('entity_id') || '', [searchParams])

  const [email, setEmail] = useState('')
  const [scoreType, setScoreType] = useState(initialScoreType)
  const [entityType, setEntityType] = useState(initialEntityType)
  const [entityId, setEntityId] = useState(initialEntityId)
  const [issueType, setIssueType] = useState('fraud-impact')
  const [details, setDetails] = useState('')
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [resolution, setResolution] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const formData = new URLSearchParams()
      formData.append('form-name', 'quality_score_appeal_v1')
      formData.append('bot-field', '')
      formData.append('email', email)
      formData.append('score_type', scoreType)
      formData.append('entity_type', entityType)
      formData.append('entity_id', entityId)
      formData.append('issue_type', issueType)
      formData.append('details', details)
      formData.append('evidence_url', evidenceUrl)
      formData.append('resolution', resolution)
      formData.append('source_page', window.location.href)

      const response = await fetch('/netlify-forms.html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      })

      if (!response.ok) {
        setError('Failed to submit the appeal form. Please try again.')
        return
      }

      setIsSuccess(true)
    } catch {
      setError('Failed to submit the appeal form. Please try again.')
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
              Back
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
              Thanks. Your quality-score appeal was submitted for manual review.
            </p>
            <Link href="/quality/formulas" className="text-primary hover:underline">
              Back to formulas
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
            Back
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">Quality Score Appeal</h1>
            <p className="text-muted-foreground">
              Submit evidence if your score was impacted by scams, abuse, compromised accounts, or incorrect data.
            </p>
          </div>

          <div className="bg-card border border-border rounded-xl p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                  {error}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
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
                  <label htmlFor="score_type" className="block text-sm font-medium mb-2">Score Type</label>
                  <select
                    id="score_type"
                    value={scoreType}
                    onChange={(event) => setScoreType(event.target.value)}
                    className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="hls">HLS (Human)</option>
                    <option value="als">ALS (Agent)</option>
                    <option value="bls">BLS (Bounty)</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="entity_type" className="block text-sm font-medium mb-2">Entity Type</label>
                  <select
                    id="entity_type"
                    value={entityType}
                    onChange={(event) => setEntityType(event.target.value)}
                    className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="human">Human</option>
                    <option value="agent">Agent</option>
                    <option value="bounty">Bounty</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="entity_id" className="block text-sm font-medium mb-2">Entity ID (optional)</label>
                  <input
                    id="entity_id"
                    type="text"
                    value={entityId}
                    onChange={(event) => setEntityId(event.target.value)}
                    className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="UUID"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="issue_type" className="block text-sm font-medium mb-2">Issue Type</label>
                <select
                  id="issue_type"
                  value={issueType}
                  onChange={(event) => setIssueType(event.target.value)}
                  className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="fraud-impact">I was targeted by scam/fraud behavior</option>
                  <option value="account-compromise">My account or agent was compromised</option>
                  <option value="data-error">Score is based on incorrect/missing data</option>
                  <option value="other">Other scoring issue</option>
                </select>
              </div>

              <div>
                <label htmlFor="details" className="block text-sm font-medium mb-2">What happened?</label>
                <textarea
                  id="details"
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  placeholder="Describe the timeline, impacted jobs, and why this should be reviewed."
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="evidence_url" className="block text-sm font-medium mb-2">Evidence URL (optional)</label>
                  <input
                    id="evidence_url"
                    type="url"
                    value={evidenceUrl}
                    onChange={(event) => setEvidenceUrl(event.target.value)}
                    className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label htmlFor="resolution" className="block text-sm font-medium mb-2">Requested Resolution (optional)</label>
                  <textarea
                    id="resolution"
                    value={resolution}
                    onChange={(event) => setResolution(event.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    placeholder="What correction do you expect?"
                  />
                </div>
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

export default function QualityAppealPage() {
  return (
    <Suspense fallback={<QualityAppealFallback />}>
      <QualityAppealForm />
    </Suspense>
  )
}
