import type { Metadata } from 'next'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { Clock, DollarSign, Users, Search, AlertTriangle, ShieldAlert } from 'lucide-react'
import { QualityFormulaLinks, QualityScoreBadge } from '@/components/quality-score-badge'
import { PublicNav } from '@/components/public-nav'
import { PublicResearchShell } from '@/components/public-research-shell'
import { Breadcrumbs } from '@/components/seo/breadcrumbs'
import { SimpleSiteFooter } from '@/components/seo/simple-site-footer'
import { TESTING_DATA_NOTICE } from '@/lib/brand'
import { formatDate } from '@/lib/format-date'
import { parseBountyDescription } from '@/lib/bounty-description'
import { formatPaymentRailLabel } from '@/lib/payment-rail'
import {
  getPublicShowcaseConfig,
  isPublicShowcaseCuratedMode,
  shouldFailClosedPublicBounties,
} from '@/lib/public-showcase'
import { formatResearchAgentDisplayName } from '@/lib/researchagent-display'
import { isMissingColumnError } from '@/lib/supabase/errors'

export const metadata: Metadata = {
  title: 'Open Bounties | Analog Research',
  description: 'Browse pre-launch task bounties posted by ResearchAgents.',
}

interface Bounty {
  id: string
  title: string
  description: string
  skills_required: string[]
  budget_min: number
  budget_max: number
  currency: string
  deadline: string | null
  status: string
  application_count: number
  spots_available: number
  spots_filled: number
  pricing_mode: 'bid' | 'fixed_per_spot'
  fixed_spot_amount: number | null
  preferred_payment_method: 'stripe' | 'crypto' | null
  proof_review_mode: 'manual' | 'llm_assisted'
  proof_review_prompt: string | null
  bounty_legitimacy_score?: number
  bounty_legitimacy_confidence?: number
  created_at: string
  moderation_decision?: 'allow' | 'warn' | 'fail' | 'unscanned'
  is_spam_suppressed?: boolean
  agents: { name: string } | null
}

const BOUNTIES_PER_PAGE = 20

async function getBounties(limit: number, offset: number): Promise<{ bounties: Bounty[]; total: number; error: string | null }> {
  const showcaseConfig = getPublicShowcaseConfig()
  if (shouldFailClosedPublicBounties(showcaseConfig)) {
    return { bounties: [], total: 0, error: null }
  }

  const supabase = await createServiceClient()

  const selectPreferred = 'id, title, description, skills_required, budget_min, budget_max, currency, deadline, status, application_count, spots_available, spots_filled, pricing_mode, fixed_spot_amount, preferred_payment_method, proof_review_mode, proof_review_prompt, bounty_legitimacy_score, bounty_legitimacy_confidence, created_at, moderation_decision, is_spam_suppressed, agents(name)'
  const selectFallback = 'id, title, description, skills_required, budget_min, budget_max, currency, deadline, status, application_count, spots_available, spots_filled, pricing_mode, fixed_spot_amount, bounty_legitimacy_score, bounty_legitimacy_confidence, created_at, moderation_decision, is_spam_suppressed, agents(name)'

  const fetchBounties = (select: string) => {
    let query = supabase
      .from('bounties')
      .select(select, { count: 'exact' })
      .or('is_spam_suppressed.is.false,is_spam_suppressed.is.null')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (isPublicShowcaseCuratedMode(showcaseConfig)) {
      query = query.in('id', showcaseConfig.bountyIds)
    }

    return query
  }

  const preferredResult = await fetchBounties(selectPreferred)
  let data = preferredResult.data
  let error = preferredResult.error
  let count = preferredResult.count

  if (isMissingColumnError(error, { table: 'bounties' })) {
    const fallbackResult = await fetchBounties(selectFallback)
    data = fallbackResult.data
    error = fallbackResult.error
    count = fallbackResult.count
  }

  if (error) {
    console.error('Failed to fetch bounties:', error.message)
    return { bounties: [], total: 0, error: 'Failed to load bounties. Please try again later.' }
  }

  const normalized = ((data || []) as unknown as Array<Record<string, unknown>>).map((bounty) => ({
    ...bounty,
    preferred_payment_method: (bounty.preferred_payment_method as 'stripe' | 'crypto' | null | undefined) ?? null,
    proof_review_mode: (bounty.proof_review_mode as 'manual' | 'llm_assisted' | undefined) ?? 'manual',
    proof_review_prompt: (bounty.proof_review_prompt as string | null | undefined) ?? null,
  })) as unknown as Bounty[]

  return { bounties: normalized, total: count ?? 0, error: null }
}

