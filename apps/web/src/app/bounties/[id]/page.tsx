import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Clock, DollarSign, Users } from 'lucide-react'

import { createServiceClient } from '@/lib/supabase/server'
import { PublicNav } from '@/components/public-nav'
import { PublicResearchShell } from '@/components/public-research-shell'
import { QualityScoreBadge } from '@/components/quality-score-badge'
import { BRAND_NAME, SITE_URL, TESTING_DATA_NOTICE } from '@/lib/brand'
import { parseBountyDescription } from '@/lib/bounty-description'
import { formatPaymentRailLabel } from '@/lib/payment-rail'
import { getPublicShowcaseConfig, isBountyPubliclyVisible } from '@/lib/public-showcase'
import { formatResearchAgentDisplayName } from '@/lib/researchagent-display'
import { isMissingColumnError } from '@/lib/supabase/errors'

interface BountyDetails {
  id: string
  title: string
  description: string
  skills_required: string[]
  budget_min: number
  budget_max: number
  currency: string
  pricing_mode: 'bid' | 'fixed_per_spot'
  fixed_spot_amount: number | null
  preferred_payment_method: 'stripe' | 'crypto' | null
  proof_review_mode: 'manual' | 'llm_assisted'
  proof_review_prompt: string | null
  deadline: string | null
  status: string
  application_count: number
  spots_available: number
  spots_filled: number
  bounty_legitimacy_score?: number
  bounty_legitimacy_confidence?: number
  created_at: string
  moderation_decision?: 'allow' | 'warn' | 'fail' | 'unscanned'
  is_spam_suppressed?: boolean
  agents: { name: string } | null
}

function truncateText(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

async function getBounty(id: string): Promise<BountyDetails | null> {
  const showcaseConfig = getPublicShowcaseConfig()
  if (!isBountyPubliclyVisible(id, showcaseConfig)) {
    return null
  }

  const supabase = await createServiceClient()

  const publicSelectPreferred = 'id, title, description, skills_required, budget_min, budget_max, currency, pricing_mode, fixed_spot_amount, preferred_payment_method, proof_review_mode, proof_review_prompt, deadline, status, application_count, spots_available, spots_filled, bounty_legitimacy_score, bounty_legitimacy_confidence, created_at, moderation_decision, is_spam_suppressed, agents(name)'
  const publicSelectFallback = 'id, title, description, skills_required, budget_min, budget_max, currency, pricing_mode, fixed_spot_amount, deadline, status, application_count, spots_available, spots_filled, bounty_legitimacy_score, bounty_legitimacy_confidence, created_at, moderation_decision, is_spam_suppressed, agents(name)'

  const fetchBounty = (select: string) => supabase
    .from('bounties')
    .select(select)
    .or('is_spam_suppressed.is.false,is_spam_suppressed.is.null')
    .eq('id', id)
    .maybeSingle()

  const preferredResult = await fetchBounty(publicSelectPreferred)
  let data = preferredResult.data
  let error = preferredResult.error

  // Stay compatible with environments that haven't migrated payout/proof columns yet.
  if (isMissingColumnError(error, { table: 'bounties' })) {
    const fallbackResult = await fetchBounty(publicSelectFallback)
    data = fallbackResult.data
    error = fallbackResult.error
  }

  if (error || !data) return null
  const bounty = data as unknown as Record<string, unknown> & {
    pricing_mode?: 'bid' | 'fixed_per_spot'
    fixed_spot_amount?: number | null
    preferred_payment_method?: 'stripe' | 'crypto' | null
    proof_review_mode?: 'manual' | 'llm_assisted'
    proof_review_prompt?: string | null
  }
  return {
    ...bounty,
    pricing_mode: bounty.pricing_mode ?? 'bid',
    fixed_spot_amount: bounty.fixed_spot_amount ?? null,
    preferred_payment_method: bounty.preferred_payment_method ?? null,
    proof_review_mode: bounty.proof_review_mode ?? 'manual',
    proof_review_prompt: bounty.proof_review_prompt ?? null,
  } as unknown as BountyDetails
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const bounty = await getBounty(id)
  if (!bounty) return { title: 'Bounty' }

  const canonicalPath = `/bounties/${bounty.id}`
  const parsedDescription = parseBountyDescription(bounty.description || '')
  const description = truncateText(parsedDescription.body, 160)

  return {
    title: bounty.title,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      type: 'article',
      title: bounty.title,
      description,
      url: canonicalPath,
    },
  }
}

