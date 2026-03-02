'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, PlusCircle } from 'lucide-react'
import { SkillsInput } from '@/components/skills-input'

type PricingMode = 'bid' | 'fixed_per_spot'
type ProofReviewMode = 'manual' | 'llm_assisted'
type PreferredPaymentMethod = '' | 'stripe' | 'crypto'

interface CreatedBounty {
  id: string
  title: string
}

function toCents(amountUsd: string): number {
  return Math.round(Number.parseFloat(amountUsd) * 100)
}

export default function CreateBountyPage() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdBounty, setCreatedBounty] = useState<CreatedBounty | null>(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [skillsRequired, setSkillsRequired] = useState<string[]>([])
  const [budgetMinUsd, setBudgetMinUsd] = useState('50')
  const [budgetMaxUsd, setBudgetMaxUsd] = useState('150')
  const [currency, setCurrency] = useState('USD')
  const [spotsAvailable, setSpotsAvailable] = useState('1')
  const [pricingMode, setPricingMode] = useState<PricingMode>('bid')
  const [fixedSpotAmountUsd, setFixedSpotAmountUsd] = useState('')
  const [preferredPaymentMethod, setPreferredPaymentMethod] = useState<PreferredPaymentMethod>('')
  const [deadline, setDeadline] = useState('')
  const [proofReviewMode, setProofReviewMode] = useState<ProofReviewMode>('manual')
  const [proofReviewPrompt, setProofReviewPrompt] = useState('')

  const fixedAmountDisabled = pricingMode !== 'fixed_per_spot'

  const budgetHelper = useMemo(() => {
    const min = Number.parseFloat(budgetMinUsd)
    const max = Number.parseFloat(budgetMaxUsd)
    if (!Number.isFinite(min) || !Number.isFinite(max)) return ''
    return `Range: ${currency.toUpperCase()} ${min.toFixed(2)} - ${max.toFixed(2)}`
  }, [budgetMinUsd, budgetMaxUsd, currency])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setError(null)
    setCreatedBounty(null)

    const budgetMin = toCents(budgetMinUsd)
    const budgetMax = toCents(budgetMaxUsd)
    const spots = Number.parseInt(spotsAvailable, 10)

    if (!Number.isFinite(budgetMin) || !Number.isFinite(budgetMax)) {
      setError('Budget values must be valid numbers')
      setSubmitting(false)
      return
    }

    if (budgetMin < 500 || budgetMax < 500) {
      setError('Minimum budget is $5.00')
      setSubmitting(false)
      return
    }

    if (budgetMin > budgetMax) {
      setError('Minimum budget must be less than or equal to maximum budget')
      setSubmitting(false)
      return
    }

    if (!Number.isInteger(spots) || spots < 1 || spots > 500) {
      setError('Spots available must be an integer between 1 and 500')
      setSubmitting(false)
      return
    }

    const body: Record<string, unknown> = {
      title: title.trim(),
      description: description.trim(),
      skills_required: skillsRequired,
      budget_min: budgetMin,
      budget_max: budgetMax,
      spots_available: spots,
      pricing_mode: pricingMode,
      currency: currency.trim().toUpperCase(),
      proof_review_mode: proofReviewMode,
    }

    if (pricingMode === 'fixed_per_spot') {
      const fixedSpotAmount = toCents(fixedSpotAmountUsd)
      if (!Number.isFinite(fixedSpotAmount) || fixedSpotAmount <= 0) {
        setError('Fixed amount must be a valid positive number')
        setSubmitting(false)
        return
      }
      body.fixed_spot_amount = fixedSpotAmount
    }

    if (preferredPaymentMethod) {
      body.preferred_payment_method = preferredPaymentMethod
    }

    if (deadline.trim().length > 0) {
      const parsedDeadline = new Date(deadline)
      if (Number.isNaN(parsedDeadline.getTime())) {
        setError('Deadline must be a valid date/time')
        setSubmitting(false)
        return
      }
      body.deadline = parsedDeadline.toISOString()
    }

    if (proofReviewMode === 'llm_assisted' && proofReviewPrompt.trim().length > 0) {
      body.proof_review_prompt = proofReviewPrompt.trim()
    }

    try {
      const response = await fetch('/api/v1/bounties', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })

      const payload = await response.json().catch(() => null) as
        | { success: true; data: CreatedBounty }
        | { success: false; error?: string | string[] | { message?: string }[] }
        | null

      if (!response.ok || !payload || payload.success !== true) {
        if (payload && 'error' in payload && payload.error) {
          if (typeof payload.error === 'string') {
            setError(payload.error)
          } else if (Array.isArray(payload.error)) {
            const [first] = payload.error
            if (typeof first === 'string') {
              setError(first)
            } else {
              setError(first?.message || 'Failed to create bounty')
            }
          } else {
            setError('Failed to create bounty')
          }
        } else {
          setError('Failed to create bounty')
        }
        setSubmitting(false)
        return
      }

      setCreatedBounty(payload.data)
      setTitle('')
      setDescription('')
      setSkillsRequired([])
      setBudgetMinUsd('50')
      setBudgetMaxUsd('150')
      setSpotsAvailable('1')
      setPricingMode('bid')
      setFixedSpotAmountUsd('')
      setDeadline('')
      setProofReviewMode('manual')
      setProofReviewPrompt('')
    } catch {
      setError('Failed to create bounty')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-8">
        <Link
          href="/dashboard/bounties"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to My Bounties
        </Link>
        <h1 className="text-2xl font-bold mt-3">Create Bounty</h1>
        <p className="text-muted-foreground">Post a new bounty for humans to apply to.</p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive">
          {error}
        </div>
      )}

      {createdBounty && (
        <div className="mb-6 rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-green-700">
          Bounty created: <span className="font-medium">{createdBounty.title}</span>
          <div className="mt-2">
            <Link href={`/dashboard/bounties/${createdBounty.id}`} className="text-primary hover:underline">
              Open bounty details
            </Link>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h2 className="font-semibold">Bounty Details</h2>

          <div>
            <label className="block text-sm font-medium mb-2">Title</label>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Collect 20 storefront photos in Denver"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Description</label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring min-h-[140px]"
              placeholder="Describe the work, deliverables, and quality bar."
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Required Skills</label>
            <SkillsInput
              value={skillsRequired}
              onChange={setSkillsRequired}
              placeholder="Add a required skill and press Enter"
            />
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h2 className="font-semibold">Pricing</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Budget Minimum (USD)</label>
              <input
                type="number"
                min="5"
                step="0.01"
                value={budgetMinUsd}
                onChange={(event) => setBudgetMinUsd(event.target.value)}
                className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Budget Maximum (USD)</label>
              <input
                type="number"
                min="5"
                step="0.01"
                value={budgetMaxUsd}
                onChange={(event) => setBudgetMaxUsd(event.target.value)}
                className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                required
              />
            </div>
          </div>

          {budgetHelper && (
            <p className="text-xs text-muted-foreground">{budgetHelper}</p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Currency</label>
              <input
                type="text"
                value={currency}
                onChange={(event) => setCurrency(event.target.value.toUpperCase().slice(0, 3))}
                className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                maxLength={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Spots Available</label>
              <input
                type="number"
                min="1"
                max="500"
                step="1"
                value={spotsAvailable}
                onChange={(event) => setSpotsAvailable(event.target.value)}
                className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Pricing Mode</label>
              <select
                value={pricingMode}
                onChange={(event) => setPricingMode(event.target.value as PricingMode)}
                className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="bid">Bid</option>
                <option value="fixed_per_spot">Fixed Per Spot</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Fixed Amount Per Spot (USD)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={fixedSpotAmountUsd}
              onChange={(event) => setFixedSpotAmountUsd(event.target.value)}
              className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              disabled={fixedAmountDisabled}
              placeholder={fixedAmountDisabled ? 'Enable by selecting Fixed Per Spot' : '25.00'}
            />
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h2 className="font-semibold">Preferences</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Preferred Payment Method</label>
              <select
                value={preferredPaymentMethod}
                onChange={(event) => setPreferredPaymentMethod(event.target.value as PreferredPaymentMethod)}
                className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">No preference</option>
                <option value="stripe">Stripe</option>
                <option value="crypto">Crypto</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Deadline (optional)</label>
              <input
                type="datetime-local"
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
                className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Proof Review</label>
            <select
              value={proofReviewMode}
              onChange={(event) => setProofReviewMode(event.target.value as ProofReviewMode)}
              className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="manual">Manual</option>
              <option value="llm_assisted">LLM Assisted</option>
            </select>
          </div>

          {proofReviewMode === 'llm_assisted' && (
            <div>
              <label className="block text-sm font-medium mb-2">Proof Review Prompt (optional)</label>
              <textarea
                value={proofReviewPrompt}
                onChange={(event) => setProofReviewPrompt(event.target.value)}
                className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring min-h-[120px]"
                placeholder="Describe pass/fail criteria for automated proof review."
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Link
            href="/dashboard/bounties"
            className="px-4 py-2 border border-border rounded-md hover:bg-accent transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2 rounded-md font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <PlusCircle className="w-4 h-4" />
                Create Bounty
              </>
            )}
          </button>
          {createdBounty && (
            <button
              type="button"
              onClick={() => router.push(`/dashboard/bounties/${createdBounty.id}`)}
              className="px-4 py-2 border border-border rounded-md hover:bg-accent transition-colors"
            >
              Open Created Bounty
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
