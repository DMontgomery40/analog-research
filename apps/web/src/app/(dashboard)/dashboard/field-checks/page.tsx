'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Camera, Loader2, RefreshCw } from 'lucide-react'

import { FieldCheckOrderForm } from '@/components/field-checks/FieldCheckOrderForm'
import { formatSchemaParityError } from '@/lib/schema-parity-client'

interface ExternalJobRow {
  id: string
  kind: string
  provider: string
  provider_env: string
  status: string
  title: string | null
  address: string
  provider_job_id: string | null
  result_payload: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export default function FieldChecksPage() {
  const [jobs, setJobs] = useState<ExternalJobRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const loadJobs = useCallback(async () => {
    setRefreshing(true)
    setError(null)

    try {
      const response = await fetch('/api/v1/external-jobs?kind=field_check&limit=50&offset=0')
      const result = await response.json()
      if (!result.success) {
        setError(formatSchemaParityError(result, 'Failed to load field checks'))
        return
      }
      setJobs(result.data || [])
    } catch {
      setError('Failed to load field checks')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadJobs()
  }, [loadJobs])

  const statusStyles = useMemo(() => ({
    open: 'bg-green-500/10 text-green-600',
    in_progress: 'bg-blue-500/10 text-blue-600',
    action_required: 'bg-amber-500/10 text-amber-600',
    completed: 'bg-gray-500/10 text-gray-600',
    cancelled: 'bg-red-500/10 text-red-500',
    expired: 'bg-muted text-muted-foreground',
    failed: 'bg-destructive/10 text-destructive',
  }) as Record<string, string>, [])

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold">Field Checks</h1>
          <p className="text-muted-foreground">
            Order drive-by checks and attach them directly to live marketplace work.
          </p>
        </div>
        <button
          onClick={loadJobs}
          disabled={refreshing}
          className="inline-flex items-center gap-2 border border-border px-3 py-2 rounded-md font-medium hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive">
          {error}
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Camera className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold">New Field Check</h2>
            <p className="text-sm text-muted-foreground">
              Use configured providers from Settings and keep evidence linked to your workflow.
            </p>
          </div>
        </div>

        <FieldCheckOrderForm
          helperText="Choose environment and provider, then place the check. Use the bounty and booking pages for linked requests."
          onCreated={async () => {
            await loadJobs()
          }}
        />
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Recent Field Checks</h2>
          <div className="text-sm text-muted-foreground">
            {jobs.length} total
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Camera className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No field checks yet</p>
            <p className="text-sm">Order one above to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => {
              const badge = statusStyles[job.status] || 'bg-muted text-muted-foreground'
              return (
                <Link
                  key={job.id}
                  href={`/dashboard/field-checks/${job.id}`}
                  className="block border border-border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium truncate">{job.title || job.address}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge}`}>
                          {job.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground truncate">
                        {job.address}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {job.provider} ({job.provider_env}) {job.provider_job_id ? <>· Provider ID {job.provider_job_id}</> : null}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0">
                      {new Date(job.created_at).toLocaleString()}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
