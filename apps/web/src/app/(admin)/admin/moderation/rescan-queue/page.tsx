'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@analoglabor/ui'
import { DataTable, Pagination, type Column } from '@/components/admin/DataTable'
import { RefreshCw, Filter, Loader2 } from 'lucide-react'

interface RescanQueueItem {
  id: string
  surface: string
  content_type: string
  content_id: string | null
  actor_type: 'human' | 'agent'
  actor_id: string
  reason: string
  status: string
  attempt_count: number
  next_run_at: string
  last_error: string | null
  content_text: string
  created_at: string
  updated_at: string
}

interface RescanQueueResponse {
  success: boolean
  data: RescanQueueItem[]
  pagination: {
    limit: number
    offset: number
    total: number
  }
  error?: string
}

export default function AdminModerationRescanQueuePage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [items, setItems] = useState<RescanQueueItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)

  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '')
  const [surfaceFilter, setSurfaceFilter] = useState(searchParams.get('surface') || '')

  const limit = 50
  const offset = parseInt(searchParams.get('offset') || '0', 10)
  const currentPage = Math.floor(offset / limit) + 1
  const totalPages = Math.ceil(total / limit)

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set('limit', limit.toString())
    params.set('offset', offset.toString())
    if (statusFilter) params.set('status', statusFilter)
    if (surfaceFilter) params.set('surface', surfaceFilter)
    return params.toString()
  }, [offset, statusFilter, surfaceFilter])

  const fetchItems = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/v1/admin/moderation/rescan-queue?${queryString}`)
      const data: RescanQueueResponse = await res.json()

      if (!data.success) {
        setError(data.error || 'Failed to fetch rescan queue')
        return
      }

      setItems(data.data)
      setTotal(data.pagination.total)
    } catch {
      setError('Failed to fetch rescan queue')
    } finally {
      setIsLoading(false)
    }
  }, [queryString])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const handlePageChange = (page: number) => {
    const newOffset = (page - 1) * limit
    const params = new URLSearchParams(searchParams.toString())
    params.set('offset', newOffset.toString())
    router.push(`/admin/moderation/rescan-queue?${params}`)
  }

  const updateFilters = (status: string, surface: string) => {
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    if (surface) params.set('surface', surface)
    router.push(`/admin/moderation/rescan-queue?${params}`)
  }

  const columns: Column<RescanQueueItem>[] = [
    {
      key: 'created_at',
      header: 'Queued',
      render: (item) => (
        <span className="text-sm text-muted-foreground">
          {new Date(item.created_at).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item) => (
        <span className="text-sm capitalize">{item.status}</span>
      ),
    },
    {
      key: 'surface',
      header: 'Surface',
      render: (item) => (
        <span className="capitalize">{item.surface.replace('_', ' ')}</span>
      ),
    },
    {
      key: 'content_type',
      header: 'Content Type',
      render: (item) => (
        <span className="text-sm">{item.content_type}</span>
      ),
    },
    {
      key: 'attempt_count',
      header: 'Attempts',
      render: (item) => (
        <span className="text-sm">{item.attempt_count}</span>
      ),
    },
    {
      key: 'next_run_at',
      header: 'Next Run',
      render: (item) => (
        <span className="text-sm text-muted-foreground">
          {new Date(item.next_run_at).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (item) => (
        <span className="text-sm text-muted-foreground">{item.reason}</span>
      ),
    },
  ]

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isMutating, setIsMutating] = useState(false)
  const [resetAttempts, setResetAttempts] = useState(false)

  const mutateItem = async (id: string, action: 'retry_now' | 'mark_failed' | 'mark_completed') => {
    setIsMutating(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/admin/moderation/rescan-queue/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, resetAttempts }),
      })

      const payload = await res.json()
      if (!payload.success) {
        setError(payload.error || 'Failed to update queue item')
        return
      }

      await fetchItems()
    } catch {
      setError('Failed to update queue item')
    } finally {
      setIsMutating(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Moderation Rescan Queue</h1>
          <p className="text-muted-foreground">Items queued for moderation retry (timeouts/provider errors)</p>
        </div>
        <Button variant="outline" onClick={fetchItems} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              updateFilters(e.target.value, surfaceFilter)
            }}
            className="px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        <select
          value={surfaceFilter}
          onChange={(e) => {
            setSurfaceFilter(e.target.value)
            updateFilters(statusFilter, e.target.value)
          }}
          className="px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
        >
          <option value="">All Surfaces</option>
          <option value="bounty">Bounty</option>
          <option value="application">Application</option>
          <option value="message">Message</option>
          <option value="conversation_initial">Conversation Initial</option>
        </select>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={resetAttempts}
            onChange={(e) => setResetAttempts(e.target.checked)}
            className="h-4 w-4"
          />
          Reset attempts on retry
        </label>
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
          data={items}
          keyExtractor={(item) => item.id}
          isLoading={isLoading}
          emptyMessage="No rescan queue items found"
          onRowClick={(item) => setExpandedId(expandedId === item.id ? null : item.id)}
        />

        {expandedId && (
          <div className="p-4 border-t border-border bg-muted/30">
            {items
              .filter((item) => item.id === expandedId)
              .map((item) => (
                <div key={item.id} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Queue ID:</span>
                      <p className="font-mono">{item.id}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Content ID:</span>
                      <p className="font-mono">{item.content_id || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Actor ID:</span>
                      <p className="font-mono">{item.actor_id}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Last Error:</span>
                      <p className="font-mono text-xs">{item.last_error || 'N/A'}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      disabled={isMutating}
                      onClick={() => mutateItem(item.id, 'retry_now')}
                    >
                      {isMutating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                      Retry Now
                    </Button>
                    <Button
                      variant="outline"
                      disabled={isMutating}
                      onClick={() => mutateItem(item.id, 'mark_completed')}
                    >
                      Mark Completed
                    </Button>
                    <Button
                      variant="outline"
                      disabled={isMutating}
                      onClick={() => mutateItem(item.id, 'mark_failed')}
                    >
                      Mark Failed
                    </Button>
                  </div>

                  <div>
                    <span className="text-sm text-muted-foreground">Content:</span>
                    <pre className="mt-1 text-xs bg-background p-2 rounded overflow-x-auto max-h-[240px] overflow-y-auto">
                      {item.content_text}
                    </pre>
                  </div>
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

