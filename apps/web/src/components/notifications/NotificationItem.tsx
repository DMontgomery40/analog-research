'use client'

import {
  AlertTriangle,
  Bell,
  Briefcase,
  Bot,
  CheckCircle,
  DollarSign,
  FileCheck,
  MessageSquare,
  Star,
  UserPlus,
  XCircle,
} from 'lucide-react'

export interface NotificationData {
  id: string
  type: string
  title: string
  body: string | null
  data: Record<string, unknown>
  is_read: boolean
  created_at: string
}

interface NotificationItemProps {
  notification: NotificationData
  onMarkRead?: (id: string) => void
}

const NOTIFICATION_CONFIG: Record<string, { icon: typeof Bell; color: string }> = {
  new_application: { icon: UserPlus, color: 'text-blue-500' },
  application_accepted: { icon: CheckCircle, color: 'text-green-500' },
  application_rejected: { icon: XCircle, color: 'text-red-500' },
  new_message: { icon: MessageSquare, color: 'text-purple-500' },
  booking_created: { icon: Briefcase, color: 'text-indigo-500' },
  escrow_funded: { icon: DollarSign, color: 'text-green-500' },
  proof_submitted: { icon: FileCheck, color: 'text-blue-500' },
  proof_approved: { icon: CheckCircle, color: 'text-green-500' },
  proof_rejected: { icon: XCircle, color: 'text-red-500' },
  review_received: { icon: Star, color: 'text-yellow-500' },
  dispute_opened: { icon: AlertTriangle, color: 'text-orange-500' },
  dispute_resolved: { icon: CheckCircle, color: 'text-green-500' },
  autopilot_action: { icon: Bot, color: 'text-amber-500' },
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

export function NotificationItem({ notification, onMarkRead }: NotificationItemProps) {
  const config = NOTIFICATION_CONFIG[notification.type] || { icon: Bell, color: 'text-muted-foreground' }
  const Icon = config.icon

  const handleClick = () => {
    if (!notification.is_read && onMarkRead) {
      onMarkRead(notification.id)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`w-full flex items-start gap-3 p-3 text-left hover:bg-accent transition-colors ${
        !notification.is_read ? 'bg-accent/50' : ''
      }`}
    >
      <div className={`shrink-0 mt-0.5 ${config.color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${!notification.is_read ? 'font-medium' : 'text-muted-foreground'}`}>
          {notification.title}
        </p>
        {notification.body && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {notification.body}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          {formatTimeAgo(notification.created_at)}
        </p>
      </div>
      {!notification.is_read && (
        <div className="shrink-0 mt-2">
          <span className="w-2 h-2 bg-primary rounded-full block" />
        </div>
      )}
    </button>
  )
}
