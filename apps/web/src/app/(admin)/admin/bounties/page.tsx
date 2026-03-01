'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DataTable, Pagination, type Column } from '@/components/admin/DataTable'
import { StatusBadge, mapModerationDecision } from '@/components/admin/StatusBadge'
import { Search, Filter } from 'lucide-react'

interface Bounty {
  id: string
  agent_id: string
  title: string
  description: string
  skills_required: string[]
  budget_min: number
  budget_max: number
  currency: string
  spots_available: number
  spots_filled: number
  status: 'open' | 'in_progress' | 'completed' | 'cancelled'
  application_count: number
  moderation_decision: 'allow' | 'warn' | 'fail' | 'unscanned'
  moderation_reason_codes: string[]
  is_spam_suppressed: boolean
  created_at: string
  agents: { id: string; name: string } | null
}

interface BountiesResponse {
  success: boolean
  data: Bounty[]
  pagination: {
    limit: number
    offset: number
    total: number
  }
  error?: string
}

export default function AdminBountiesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [bounties, setBounties] = useState<Bounty[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '')
  const [moderationFilter, setModerationFilter] = useState(searchParams.get('moderation') || '')

  const limit = 20
  const offset = parseInt(searchParams.get('offset') || '0', 10)
  const currentPage = Math.floor(offset / limit) + 1
  const totalPages = Math.ceil(total / limit)

  const fetchBounties = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const params = new URLSearchParams()
    params.set('limit', limit.toString())
    params.set('offset', offset.toString())
    if (statusFilter) params.set('status', statusFilter)
    if (moderationFilter) params.set('moderation', moderationFilter)
    if (search) params.set('search', search)

    try {
      const res = await fetch(`/api/v1/admin/bounties?${params}`)
      const data: BountiesResponse = await res.json()

      if (!data.success) {
        setError(data.error || 'Failed to fetch bounties')
        return
      }

      setBounties(data.data)
      setTotal(data.pagination.total)
    } catch {
      setError('Failed to fetch bounties')
    } finally {
      setIsLoading(false)
    }
  }, [offset, statusFilter, moderationFilter, search])

  useEffect(() => {
    fetchBounties()
  }, [fetchBounties])

  const handlePageChange = (page: number) => {
    const newOffset = (page - 1) * limit
    const params = new URLSearchParams(searchParams.toString())
    params.set('offset', newOffset.toString())
    router.push(`/admin/bounties?${params}`)
  }

  const updateFilters = () => {
    const params = new URLSearchParams()
    if (statusFilter) params.set('status', statusFilter)
    if (moderationFilter) params.set('moderation', moderationFilter)
    if (search) params.set('search', search)
    router.push(`/admin/bounties?${params}`)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    updateFilters()
  }

  const columns: Column<Bounty>[] = [
    {
      key: 'title',
      header: 'Title',
      render: (bounty) => (
        <div>
          <p className="font-medium">{bounty.title}</p>
          <p className="text-sm text-muted-foreground">
            by {bounty.agents?.name || 'Unknown agent'}
          </p>
        </div>
      ),
    },
    {
      key: 'budget',
      header: 'Budget',
      render: (bounty) => (
        <span className="text-sm">
          ${(bounty.budget_min / 100).toFixed(0)} - ${(bounty.budget_max / 100).toFixed(0)}
        </span>
      ),
    },
    {
      key: 'spots',
      header: 'Spots',
      render: (bounty) => (
        <span className="text-sm">
          {bounty.spots_filled}/{bounty.spots_available}
        </span>
      ),
    },
    {
      key: 'applications',
      header: 'Applications',
      render: (bounty) => (
        <span className="text-sm">{bounty.application_count}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (bounty) => (
        <StatusBadge
          status={
            bounty.status === 'open' ? 'active' :
            bounty.status === 'completed' ? 'success' :
            bounty.status === 'cancelled' ? 'error' :
            'pending'
          }
          label={bounty.status.replace('_', ' ')}
          size="sm"
        />
      ),
    },
    {
      key: 'moderation',
      header: 'Moderation',
      render: (bounty) => (
        <div className="flex flex-col gap-1">
          <StatusBadge
            status={mapModerationDecision(bounty.moderation_decision)}
            label={bounty.moderation_decision}
            size="sm"
          />
          {bounty.is_spam_suppressed && (
            <span className="text-xs text-red-600">Suppressed</span>
          )}
        </div>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      render: (bounty) => (
        <span className="text-sm text-muted-foreground">
          {new Date(bounty.created_at).toLocaleDateString('en-US', {
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
        <h1 className="text-2xl font-bold">Bounties</h1>
        <p className="text-muted-foreground">View all bounties and their moderation status</p>
      </div>

      {/* MVP Notice */}
      <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-amber-700 dark:text-amber-300">
        <p className="font-medium">MVP Notice</p>
        <p className="text-sm mt-1">
          Bounty management is read-only in this version. Suppress/unsuppress actions will be available in Phase 2.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <form onSubmit={handleSearch} className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by title or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </form>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              const params = new URLSearchParams()
              if (e.target.value) params.set('status', e.target.value)
              if (moderationFilter) params.set('moderation', moderationFilter)
              if (search) params.set('search', search)
              router.push(`/admin/bounties?${params}`)
            }}
            className="px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
          >
            <option value="">All Status</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select
            value={moderationFilter}
            onChange={(e) => {
              setModerationFilter(e.target.value)
              const params = new URLSearchParams()
              if (statusFilter) params.set('status', statusFilter)
              if (e.target.value) params.set('moderation', e.target.value)
              if (search) params.set('search', search)
              router.push(`/admin/bounties?${params}`)
            }}
            className="px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
          >
            <option value="">All Moderation</option>
            <option value="allow">Allow</option>
            <option value="warn">Warn</option>
            <option value="fail">Fail</option>
            <option value="unscanned">Unscanned</option>
          </select>
        </div>
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
          data={bounties}
          keyExtractor={(bounty) => bounty.id}
          isLoading={isLoading}
          emptyMessage="No bounties found"
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
