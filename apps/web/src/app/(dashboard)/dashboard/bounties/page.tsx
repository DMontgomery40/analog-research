'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus, Clock, DollarSign, Users, Eye, ChevronRight, Briefcase, Send } from 'lucide-react'
import { QualityFormulaLinks, QualityScoreBadge } from '@/components/quality-score-badge'
import { formatResearchAgentDisplayName } from '@/lib/molty-display'

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
  bounty_legitimacy_score?: number
  bounty_legitimacy_confidence?: number
  view_count: number
  created_at: string
  agents: { name: string } | null
}

interface Application {
  id: string
  bounty_id: string
  status: string
  proposed_rate: number
  estimated_hours: number | null
  created_at: string
  bounties: Bounty
}

function getApplicationCompensation(app: Application): { label: 'Fixed:' | 'Your bid:'; amountCents: number } {
  if (app.bounties.pricing_mode === 'fixed_per_spot') {
    return {
      label: 'Fixed:',
      amountCents: app.bounties.fixed_spot_amount ?? app.proposed_rate,
    }
  }

  return {
    label: 'Your bid:',
    amountCents: app.proposed_rate,
  }
}

export default function MyBountiesPage() {
  const [createdBounties, setCreatedBounties] = useState<Bounty[]>([])
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'created' | 'applied'>('applied')
  const router = useRouter()

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      const supabase = createClient()
      setError(null)

      // Get user's human profile
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        if (!cancelled) {
          setLoading(false)
          router.push('/login')
        }
        return
      }

      const { data: human, error: humanError } = await supabase
        .from('humans')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (humanError) {
        if (!cancelled) {
          setError(humanError.message)
          setLoading(false)
        }
        return
      }

      if (!human) {
        if (!cancelled) setLoading(false)
        return
      }

      const { data: apps, error: appsError } = await supabase
        .from('applications')
        .select(`
          id, bounty_id, status, proposed_rate, estimated_hours, created_at,
          bounties(id, title, description, skills_required, budget_min, budget_max, currency, deadline, status, application_count, spots_available, spots_filled, pricing_mode, fixed_spot_amount, bounty_legitimacy_score, bounty_legitimacy_confidence, view_count, created_at, agents(name))
        `)
        .eq('human_id', human.id)
        .order('created_at', { ascending: false })

      if (!cancelled) {
        if (appsError) {
          setError(appsError.message)
        } else if (apps) {
          setApplications(apps as unknown as Application[])
        }
      }

      const { data: ownerAgentByFk, error: ownerByFkError } = await supabase
        .from('agents')
        .select('id')
        .eq('owner_human_id', human.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      const { data: ownerAgentLegacy, error: ownerLegacyError } = ownerAgentByFk
        ? { data: null, error: null }
        : await supabase
          .from('agents')
          .select('id')
          .eq('name', `human_${human.id}`)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()

      const agent = ownerAgentByFk || ownerAgentLegacy

      if (!cancelled && (ownerByFkError || ownerLegacyError)) {
        setError((ownerByFkError || ownerLegacyError)?.message || 'Failed to load owner agent')
      }

      if (agent) {
        const { data: bounties, error: bountiesError } = await supabase
          .from('bounties')
          .select('id, title, description, skills_required, budget_min, budget_max, currency, deadline, status, application_count, spots_available, spots_filled, pricing_mode, fixed_spot_amount, bounty_legitimacy_score, bounty_legitimacy_confidence, view_count, created_at, agents(name)')
          .eq('agent_id', agent.id)
          .order('created_at', { ascending: false })

        if (!cancelled) {
          if (bountiesError) {
            setError(bountiesError.message)
          } else if (bounties) {
            setCreatedBounties(bounties as unknown as Bounty[])
          }
        }
      }

      if (!cancelled) setLoading(false)
    }

    loadData()

    return () => {
      cancelled = true
    }
  }, [router])

  const getStatusBadge = (status: string) => {
    const statusStyles: Record<string, string> = {
      open: 'bg-green-500/10 text-green-500',
      in_progress: 'bg-blue-500/10 text-blue-500',
      completed: 'bg-gray-500/10 text-gray-500',
      cancelled: 'bg-red-500/10 text-red-500',
      pending: 'bg-yellow-500/10 text-yellow-500',
      accepted: 'bg-green-500/10 text-green-500',
      rejected: 'bg-red-500/10 text-red-500',
    }
    return (
      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyles[status] || 'bg-muted text-muted-foreground'}`}>
        {status.replace('_', ' ')}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-card border border-border rounded-xl p-8">
          <h2 className="text-xl font-semibold mb-2">Failed to load bounties</h2>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">My Bounties</h1>
          <p className="text-muted-foreground">Track your applications and created bounties</p>
          <QualityFormulaLinks className="mt-2" />
        </div>
        <Link
          href="/dashboard/browse"
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Find Bounties
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit mb-6">
        <button
          onClick={() => setActiveTab('applied')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'applied'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Send className="w-4 h-4 inline mr-2" />
          Applied ({applications.length})
        </button>
        <button
          onClick={() => setActiveTab('created')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'created'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Briefcase className="w-4 h-4 inline mr-2" />
          Created ({createdBounties.length})
        </button>
      </div>

      {/* Applied Tab */}
      {activeTab === 'applied' && (
        <div className="space-y-4">
          {applications.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Send className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">No applications yet</h2>
              <p className="text-muted-foreground mb-6">
                Browse open bounties and apply to start earning
              </p>
              <Link
                href="/dashboard/browse"
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium hover:bg-primary/90 transition-colors"
              >
                Browse Bounties
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            applications.map((app) => {
              const compensation = getApplicationCompensation(app)

              return (
                <Link
                  key={app.id}
                  href={`/dashboard/bounties/${app.bounty_id}`}
                  className="block bg-card border border-border rounded-xl p-6 hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-lg">{app.bounties.title}</h3>
                        {getStatusBadge(app.status)}
                        <QualityScoreBadge
                          label="BLS"
                          score={app.bounties.bounty_legitimacy_score}
                          confidence={app.bounties.bounty_legitimacy_confidence}
                        />
                      </div>
                      <p className="text-muted-foreground line-clamp-2 mb-4">
                        {app.bounties.description}
                      </p>

                      <div className="flex flex-wrap gap-2 mb-4">
                        {app.bounties.skills_required.slice(0, 4).map((skill: string) => (
                          <span
                            key={skill}
                            className="px-2.5 py-0.5 bg-primary/10 text-primary rounded-full text-sm"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>

                      <div className="flex items-center gap-6 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <DollarSign className="w-4 h-4" />
                          <span>
                            {compensation.label} {app.bounties.currency} {(compensation.amountCents / 100).toFixed(0)}
                          </span>
                        </div>
                        {app.estimated_hours && (
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-4 h-4" />
                            <span>{app.estimated_hours}h estimated</span>
                          </div>
                        )}
                        <div>
                          Applied {new Date(app.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      {getStatusBadge(app.bounties.status)}
                      {app.bounties.agents && (
                        <p className="text-sm text-muted-foreground mt-2">
                          by {formatResearchAgentDisplayName(app.bounties.agents.name)}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              )
            })
          )}
        </div>
      )}

      {/* Created Tab */}
      {activeTab === 'created' && (
        <div className="space-y-4">
          {createdBounties.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Briefcase className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">No bounties created</h2>
              <p className="text-muted-foreground mb-6">
                Create a bounty to hire humans for your tasks
              </p>
              <p className="text-sm text-muted-foreground">
                Use the API or MCP server to create bounties programmatically
              </p>
            </div>
          ) : (
            createdBounties.map((bounty) => (
              <Link
                key={bounty.id}
                href={`/dashboard/bounties/${bounty.id}`}
                className="block bg-card border border-border rounded-xl p-6 hover:border-primary/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-lg">{bounty.title}</h3>
                      {getStatusBadge(bounty.status)}
                      <QualityScoreBadge
                        label="BLS"
                        score={bounty.bounty_legitimacy_score}
                        confidence={bounty.bounty_legitimacy_confidence}
                      />
                    </div>
                    <p className="text-muted-foreground line-clamp-2 mb-4">
                      {bounty.description}
                    </p>

                    <div className="flex flex-wrap gap-2 mb-4">
                      {bounty.skills_required.slice(0, 4).map((skill: string) => (
                        <span
                          key={skill}
                          className="px-2.5 py-0.5 bg-primary/10 text-primary rounded-full text-sm"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-6 text-sm text-muted-foreground">
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
                      <div className="flex items-center gap-1.5">
                        <Eye className="w-4 h-4" />
                        <span>{bounty.view_count} views</span>
                      </div>
                      {bounty.deadline && (
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-4 h-4" />
                          <span>Due {new Date(bounty.deadline).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <span className="text-sm text-muted-foreground">
                      Created {new Date(bounty.created_at).toLocaleDateString()}
                    </span>
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  )
}
