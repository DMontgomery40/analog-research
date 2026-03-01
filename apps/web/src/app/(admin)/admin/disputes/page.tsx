'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DataTable, Pagination, type Column } from '@/components/admin/DataTable'
import { StatusBadge, mapDisputeStatus } from '@/components/admin/StatusBadge'
import { Filter } from 'lucide-react'

interface Dispute {
  id: string
  booking_id: string
  opened_by_type: 'human' | 'agent'
  opened_by_id: string
  reason: string
  evidence: Record<string, unknown>
  status: 'open' | 'under_review' | 'resolved' | 'dismissed'
  resolution: string | null
  human_payout_percent: number | null
  created_at: string
  updated_at: string
  bookings: {
    id: string
    title: string
    amount: number
    currency: string
    human_id: string
    agent_id: string
    humans: { id: string; name: string } | null
    agents: { id: string; name: string } | null
  } | null
}

interface DisputesResponse {
  success: boolean
  data: Dispute[]
  pagination: {
    limit: number
    offset: number
    total: number
  }
  error?: string
}

export default function AdminDisputesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [disputes, setDisputes] = useState<Dispute[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '')

  const limit = 20
  const offset = parseInt(searchParams.get('offset') || '0', 10)
  const currentPage = Math.floor(offset / limit) + 1
  const totalPages = Math.ceil(total / limit)

  const fetchDisputes = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const params = new URLSearchParams()
    params.set('limit', limit.toString())
    params.set('offset', offset.toString())
    if (statusFilter) params.set('status', statusFilter)

    try {
      const res = await fetch(`/api/v1/admin/disputes?${params}`)
      const data: DisputesResponse = await res.json()

      if (!data.success) {
        setError(data.error || 'Failed to fetch disputes')
        return
      }

      setDisputes(data.data)
      setTotal(data.pagination.total)
    } catch {
      setError('Failed to fetch disputes')
    } finally {
      setIsLoading(false)
    }
  }, [offset, statusFilter])

  useEffect(() => {
    fetchDisputes()
  }, [fetchDisputes])

  const handlePageChange = (page: number) => {
    const newOffset = (page - 1) * limit
    const params = new URLSearchParams(searchParams.toString())
    params.set('offset', newOffset.toString())
    router.push(`/admin/disputes?${params}`)
  }

  const handleFilterChange = (status: string) => {
    setStatusFilter(status)
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    router.push(`/admin/disputes?${params}`)
  }

  const columns: Column<Dispute>[] = [
    {
      key: 'booking',
      header: 'Booking',
      render: (dispute) => (
        <div>
          <p className="font-medium">{dispute.bookings?.title || 'Unknown booking'}</p>
          <p className="text-sm text-muted-foreground">
            ${((dispute.bookings?.amount || 0) / 100).toFixed(2)} {dispute.bookings?.currency || 'USD'}
          </p>
        </div>
      ),
    },
    {
      key: 'parties',
      header: 'Parties',
      render: (dispute) => (
        <div className="text-sm">
          <p>Human: {dispute.bookings?.humans?.name || 'Unknown'}</p>
          <p>Agent: {dispute.bookings?.agents?.name || 'Unknown'}</p>
        </div>
      ),
    },
    {
      key: 'opened_by',
      header: 'Opened By',
      render: (dispute) => (
        <span className="capitalize">{dispute.opened_by_type}</span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (dispute) => (
        <p className="max-w-[300px] truncate text-sm">
          {dispute.reason}
        </p>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (dispute) => (
        <StatusBadge
          status={mapDisputeStatus(dispute.status)}
          label={dispute.status.replace('_', ' ')}
          size="sm"
        />
      ),
    },
    {
      key: 'created',
      header: 'Created',
      render: (dispute) => (
        <span className="text-sm text-muted-foreground">
          {new Date(dispute.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      ),
    },
  ]

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Disputes</h1>
        <p className="text-muted-foreground">View and manage booking disputes</p>
      </div>

      {/* Note about MVP limitations */}
      <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-amber-700 dark:text-amber-300">
        <p className="font-medium">MVP Notice</p>
        <p className="text-sm mt-1">
          Dispute resolution is read-only in this version. Resolution with payout splitting will be available in Phase 2.
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <select
          value={statusFilter}
          onChange={(e) => handleFilterChange(e.target.value)}
          className="px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
        >
          <option value="">All Status</option>
          <option value="open">Open</option>
          <option value="under_review">Under Review</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
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
          data={disputes}
          keyExtractor={(dispute) => dispute.id}
          isLoading={isLoading}
          emptyMessage="No disputes found"
          onRowClick={(dispute) => router.push(`/admin/disputes/${dispute.id}`)}
        />

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
