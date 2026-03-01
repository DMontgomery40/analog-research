'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DataTable, Pagination, type Column } from '@/components/admin/DataTable'
import { StatusBadge, mapEscrowStatus } from '@/components/admin/StatusBadge'
import { StatCard } from '@/components/admin/StatCard'
import { Filter, DollarSign, CreditCard, Coins } from 'lucide-react'

interface Transaction {
  id: string
  title: string
  amount: number
  currency: string
  platform_fee: number
  payment_method: 'stripe' | 'crypto' | null
  escrow_status: 'pending' | 'funded' | 'released' | 'refunded' | 'disputed'
  stripe_payment_intent_id: string | null
  coinbase_payment_id: string | null
  crypto_tx_hash: string | null
  completed_at: string | null
  created_at: string
  humans: { id: string; name: string } | null
  agents: { id: string; name: string } | null
}

interface TransactionsResponse {
  success: boolean
  data: Transaction[]
  summary: {
    totalVolume: number
    totalFees: number
    volumeByCurrency: Record<string, number>
    feesByCurrency: Record<string, number>
  }
  pagination: {
    limit: number
    offset: number
    total: number
  }
  error?: string
}

function formatCurrency(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

export default function AdminTransactionsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [summary, setSummary] = useState<TransactionsResponse['summary'] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [currencyFilter, setCurrencyFilter] = useState(searchParams.get('currency') || '')
  const [paymentFilter, setPaymentFilter] = useState(searchParams.get('payment_method') || '')

  const limit = 20
  const offset = parseInt(searchParams.get('offset') || '0', 10)
  const currentPage = Math.floor(offset / limit) + 1
  const totalPages = Math.ceil(total / limit)

  const fetchTransactions = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const params = new URLSearchParams()
    params.set('limit', limit.toString())
    params.set('offset', offset.toString())
    if (currencyFilter) params.set('currency', currencyFilter)
    if (paymentFilter) params.set('payment_method', paymentFilter)

    try {
      const res = await fetch(`/api/v1/admin/transactions?${params}`)
      const data: TransactionsResponse = await res.json()

      if (!data.success) {
        setError(data.error || 'Failed to fetch transactions')
        return
      }

      setTransactions(data.data)
      setSummary(data.summary)
      setTotal(data.pagination.total)
    } catch {
      setError('Failed to fetch transactions')
    } finally {
      setIsLoading(false)
    }
  }, [offset, currencyFilter, paymentFilter])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  const handlePageChange = (page: number) => {
    const newOffset = (page - 1) * limit
    const params = new URLSearchParams(searchParams.toString())
    params.set('offset', newOffset.toString())
    router.push(`/admin/transactions?${params}`)
  }

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams()
    if (key === 'currency') {
      if (value) params.set('currency', value)
      if (paymentFilter) params.set('payment_method', paymentFilter)
      setCurrencyFilter(value)
    } else if (key === 'payment_method') {
      if (currencyFilter) params.set('currency', currencyFilter)
      if (value) params.set('payment_method', value)
      setPaymentFilter(value)
    }
    router.push(`/admin/transactions?${params}`)
  }

  const columns: Column<Transaction>[] = [
    {
      key: 'title',
      header: 'Booking',
      render: (tx) => (
        <div>
          <p className="font-medium">{tx.title}</p>
          <p className="text-sm text-muted-foreground">
            {tx.humans?.name || 'Unknown'} / {tx.agents?.name || 'Unknown'}
          </p>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (tx) => (
        <span className="font-medium">{formatCurrency(tx.amount, tx.currency)}</span>
      ),
    },
    {
      key: 'fee',
      header: 'Platform Fee',
      render: (tx) => (
        <span className="text-sm">{formatCurrency(tx.platform_fee, tx.currency)}</span>
      ),
    },
    {
      key: 'payment',
      header: 'Method',
      render: (tx) => (
        <div className="flex items-center gap-2">
          {tx.payment_method === 'crypto' ? (
            <Coins className="w-4 h-4 text-amber-500" />
          ) : (
            <CreditCard className="w-4 h-4 text-blue-500" />
          )}
          <span className="capitalize text-sm">{tx.payment_method || 'Unknown'}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (tx) => (
        <StatusBadge
          status={mapEscrowStatus(tx.escrow_status)}
          label={tx.escrow_status}
          size="sm"
        />
      ),
    },
    {
      key: 'reference',
      header: 'Reference',
      render: (tx) => (
        <span className="text-xs font-mono text-muted-foreground truncate max-w-[120px] block">
          {tx.stripe_payment_intent_id?.slice(0, 12) ||
           tx.coinbase_payment_id?.slice(0, 12) ||
           tx.crypto_tx_hash?.slice(0, 12) ||
           'N/A'}
          {(tx.stripe_payment_intent_id || tx.coinbase_payment_id || tx.crypto_tx_hash) && '...'}
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      render: (tx) => (
        <span className="text-sm text-muted-foreground">
          {new Date(tx.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      ),
    },
  ]

  // Calculate summary display
  const volumeDisplay = summary
    ? Object.entries(summary.volumeByCurrency)
        .map(([currency, amount]) => formatCurrency(amount, currency))
        .join(' / ') || '$0'
    : '-'

  const feesDisplay = summary
    ? Object.entries(summary.feesByCurrency)
        .map(([currency, amount]) => formatCurrency(amount, currency))
        .join(' / ') || '$0'
    : '-'

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Transactions</h1>
        <p className="text-muted-foreground">View the transaction ledger</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Total Volume"
          value={volumeDisplay}
          icon={<DollarSign className="w-5 h-5" />}
          description="Current page results"
        />
        <StatCard
          title="Platform Fees"
          value={feesDisplay}
          icon={<CreditCard className="w-5 h-5" />}
          description="Current page results"
        />
        <StatCard
          title="Transaction Count"
          value={total}
          icon={<Coins className="w-5 h-5" />}
          description="Total matching filters"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <select
          value={currencyFilter}
          onChange={(e) => updateFilter('currency', e.target.value)}
          className="px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
        >
          <option value="">All Currencies</option>
          <option value="USD">USD</option>
          <option value="USDC">USDC</option>
          <option value="ETH">ETH</option>
        </select>

        <select
          value={paymentFilter}
          onChange={(e) => updateFilter('payment_method', e.target.value)}
          className="px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
        >
          <option value="">All Methods</option>
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
          data={transactions}
          keyExtractor={(tx) => tx.id}
          isLoading={isLoading}
          emptyMessage="No transactions found"
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
