'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { DataTable, Pagination, type Column } from '@/components/admin/DataTable'
import { StatusBadge, mapModerationDecision } from '@/components/admin/StatusBadge'
import { Filter } from 'lucide-react'

interface ModerationEvent {
  id: string
  surface: string
  content_type: string
  content_id: string | null
  actor_type: 'human' | 'agent'
  actor_id: string
  decision: 'allow' | 'warn' | 'fail' | 'unscanned'
  reason_codes: string[]
  risk_score: number
  confidence: number
  spam_action: string
  policy_version: string
  provider: string | null
  model: string | null
  evidence: Record<string, unknown>
  created_at: string
}

interface ModerationEventsResponse {
  success: boolean
  data: ModerationEvent[]
  pagination: {
    limit: number
    offset: number
    total: number
  }
  error?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export default function AdminModerationEventsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [events, setEvents] = useState<ModerationEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [decisionFilter, setDecisionFilter] = useState(searchParams.get('decision') || '')
  const [surfaceFilter, setSurfaceFilter] = useState(searchParams.get('surface') || '')

  const limit = 50
  const offset = parseInt(searchParams.get('offset') || '0', 10)
  const currentPage = Math.floor(offset / limit) + 1
  const totalPages = Math.ceil(total / limit)

  const fetchEvents = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const params = new URLSearchParams()
    params.set('limit', limit.toString())
    params.set('offset', offset.toString())
    if (decisionFilter) params.set('decision', decisionFilter)
    if (surfaceFilter) params.set('surface', surfaceFilter)

