'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, ExternalLink, Loader2, RefreshCw } from 'lucide-react'

interface ExternalJobEventRow {
  id: string
  source: string
  event_name: string
  payload: Record<string, unknown> | null
  created_at: string
}

interface ExternalJobRow {
  id: string
  provider: string
  provider_env: string
  status: string
  title: string | null
  instructions: string | null
  address: string
  provider_job_id: string | null
  result_payload: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

interface ApiResponse {
  success: boolean
  error?: string
  data?: {
    job: ExternalJobRow
    events: ExternalJobEventRow[]
  }
}

export default function FieldCheckDetailPage() {
  const params = useParams<{ id: string | string[] }>()
  const fieldCheckId = Array.isArray(params.id) ? params.id[0] : params.id
  const [job, setJob] = useState<ExternalJobRow | null>(null)
  const [events, setEvents] = useState<ExternalJobEventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const statusStyles = useMemo(() => ({
    open: 'bg-green-500/10 text-green-600',
    in_progress: 'bg-blue-500/10 text-blue-600',
    action_required: 'bg-amber-500/10 text-amber-600',
    completed: 'bg-gray-500/10 text-gray-600',
    cancelled: 'bg-red-500/10 text-red-500',
    expired: 'bg-muted text-muted-foreground',
    failed: 'bg-destructive/10 text-destructive',
  }) as Record<string, string>, [])

  const load = useCallback(async (opts?: { refresh?: boolean }) => {
    if (!fieldCheckId) {
      setError('Invalid field check id')
      setLoading(false)
      setRefreshing(false)
      return
    }

    setError(null)
    if (opts?.refresh) setRefreshing(true)

    try {
      const url = opts?.refresh
        ? `/api/v1/external-jobs/${fieldCheckId}/refresh`
        : `/api/v1/external-jobs/${fieldCheckId}`
      const response = await fetch(url, { method: opts?.refresh ? 'POST' : 'GET' })
      const result = await response.json() as ApiResponse

      if (!result.success || !result.data) {
        setError(result.error || 'Failed to load field check')
        return
      }

      setJob(result.data.job)
      setEvents(result.data.events || [])
    } catch {
      setError('Failed to load field check')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [fieldCheckId])

  useEffect(() => {
    load()
  }, [load])

  const downloadPhotosUrl = (job?.result_payload?.download_photos_url as string | null | undefined) ?? null
  const downloadReportUrl = (job?.result_payload?.download_report_url as string | null | undefined) ?? null
  const providerStatus = (job?.result_payload?.provider_status as string | null | undefined) ?? null

  return (
    <div className="p-6">
      <div className="mb-6">
        <Link
          href="/dashboard/field-checks"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Field Checks
        </Link>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : job ? (
        <>
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold truncate">{job.title || 'Field Check'}</h1>
              <p className="text-muted-foreground truncate">{job.address}</p>
              <div className="text-sm text-muted-foreground mt-1">
                {job.provider} ({job.provider_env}) {job.provider_job_id ? <>· Provider ID {job.provider_job_id}</> : null}
                {providerStatus ? <> · Provider status {providerStatus}</> : null}
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusStyles[job.status] || 'bg-muted text-muted-foreground'}`}>
                {job.status.replace(/_/g, ' ')}
              </span>
              <button
                onClick={() => load({ refresh: true })}
                disabled={refreshing}
                className="inline-flex items-center gap-2 border border-border px-3 py-2 rounded-md font-medium hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-card border border-border rounded-xl p-6">
                <h2 className="font-semibold mb-2">Instructions</h2>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {job.instructions || 'No instructions recorded.'}
                </p>
              </div>

              <div className="bg-card border border-border rounded-xl p-6">
                <h2 className="font-semibold mb-4">Timeline</h2>
                {events.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No events yet.</div>
                ) : (
                  <div className="space-y-3">
                    {events.slice().reverse().map((event) => (
                      <div key={event.id} className="border border-border rounded-lg p-4 bg-background">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">{event.event_name}</div>
                            <div className="text-xs text-muted-foreground">
                              {event.source} · {new Date(event.created_at).toLocaleString()}
                            </div>
                          </div>
                        </div>
                        {event.payload && Object.keys(event.payload).length > 0 && (
                          <pre className="mt-3 text-xs bg-muted/50 rounded-md p-3 overflow-x-auto">
{JSON.stringify(event.payload, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-card border border-border rounded-xl p-6">
                <h2 className="font-semibold mb-3">Deliverables</h2>
                <div className="space-y-2">
                  {downloadPhotosUrl ? (
                    <a
                      href={downloadPhotosUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      Photos ZIP <ExternalLink className="w-4 h-4" />
                    </a>
                  ) : (
                    <div className="text-sm text-muted-foreground">Photos ZIP not available yet.</div>
                  )}

                  {downloadReportUrl ? (
                    <a
                      href={downloadReportUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      PDF Report <ExternalLink className="w-4 h-4" />
                    </a>
                  ) : (
                    <div className="text-sm text-muted-foreground">PDF report not available yet.</div>
                  )}
                </div>
              </div>

              <div className="bg-card border border-border rounded-xl p-6">
                <h2 className="font-semibold mb-3">Metadata</h2>
                <div className="text-sm text-muted-foreground space-y-1">
                  <div>Created: {new Date(job.created_at).toLocaleString()}</div>
                  <div>Updated: {new Date(job.updated_at).toLocaleString()}</div>
                  <div>Job ID: <code className="bg-muted px-1 rounded">{job.id}</code></div>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
