'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DataTable, Pagination, type Column } from '@/components/admin/DataTable'
import { StatusBadge } from '@/components/admin/StatusBadge'
import { Search, Filter } from 'lucide-react'

interface Human {
  id: string
  name: string
  bio: string | null
  avatar_url: string | null
  location: string | null
  skills: string[]
  rate_min: number
  rate_max: number
  is_verified: boolean
  verified_at: string | null
  total_earnings: number
  completed_bookings: number
  rating_average: number
  created_at: string
}

interface HumansResponse {
  success: boolean
  data: Human[]
  pagination: {
    limit: number
    offset: number
    total: number
  }
  error?: string
}

export default function AdminHumansPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [humans, setHumans] = useState<Human[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [verifiedFilter, setVerifiedFilter] = useState(searchParams.get('verified') || '')

  const limit = 20
  const offset = parseInt(searchParams.get('offset') || '0', 10)
  const currentPage = Math.floor(offset / limit) + 1
  const totalPages = Math.ceil(total / limit)

  const fetchHumans = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const params = new URLSearchParams()
    params.set('limit', limit.toString())
    params.set('offset', offset.toString())
    if (verifiedFilter) params.set('verified', verifiedFilter)
    if (search) params.set('search', search)

    try {
      const res = await fetch(`/api/v1/admin/humans?${params}`)
      const data: HumansResponse = await res.json()

      if (!data.success) {
        setError(data.error || 'Failed to fetch humans')
        return
      }

      setHumans(data.data)
      setTotal(data.pagination.total)
    } catch {
      setError('Failed to fetch humans')
    } finally {
      setIsLoading(false)
    }
  }, [offset, verifiedFilter, search])

  useEffect(() => {
    fetchHumans()
  }, [fetchHumans])

  const handlePageChange = (page: number) => {
    const newOffset = (page - 1) * limit
    const params = new URLSearchParams(searchParams.toString())
    params.set('offset', newOffset.toString())
    router.push(`/admin/humans?${params}`)
  }

  const handleFilterChange = (verified: string) => {
    setVerifiedFilter(verified)
    const params = new URLSearchParams()
    if (verified) params.set('verified', verified)
    if (search) params.set('search', search)
    router.push(`/admin/humans?${params}`)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const params = new URLSearchParams()
    if (verifiedFilter) params.set('verified', verifiedFilter)
    if (search) params.set('search', search)
    router.push(`/admin/humans?${params}`)
  }

  const columns: Column<Human>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (human) => (
        <div className="flex items-center gap-3">
          {human.avatar_url ? (
            <img
              src={human.avatar_url}
              alt={human.name}
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-medium text-primary">
                {human.name[0]?.toUpperCase()}
              </span>
            </div>
          )}
          <div>
            <p className="font-medium">{human.name}</p>
            {human.location && (
              <p className="text-sm text-muted-foreground">{human.location}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (human) => (
        <StatusBadge
          status={human.is_verified ? 'verified' : 'unverified'}
          size="sm"
        />
      ),
    },
    {
      key: 'skills',
      header: 'Skills',
      render: (human) => (
        <div className="flex flex-wrap gap-1 max-w-[200px]">
          {human.skills.slice(0, 3).map((skill) => (
            <span
              key={skill}
              className="px-2 py-0.5 text-xs bg-muted rounded"
            >
              {skill}
            </span>
          ))}
          {human.skills.length > 3 && (
            <span className="px-2 py-0.5 text-xs text-muted-foreground">
              +{human.skills.length - 3}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'rate',
      header: 'Rate',
      render: (human) => (
        <span className="text-sm">
          ${(human.rate_min / 100).toFixed(0)} - ${(human.rate_max / 100).toFixed(0)}/hr
        </span>
      ),
    },
    {
      key: 'earnings',
      header: 'Earnings',
      render: (human) => (
        <span className="text-sm">
          ${(human.total_earnings / 100).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'bookings',
      header: 'Bookings',
      render: (human) => (
        <span className="text-sm">{human.completed_bookings}</span>
      ),
    },
    {
      key: 'created',
      header: 'Joined',
      render: (human) => (
        <span className="text-sm text-muted-foreground">
          {new Date(human.created_at).toLocaleDateString('en-US', {
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
        <h1 className="text-2xl font-bold">Humans</h1>
        <p className="text-muted-foreground">Manage human profiles and verifications</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <form onSubmit={handleSearch} className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name or bio..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </form>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select
            value={verifiedFilter}
            onChange={(e) => handleFilterChange(e.target.value)}
            className="px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
          >
            <option value="">All Status</option>
            <option value="true">Verified</option>
            <option value="false">Unverified</option>
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
          data={humans}
          keyExtractor={(human) => human.id}
          isLoading={isLoading}
          emptyMessage="No humans found"
          onRowClick={(human) => router.push(`/admin/humans/${human.id}`)}
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
