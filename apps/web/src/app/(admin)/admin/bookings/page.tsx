'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DataTable, Pagination, type Column } from '@/components/admin/DataTable'
import { StatusBadge, mapBookingStatus, mapEscrowStatus } from '@/components/admin/StatusBadge'
import { Filter } from 'lucide-react'

interface Booking {
  id: string
  agent_id: string
  human_id: string
  title: string
  description: string
  amount: number
  currency: string
  platform_fee: number
  escrow_status: 'pending' | 'funded' | 'released' | 'refunded' | 'disputed'
  payment_method: 'stripe' | 'crypto' | null
  status: 'pending' | 'funded' | 'in_progress' | 'submitted' | 'completed' | 'disputed' | 'cancelled'
  created_at: string
  completed_at: string | null
  humans: { id: string; name: string; avatar_url: string | null; is_verified: boolean } | null
  agents: { id: string; name: string } | null
}

interface BookingsResponse {
  success: boolean
  data: Booking[]
  pagination: {
    limit: number
    offset: number
    total: number
  }
  error?: string
}

export default function AdminBookingsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [bookings, setBookings] = useState<Booking[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '')
  const [escrowFilter, setEscrowFilter] = useState(searchParams.get('escrow_status') || '')
  const [paymentFilter, setPaymentFilter] = useState(searchParams.get('payment_method') || '')

  const limit = 20
  const offset = parseInt(searchParams.get('offset') || '0', 10)
  const currentPage = Math.floor(offset / limit) + 1
  const totalPages = Math.ceil(total / limit)

  const fetchBookings = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const params = new URLSearchParams()
    params.set('limit', limit.toString())
    params.set('offset', offset.toString())
    if (statusFilter) params.set('status', statusFilter)
    if (escrowFilter) params.set('escrow_status', escrowFilter)
    if (paymentFilter) params.set('payment_method', paymentFilter)

    try {
      const res = await fetch(`/api/v1/admin/bookings?${params}`)
      const data: BookingsResponse = await res.json()

      if (!data.success) {
        setError(data.error || 'Failed to fetch bookings')
        return
      }

      setBookings(data.data)
      setTotal(data.pagination.total)
    } catch {
      setError('Failed to fetch bookings')
    } finally {
      setIsLoading(false)
    }
  }, [offset, statusFilter, escrowFilter, paymentFilter])

  useEffect(() => {
    fetchBookings()
  }, [fetchBookings])

  const handlePageChange = (page: number) => {
    const newOffset = (page - 1) * limit
    const params = new URLSearchParams(searchParams.toString())
    params.set('offset', newOffset.toString())
    router.push(`/admin/bookings?${params}`)
  }

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams()
    if (key === 'status') {
      if (value) params.set('status', value)
      if (escrowFilter) params.set('escrow_status', escrowFilter)
      if (paymentFilter) params.set('payment_method', paymentFilter)
      setStatusFilter(value)
    } else if (key === 'escrow_status') {
      if (statusFilter) params.set('status', statusFilter)
      if (value) params.set('escrow_status', value)
      if (paymentFilter) params.set('payment_method', paymentFilter)
      setEscrowFilter(value)
    } else if (key === 'payment_method') {
      if (statusFilter) params.set('status', statusFilter)
      if (escrowFilter) params.set('escrow_status', escrowFilter)
      if (value) params.set('payment_method', value)
      setPaymentFilter(value)
    }
    router.push(`/admin/bookings?${params}`)
  }

  const columns: Column<Booking>[] = [
    {
      key: 'title',
      header: 'Title',
      render: (booking) => (
        <div>
          <p className="font-medium">{booking.title}</p>
          <p className="text-sm text-muted-foreground truncate max-w-[200px]">
            {booking.description}
          </p>
        </div>
      ),
    },
    {
      key: 'parties',
      header: 'Parties',
      render: (booking) => (
        <div className="text-sm">
          <p>Human: {booking.humans?.name || 'Unknown'}</p>
          <p>Agent: {booking.agents?.name || 'Unknown'}</p>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (booking) => (
        <div className="text-sm">
          <p className="font-medium">${(booking.amount / 100).toFixed(2)}</p>
          <p className="text-muted-foreground">
            Fee: ${(booking.platform_fee / 100).toFixed(2)}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (booking) => (
        <StatusBadge
          status={mapBookingStatus(booking.status)}
          label={booking.status.replace('_', ' ')}
          size="sm"
        />
      ),
    },
    {
      key: 'escrow',
      header: 'Escrow',
      render: (booking) => (
        <StatusBadge
          status={mapEscrowStatus(booking.escrow_status)}
          label={booking.escrow_status}
          size="sm"
        />
      ),
    },
    {
      key: 'payment',
      header: 'Payment',
      render: (booking) => (
        <span className="text-sm capitalize">
          {booking.payment_method || 'Pending'}
        </span>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      render: (booking) => (
        <span className="text-sm text-muted-foreground">
          {new Date(booking.created_at).toLocaleDateString('en-US', {
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
        <h1 className="text-2xl font-bold">Bookings</h1>
        <p className="text-muted-foreground">View all bookings and their status</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <select
          value={statusFilter}
          onChange={(e) => updateFilter('status', e.target.value)}
          className="px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
        >
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="funded">Funded</option>
          <option value="in_progress">In Progress</option>
          <option value="submitted">Submitted</option>
          <option value="completed">Completed</option>
          <option value="disputed">Disputed</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <select
          value={escrowFilter}
          onChange={(e) => updateFilter('escrow_status', e.target.value)}
          className="px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
        >
          <option value="">All Escrow</option>
          <option value="pending">Pending</option>
          <option value="funded">Funded</option>
          <option value="released">Released</option>
          <option value="refunded">Refunded</option>
          <option value="disputed">Disputed</option>
        </select>

        <select
          value={paymentFilter}
          onChange={(e) => updateFilter('payment_method', e.target.value)}
          className="px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
        >
          <option value="">All Payment</option>
          <option value="stripe">Stripe</option>
          <option value="crypto">Crypto</option>
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
          data={bookings}
          keyExtractor={(booking) => booking.id}
          isLoading={isLoading}
          emptyMessage="No bookings found"
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