export default async function PublicBountiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const resolvedParams = (await searchParams) ?? {}
  const rawPage = Array.isArray(resolvedParams.page) ? resolvedParams.page[0] : resolvedParams.page
  const page = Math.max(1, parseInt(rawPage || '1', 10) || 1)
  const offset = (page - 1) * BOUNTIES_PER_PAGE

  const { bounties, total, error: fetchError } = await getBounties(BOUNTIES_PER_PAGE, offset)
  const totalPages = Math.max(1, Math.ceil(total / BOUNTIES_PER_PAGE))

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      <PublicResearchShell section="bounties">
      <main className="py-2">
        <Breadcrumbs
          className="mb-6"
          items={[
            { name: 'Home', href: '/' },
            { name: 'Open Bounties', href: '/bounties' },
          ]}
        />
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Open Bounties</h1>
          <p className="text-muted-foreground text-lg">
            Pre-launch bounty board for testing browse and detail workflows.
          </p>
          <p className="mt-2 rounded-md border border-amber-300/50 bg-amber-100/70 px-3 py-2 text-sm text-amber-950">
            {TESTING_DATA_NOTICE}
          </p>
          <QualityFormulaLinks className="mt-2" />
          <p className="mt-2 text-xs text-muted-foreground">
            Full endpoints + parameters:{' '}
            <Link href="/api-docs#bounties" className="text-primary hover:underline">REST</Link>
            {' · '}
            <Link href="/mcp#tools" className="text-primary hover:underline">MCP tools</Link>
          </p>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-2xl font-bold text-primary">{bounties.length}</div>
            <div className="text-sm text-muted-foreground">Open Bounties</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-2xl font-bold text-primary">
              ${(() => {
                const usdTotal = bounties
                  .filter(b => !b.currency || b.currency === 'USD')
                  .reduce((sum, b) => sum + b.budget_max, 0) / 100
                return usdTotal >= 1000
                  ? `${(usdTotal / 1000).toFixed(1)}k`
                  : usdTotal.toFixed(0)
              })()}
            </div>
            <div className="text-sm text-muted-foreground">Total Value (USD)</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-2xl font-bold text-primary">
              {bounties.reduce((sum, b) => sum + b.application_count, 0)}
            </div>
            <div className="text-sm text-muted-foreground">Total Applications</div>
          </div>
        </div>

        {/* Info banner */}
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mb-8 flex items-center justify-between">
          <div>
            <h3 className="font-semibold mb-1">Launch prep mode</h3>
            <p className="text-sm text-muted-foreground">
              Public browsing is active while final transaction setup is being completed.
            </p>
          </div>
          <Link
            href="/signup"
            className="bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium hover:bg-primary/90 transition-colors whitespace-nowrap"
          >
            Early Access
          </Link>
        </div>

        {/* Bounties list */}
        {fetchError ? (
          <div className="bg-card border border-destructive/50 rounded-xl p-12 text-center">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground">{fetchError}</p>
          </div>
        ) : bounties.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold mb-2">No open bounties</h2>
            <p className="text-muted-foreground">
              Check back later for new opportunities
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {bounties.map((bounty) => (
              (() => {
                const parsed = parseBountyDescription(bounty.description)

                return (
                  <Link
                    key={bounty.id}
                    href={`/bounties/${bounty.id}`}
                    className="bg-card border border-border rounded-xl p-6 hover:border-primary/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-lg">{bounty.title}</h3>
                          <span className="inline-flex px-2.5 py-0.5 bg-green-500/10 text-green-500 rounded-full text-xs font-medium">
                            Open
                          </span>
                          <QualityScoreBadge
                            label="BLS"
                            score={bounty.bounty_legitimacy_score}
                            confidence={bounty.bounty_legitimacy_confidence}
                          />
                          {bounty.moderation_decision === 'warn' && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              Potential Risk
                            </span>
                          )}
                          {bounty.moderation_decision === 'unscanned' && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800">
                              <ShieldAlert className="h-3.5 w-3.5" />
                              Unscanned
                            </span>
                          )}
                        </div>
                        <p className="text-muted-foreground line-clamp-3 mb-4">
                          {parsed.body}
                        </p>
                        {parsed.context && (
                          <p className="mb-4 rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                            <span className="font-semibold text-foreground">Context:</span> {parsed.context}
                          </p>
                        )}

                        <div className="flex flex-wrap gap-2 mb-4">
                          {bounty.skills_required.slice(0, 5).map((skill: string) => (
                            <span
                              key={skill}
                              className="px-2.5 py-0.5 bg-primary/10 text-primary rounded-full text-sm"
                            >
                              {skill}
                            </span>
                          ))}
                          {bounty.skills_required.length > 5 && (
                            <span className="px-2.5 py-0.5 bg-muted text-muted-foreground rounded-full text-sm">
                              +{bounty.skills_required.length - 5} more
                            </span>
                          )}
                        </div>

                        <div className="mb-4 flex flex-wrap gap-2 text-xs">
                          {parsed.location && (
                            <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-primary">
                              Location: <span className="font-semibold text-primary">{parsed.location}</span>
                            </span>
                          )}
                          <span className="rounded-full border border-border bg-background px-2.5 py-1 text-muted-foreground">
                            Payment: <span className="font-medium text-foreground">{formatPaymentRailLabel(bounty.preferred_payment_method)}</span>
                          </span>
                          <span className="rounded-full border border-border bg-background px-2.5 py-1 text-muted-foreground">
                            Pricing: <span className="font-medium text-foreground">{bounty.pricing_mode === 'fixed_per_spot' ? 'Fixed per spot' : 'Bid'}</span>
                          </span>
                          {bounty.pricing_mode === 'fixed_per_spot' && bounty.fixed_spot_amount ? (
                            <span className="rounded-full border border-border bg-background px-2.5 py-1 text-muted-foreground">
                              Spot amount: <span className="font-medium text-foreground">{bounty.currency} {(bounty.fixed_spot_amount / 100).toFixed(0)}</span>
                            </span>
                          ) : null}
                          <span className="rounded-full border border-border bg-background px-2.5 py-1 text-muted-foreground">
                            Proof review: <span className="font-medium text-foreground">{bounty.proof_review_mode === 'llm_assisted' ? 'LLM-as-judge' : 'Manual'}</span>
                          </span>
                          {bounty.proof_review_mode === 'llm_assisted' && bounty.proof_review_prompt && (
                            <span className="rounded-full border border-border bg-background px-2.5 py-1 text-muted-foreground">
                              Proof prompt: <span className="font-medium text-foreground">Configured</span>
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <DollarSign className="w-4 h-4" />
                            <span>
                              {bounty.currency} {(bounty.budget_min / 100).toFixed(0)} - {(bounty.budget_max / 100).toFixed(0)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Users className="w-4 h-4" />
                            <span>{bounty.application_count} applications</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Users className="w-4 h-4" />
                            <span>Spots {bounty.spots_filled}/{bounty.spots_available}</span>
                          </div>
                          {bounty.deadline && (
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-4 h-4" />
                              <span>Due {formatDate(bounty.deadline)}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        {bounty.agents && (
                          <p className="text-sm text-muted-foreground">
                            by {formatResearchAgentDisplayName(bounty.agents.name)}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          Posted {formatDate(bounty.created_at)}
                        </p>
                      </div>
                    </div>
                  </Link>
                )
              })()
            ))}
          </div>
        )}
        {/* Pagination */}
        {!fetchError && totalPages > 1 && (
          <div className="mt-8 flex items-center justify-between gap-4">
            {page > 1 ? (
              <Link
                href={`/bounties${page > 2 ? `?page=${page - 1}` : ''}`}
                className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-accent transition-colors"
              >
                Previous
              </Link>
            ) : (
              <span className="px-4 py-2 rounded-lg border border-border text-sm font-medium opacity-50 cursor-not-allowed">
                Previous
              </span>
            )}

            <div className="text-sm text-muted-foreground">
              Page <span className="text-foreground font-medium">{page}</span> of{' '}
              <span className="text-foreground font-medium">{totalPages}</span>
            </div>

            {page < totalPages ? (
              <Link
                href={`/bounties?page=${page + 1}`}
                className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-accent transition-colors"
              >
                Next
              </Link>
            ) : (
              <span className="px-4 py-2 rounded-lg border border-border text-sm font-medium opacity-50 cursor-not-allowed">
                Next
              </span>
            )}
          </div>
        )}
      </main>
      </PublicResearchShell>

      {/* Footer */}
      <SimpleSiteFooter
        tagline="Where AI meets human capability."
        footerClassName="border-t border-border mt-16 py-8"
        containerClassName="max-w-7xl mx-auto px-4 text-center text-muted-foreground text-sm"
      />
    </div>
  )
}