    try {
      const res = await fetch(`/api/v1/admin/moderation/events?${params}`)
      const data: ModerationEventsResponse = await res.json()

      if (!data.success) {
        setError(data.error || 'Failed to fetch events')
        return
      }

      setEvents(data.data)
      setTotal(data.pagination.total)
    } catch {
      setError('Failed to fetch events')
    } finally {
      setIsLoading(false)
    }
  }, [offset, decisionFilter, surfaceFilter])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  const handlePageChange = (page: number) => {
    const newOffset = (page - 1) * limit
    const params = new URLSearchParams(searchParams.toString())
    params.set('offset', newOffset.toString())
    router.push(`/admin/moderation?${params}`)
  }

  const updateFilters = (decision: string, surface: string) => {
    const params = new URLSearchParams()
    if (decision) params.set('decision', decision)
    if (surface) params.set('surface', surface)
    router.push(`/admin/moderation?${params}`)
  }

  const columns: Column<ModerationEvent>[] = [
    {
      key: 'created_at',
      header: 'Time',
      render: (event) => (
        <span className="text-sm text-muted-foreground">
          {new Date(event.created_at).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </span>
      ),
    },
    {
      key: 'surface',
      header: 'Surface',
      render: (event) => (
        <span className="capitalize">{event.surface.replace('_', ' ')}</span>
      ),
    },
    {
      key: 'content_type',
      header: 'Content Type',
      render: (event) => (
        <span className="text-sm">{event.content_type}</span>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (event) => (
        <span className="capitalize text-sm">{event.actor_type}</span>
      ),
    },
    {
      key: 'decision',
      header: 'Decision',
      render: (event) => (
        <StatusBadge
          status={mapModerationDecision(event.decision)}
          label={event.decision}
          size="sm"
        />
      ),
    },
    {
      key: 'reason_codes',
      header: 'Reasons',
      render: (event) => (
        <div className="flex flex-wrap gap-1 max-w-[200px]">
          {event.reason_codes.slice(0, 2).map((code) => (
            <span
              key={code}
              className="px-2 py-0.5 text-xs bg-muted rounded"
            >
              {code}
            </span>
          ))}
          {event.reason_codes.length > 2 && (
            <span className="px-2 py-0.5 text-xs text-muted-foreground">
              +{event.reason_codes.length - 2}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'risk_score',
      header: 'Risk',
      render: (event) => (
        <span className={`text-sm ${
          event.risk_score >= 0.7 ? 'text-red-600' :
          event.risk_score >= 0.4 ? 'text-amber-600' :
          'text-green-600'
        }`}>
          {(event.risk_score * 100).toFixed(0)}%
        </span>
      ),
    },
    {
      key: 'provider',
      header: 'Provider',
      render: (event) => (
        <span className="text-sm text-muted-foreground">
          {event.provider || 'N/A'}
        </span>
      ),
    },
  ]

  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Moderation Events</h1>
        <p className="text-muted-foreground">View content moderation decisions</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select
            value={decisionFilter}
            onChange={(e) => {
              setDecisionFilter(e.target.value)
              updateFilters(e.target.value, surfaceFilter)
            }}
            className="px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
          >
            <option value="">All Decisions</option>
            <option value="allow">Allow</option>
            <option value="warn">Warn</option>
            <option value="fail">Fail</option>
            <option value="unscanned">Unscanned</option>
          </select>
        </div>

        <select
          value={surfaceFilter}
          onChange={(e) => {
            setSurfaceFilter(e.target.value)
            updateFilters(decisionFilter, e.target.value)
          }}
          className="px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
        >
          <option value="">All Surfaces</option>
          <option value="bounty">Bounty</option>
          <option value="application">Application</option>
          <option value="message">Message</option>
          <option value="conversation_initial">Conversation Initial</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <DataTable
          columns={columns}
          data={events}
          keyExtractor={(event) => event.id}
          isLoading={isLoading}
          emptyMessage="No moderation events found"
          onRowClick={(event) =>
            setExpandedId(expandedId === event.id ? null : event.id)
          }
        />

        {/* Expanded row details */}
        {expandedId && (
          <div className="p-4 border-t border-border bg-muted/30">
            {events
              .filter((e) => e.id === expandedId)
              .map((event) => (
                <div key={event.id} className="space-y-4">
                  {isRecord(event.evidence?.trace) && (
                    <div className="bg-background border border-border rounded-lg p-3">
                      <div className="text-sm font-medium mb-2">Trace</div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <span className="text-muted-foreground">Run ID:</span>
                          <p className="font-mono text-xs">{String(event.evidence.trace.run_id || 'N/A')}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Total:</span>
                          <p>{String((event.evidence.trace as any)?.timings_ms?.total_ms ?? 'N/A')} ms</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Model Status:</span>
                          <p className="capitalize">{String((event.evidence.trace as any)?.model?.status ?? 'n/a')}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Attempts:</span>
                          <p>{String(((event.evidence.trace as any)?.model?.attempts as unknown[] | undefined)?.length ?? 0)}</p>
                        </div>
                      </div>
                      {Array.isArray((event.evidence.trace as any)?.model?.attempts) && (
                        <div className="mt-3">
                          <div className="text-xs text-muted-foreground mb-1">Model attempts</div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-border">
                                  <th className="text-left py-2 pr-2 text-muted-foreground font-medium">Model</th>
                                  <th className="text-left py-2 pr-2 text-muted-foreground font-medium">Strict</th>
                                  <th className="text-left py-2 pr-2 text-muted-foreground font-medium">Status</th>
                                  <th className="text-left py-2 pr-2 text-muted-foreground font-medium">Time</th>
                                  <th className="text-left py-2 pr-2 text-muted-foreground font-medium">Tokens</th>
                                  <th className="text-left py-2 pr-2 text-muted-foreground font-medium">Request</th>
                                </tr>
                              </thead>
                              <tbody>
                                {((event.evidence.trace as any).model.attempts as any[]).slice(0, 6).map((attempt, idx) => (
                                  <tr key={idx} className="border-b border-border last:border-b-0">
                                    <td className="py-2 pr-2 font-mono">{String(attempt?.model || 'n/a')}</td>
                                    <td className="py-2 pr-2">{attempt?.strict ? 'yes' : 'no'}</td>
                                    <td className="py-2 pr-2 capitalize">{String(attempt?.status || 'n/a')}</td>
                                    <td className="py-2 pr-2">{String(attempt?.meta?.duration_ms ?? 'n/a')} ms</td>
                                    <td className="py-2 pr-2">{String(attempt?.meta?.usage?.total_tokens ?? 'n/a')}</td>
                                    <td className="py-2 pr-2 font-mono">{String(attempt?.meta?.request_id || 'n/a')}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Content ID:</span>
                      <p className="font-mono">{event.content_id || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Actor ID:</span>
                      <p className="font-mono">{event.actor_id}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Policy Version:</span>
                      <p>{event.policy_version}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Model:</span>
                      <p>{event.model || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Spam Action:</span>
                      <p>{event.spam_action}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Confidence:</span>
                      <p>{(event.confidence * 100).toFixed(0)}%</p>
                    </div>
                  </div>
                  {Object.keys(event.evidence).length > 0 && (
                    <div>
                      <span className="text-sm text-muted-foreground">Evidence:</span>
                      <pre className="mt-1 text-xs bg-background p-2 rounded overflow-x-auto">
                        {JSON.stringify(event.evidence, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
          </div>
        )}

        {total > limit && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={total}
            itemsPerPage={limit}
            onPageChange={handlePageChange}
          />
        )}
      </div>
    </div>
  )
}
