'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { StatusBadge, mapDisputeStatus, mapEscrowStatus } from '@/components/admin/StatusBadge'
import { Button } from '@analogresearch/ui'
import {
  ArrowLeft,
  User,
  Bot,
  DollarSign,
  Calendar,
  MessageSquare,
  Loader2,
} from 'lucide-react'

interface Dispute {
  id: string
  booking_id: string
  opened_by_type: 'human' | 'agent'
  opened_by_id: string
  reason: string
  evidence: Record<string, unknown>
  status: 'open' | 'under_review' | 'resolved' | 'dismissed'
  resolution: string | null
  resolved_by: string | null
  resolved_at: string | null
  human_payout_percent: number | null
  created_at: string
  updated_at: string
  bookings: {
    id: string
    title: string
    description: string
    amount: number
    currency: string
    platform_fee: number
    escrow_status: 'pending' | 'funded' | 'released' | 'refunded' | 'disputed'
    payment_method: 'stripe' | 'crypto' | null
    status: string
    created_at: string
    completed_at: string | null
    human_id: string
    agent_id: string
    humans: { id: string; name: string; avatar_url: string | null; is_verified: boolean } | null
    agents: { id: string; name: string; description: string | null } | null
  } | null
}

interface Message {
  id: string
  sender_type: 'human' | 'agent'
  sender_id: string
  content: string
  created_at: string
}

interface DisputeDetailResponse {
  success: boolean
  data: {
    dispute: Dispute
    messages: Message[] | null
  }
  error?: string
}

export default function AdminDisputeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [dispute, setDispute] = useState<Dispute | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true)
      setError(null)

      try {
        const res = await fetch(`/api/v1/admin/disputes/${id}`)
        const data: DisputeDetailResponse = await res.json()

        if (!data.success) {
          setError(data.error || 'Failed to fetch dispute')
          return
        }

        setDispute(data.data.dispute)
        setMessages(data.data.messages || [])
      } catch {
        setError('Failed to fetch dispute')
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [id])

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    )
  }

  if (error || !dispute) {
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
          {error || 'Dispute not found'}
        </div>
        <Button variant="ghost" className="mt-4" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Go back
        </Button>
      </div>
    )
  }

  const booking = dispute.bookings

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link
          href="/admin/disputes"
          className="p-2 hover:bg-accent rounded-md transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Dispute Details</h1>
            <StatusBadge status={mapDisputeStatus(dispute.status)} label={dispute.status.replace('_', ' ')} />
          </div>
          <p className="text-muted-foreground mt-1">
            {booking?.title || 'Unknown booking'}
          </p>
        </div>
      </div>

      {/* MVP Notice */}
      <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-amber-700 dark:text-amber-300">
        <p className="font-medium">MVP Notice</p>
        <p className="text-sm mt-1">
          Dispute resolution is read-only in this version. Resolution with payout splitting will be available in Phase 2.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Dispute Info */}
        <div className="bg-card border border-border rounded-xl">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold">Dispute Information</h2>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <span className="text-sm text-muted-foreground">Opened By</span>
              <p className="mt-1 flex items-center gap-2">
                {dispute.opened_by_type === 'human' ? (
                  <User className="w-4 h-4" />
                ) : (
                  <Bot className="w-4 h-4" />
                )}
                <span className="capitalize">{dispute.opened_by_type}</span>
              </p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Reason</span>
              <p className="mt-1 whitespace-pre-wrap">{dispute.reason}</p>
            </div>
            {Object.keys(dispute.evidence).length > 0 && (
              <div>
                <span className="text-sm text-muted-foreground">Evidence</span>
                <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-x-auto">
                  {JSON.stringify(dispute.evidence, null, 2)}
                </pre>
              </div>
            )}
            {dispute.resolution && (
              <div>
                <span className="text-sm text-muted-foreground">Resolution</span>
                <p className="mt-1">{dispute.resolution}</p>
                {dispute.human_payout_percent !== null && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Human receives {dispute.human_payout_percent}% of escrowed amount
                  </p>
                )}
              </div>
            )}
            <div className="pt-2 border-t border-border text-sm text-muted-foreground">
              <p>Created: {new Date(dispute.created_at).toLocaleString()}</p>
              {dispute.resolved_at && (
                <p>Resolved: {new Date(dispute.resolved_at).toLocaleString()}</p>
              )}
            </div>
          </div>
        </div>

        {/* Booking Info */}
        {booking && (
          <div className="bg-card border border-border rounded-xl">
            <div className="p-4 border-b border-border">
              <h2 className="font-semibold">Booking Details</h2>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <span className="text-sm text-muted-foreground">Title</span>
                <p className="mt-1 font-medium">{booking.title}</p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Description</span>
                <p className="mt-1 text-sm">{booking.description}</p>
              </div>
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />
                    Amount
                  </span>
                  <p className="mt-1 font-medium">
                    ${(booking.amount / 100).toFixed(2)} {booking.currency}
                  </p>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Escrow</span>
                  <div className="mt-1">
                    <StatusBadge status={mapEscrowStatus(booking.escrow_status)} size="sm" />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-border space-y-3">
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Human</p>
                    <p className="font-medium">{booking.humans?.name || 'Unknown'}</p>
                  </div>
                  {booking.humans?.is_verified && (
                    <StatusBadge status="verified" size="sm" />
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Bot className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Agent</p>
                    <p className="font-medium">{booking.agents?.name || 'Unknown'}</p>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-border text-sm text-muted-foreground">
                <p className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Created: {new Date(booking.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Conversation History */}
        <div className="bg-card border border-border rounded-xl lg:col-span-2">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            <h2 className="font-semibold">Conversation History</h2>
          </div>
          <div className="p-4 max-h-[400px] overflow-y-auto">
            {messages.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No messages found</p>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${
                      message.sender_type === 'human' ? '' : 'flex-row-reverse'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        message.sender_type === 'human'
                          ? 'bg-primary/10'
                          : 'bg-muted'
                      }`}
                    >
                      {message.sender_type === 'human' ? (
                        <User className="w-4 h-4" />
                      ) : (
                        <Bot className="w-4 h-4" />
                      )}
                    </div>
                    <div
                      className={`flex-1 max-w-[70%] ${
                        message.sender_type === 'human' ? '' : 'text-right'
                      }`}
                    >
                      <div
                        className={`inline-block p-3 rounded-lg ${
                          message.sender_type === 'human'
                            ? 'bg-muted'
                            : 'bg-primary/10'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(message.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