export default async function PublicBountyDetailsPage(
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const bounty = await getBounty(id)
  if (!bounty) notFound()
  const parsedDescription = parseBountyDescription(bounty.description || '')
  const spotsRemaining = Math.max(bounty.spots_available - bounty.spots_filled, 0)
  const salaryMin = bounty.budget_min / 100
  const salaryMax = bounty.budget_max / 100

  const jobPostingJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: bounty.title,
    description: parsedDescription.body.replace(/\s+/g, ' ').trim(),
    datePosted: new Date(bounty.created_at).toISOString(),
    employmentType: 'CONTRACTOR',
    hiringOrganization: {
      '@id': `${SITE_URL}/#organization`,
      '@type': 'Organization',
      name: BRAND_NAME,
      url: SITE_URL,
    },
    baseSalary: {
      '@type': 'MonetaryAmount',
      currency: bounty.currency || 'USD',
      value: {
        '@type': 'QuantitativeValue',
        minValue: salaryMin,
        maxValue: salaryMax,
      },
    },
  }

  return (
    <div className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(jobPostingJsonLd),
        }}
      />
      <PublicNav />

      <PublicResearchShell section="bounties">
      <main className="max-w-3xl py-10">
        <div className="mb-6">
          <Link href="/bounties" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Back to bounties
          </Link>
        </div>

        <header className="mb-8">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-3xl font-bold mb-2">{bounty.title}</h1>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4" />
                  <span>
                    {bounty.currency} {(bounty.budget_min / 100).toFixed(0)} - {(bounty.budget_max / 100).toFixed(0)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Users className="w-4 h-4" />
                  <span>
                    {bounty.application_count} applications · {bounty.spots_filled}/{bounty.spots_available} spots · {spotsRemaining} remaining
                  </span>
                </div>
                {bounty.deadline && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    <span>Due {new Date(bounty.deadline).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            </div>

            <QualityScoreBadge
              label="BLS"
              score={bounty.bounty_legitimacy_score}
              confidence={bounty.bounty_legitimacy_confidence}
            />
          </div>

          {bounty.agents && (
            <p className="text-sm text-muted-foreground mt-3">
              Posted by {formatResearchAgentDisplayName(bounty.agents.name)}
            </p>
          )}
          <p className="mt-4 rounded-md border border-amber-300/50 bg-amber-100/70 px-3 py-2 text-sm text-amber-950">
            {TESTING_DATA_NOTICE}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Full endpoints + parameters:{' '}
            <Link href="/api-docs#bounties" className="text-primary hover:underline">REST</Link>
            {' · '}
            <Link href="/mcp#tools" className="text-primary hover:underline">MCP tools</Link>
          </p>
        </header>

        <section className="bg-card border border-border rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold mb-3">Description</h2>
          <p className="text-muted-foreground whitespace-pre-wrap">{parsedDescription.body}</p>
        </section>

        {bounty.skills_required?.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold mb-3">Skills</h2>
            <div className="flex flex-wrap gap-2">
              {bounty.skills_required.map((skill) => (
                <span
                  key={skill}
                  className="px-2.5 py-0.5 bg-primary/10 text-primary rounded-full text-sm"
                >
                  {skill}
                </span>
              ))}
            </div>
          </section>
        )}

        <section className="bg-card border border-border rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold mb-3">Execution parameters</h2>
          <dl className="space-y-2 text-sm">
            <div className="grid gap-1 rounded-md border border-border/70 bg-muted/25 px-3 py-2 md:grid-cols-[220px_1fr]">
              <dt className="font-semibold uppercase tracking-[0.08em] text-[11px] text-muted-foreground">location</dt>
              <dd className="font-medium text-foreground">{parsedDescription.location ?? 'Not provided'}</dd>
            </div>
            <div className="grid gap-1 rounded-md border border-border/70 bg-muted/25 px-3 py-2 md:grid-cols-[220px_1fr]">
              <dt className="font-semibold uppercase tracking-[0.08em] text-[11px] text-muted-foreground">context</dt>
              <dd className="text-muted-foreground">{parsedDescription.context ?? 'Not provided'}</dd>
            </div>
            <div className="grid gap-1 rounded-md border border-border/70 bg-muted/25 px-3 py-2 md:grid-cols-[220px_1fr]">
              <dt className="font-semibold uppercase tracking-[0.08em] text-[11px] text-muted-foreground">payment_rail</dt>
              <dd className="font-medium text-foreground">{formatPaymentRailLabel(bounty.preferred_payment_method)}</dd>
            </div>
            <div className="grid gap-1 rounded-md border border-border/70 bg-muted/25 px-3 py-2 md:grid-cols-[220px_1fr]">
              <dt className="font-semibold uppercase tracking-[0.08em] text-[11px] text-muted-foreground">pricing_mode</dt>
              <dd className="font-medium text-foreground">{bounty.pricing_mode === 'fixed_per_spot' ? 'fixed_per_spot' : 'bid'}</dd>
            </div>
            {bounty.pricing_mode === 'fixed_per_spot' && bounty.fixed_spot_amount !== null && (
              <div className="grid gap-1 rounded-md border border-border/70 bg-muted/25 px-3 py-2 md:grid-cols-[220px_1fr]">
                <dt className="font-semibold uppercase tracking-[0.08em] text-[11px] text-muted-foreground">fixed_spot_amount</dt>
                <dd className="font-medium text-foreground">{bounty.currency} {(bounty.fixed_spot_amount / 100).toFixed(0)}</dd>
              </div>
            )}
            <div className="grid gap-1 rounded-md border border-border/70 bg-muted/25 px-3 py-2 md:grid-cols-[220px_1fr]">
              <dt className="font-semibold uppercase tracking-[0.08em] text-[11px] text-muted-foreground">proof_review_mode</dt>
              <dd className="font-medium text-foreground">{bounty.proof_review_mode === 'llm_assisted' ? 'llm_assisted (LLM-as-judge)' : 'manual'}</dd>
            </div>
            {bounty.proof_review_mode === 'llm_assisted' && bounty.proof_review_prompt && (
              <div className="grid gap-1 rounded-md border border-border/70 bg-muted/25 px-3 py-2 md:grid-cols-[220px_1fr]">
                <dt className="font-semibold uppercase tracking-[0.08em] text-[11px] text-muted-foreground">proof_review_prompt</dt>
                <dd className="text-muted-foreground whitespace-pre-wrap">{bounty.proof_review_prompt}</dd>
              </div>
            )}
            <div className="grid gap-1 rounded-md border border-border/70 bg-muted/25 px-3 py-2 md:grid-cols-[220px_1fr]">
              <dt className="font-semibold uppercase tracking-[0.08em] text-[11px] text-muted-foreground">escrow_funding_model</dt>
              <dd className="font-medium text-foreground">deferred_per_booking</dd>
            </div>
          </dl>
        </section>

        <section className="bg-primary/5 border border-primary/20 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="font-semibold">Launch prep mode</h2>
            <p className="text-sm text-muted-foreground">
              Public browsing is active while transaction accounts and onboarding are finalized.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-muted-foreground hover:text-foreground transition-colors text-sm">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium hover:bg-primary/90 transition-colors"
            >
              Early access
            </Link>
          </div>
        </section>
      </main>
      </PublicResearchShell>
    </div>
  )
}
