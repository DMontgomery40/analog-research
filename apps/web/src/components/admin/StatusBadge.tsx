'use client'

import { cn } from '@analoglabor/ui'
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  ShieldAlert,
  ShieldCheck,
  CircleDot,
  Loader2,
} from 'lucide-react'

type StatusType =
  | 'success'
  | 'error'
  | 'warning'
  | 'pending'
  | 'verified'
  | 'unverified'
  | 'active'
  | 'loading'
  | 'open'
  | 'resolved'
  | 'disputed'
  | 'funded'
  | 'released'
  | 'refunded'

interface StatusConfig {
  icon: React.ReactNode
  label: string
  className: string
}

const statusConfigs: Record<StatusType, StatusConfig> = {
  success: {
    icon: <CheckCircle className="w-4 h-4" />,
    label: 'Success',
    className: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
  },
  error: {
    icon: <XCircle className="w-4 h-4" />,
    label: 'Error',
    className: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
  },
  warning: {
    icon: <AlertTriangle className="w-4 h-4" />,
    label: 'Warning',
    className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  },
  pending: {
    icon: <Clock className="w-4 h-4" />,
    label: 'Pending',
    className: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700',
  },
  verified: {
    icon: <ShieldCheck className="w-4 h-4" />,
    label: 'Verified',
    className: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
  },
  unverified: {
    icon: <ShieldAlert className="w-4 h-4" />,
    label: 'Unverified',
    className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  },
  active: {
    icon: <CircleDot className="w-4 h-4" />,
    label: 'Active',
    className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  },
  loading: {
    icon: <Loader2 className="w-4 h-4 animate-spin" />,
    label: 'Loading',
    className: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700',
  },
  open: {
    icon: <AlertTriangle className="w-4 h-4" />,
    label: 'Open',
    className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  },
  resolved: {
    icon: <CheckCircle className="w-4 h-4" />,
    label: 'Resolved',
    className: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
  },
  disputed: {
    icon: <ShieldAlert className="w-4 h-4" />,
    label: 'Disputed',
    className: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
  },
  funded: {
    icon: <CheckCircle className="w-4 h-4" />,
    label: 'Funded',
    className: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
  },
  released: {
    icon: <CheckCircle className="w-4 h-4" />,
    label: 'Released',
    className: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
  },
  refunded: {
    icon: <XCircle className="w-4 h-4" />,
    label: 'Refunded',
    className: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700',
  },
}

interface StatusBadgeProps {
  status: StatusType
  label?: string
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Dyslexia-friendly status badge with color, icon, and text.
 * All three visual cues are provided for maximum accessibility.
 */
export function StatusBadge({ status, label, size = 'md', className }: StatusBadgeProps) {
  const config = statusConfigs[status]
  const displayLabel = label || config.label

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        config.className,
        className
      )}
    >
      {config.icon}
      {displayLabel}
    </span>
  )
}

/**
 * Map common database status values to StatusBadge types.
 */
export function mapBookingStatus(
  status: 'pending' | 'funded' | 'in_progress' | 'submitted' | 'completed' | 'disputed' | 'cancelled'
): StatusType {
  switch (status) {
    case 'pending':
      return 'pending'
    case 'funded':
      return 'funded'
    case 'in_progress':
      return 'active'
    case 'submitted':
      return 'pending'
    case 'completed':
      return 'success'
    case 'disputed':
      return 'disputed'
    case 'cancelled':
      return 'error'
    default:
      return 'pending'
  }
}

export function mapEscrowStatus(
  status: 'pending' | 'funded' | 'released' | 'refunded' | 'disputed'
): StatusType {
  switch (status) {
    case 'pending':
      return 'pending'
    case 'funded':
      return 'funded'
    case 'released':
      return 'released'
    case 'refunded':
      return 'refunded'
    case 'disputed':
      return 'disputed'
    default:
      return 'pending'
  }
}

export function mapDisputeStatus(
  status: 'open' | 'under_review' | 'resolved' | 'dismissed'
): StatusType {
  switch (status) {
    case 'open':
      return 'open'
    case 'under_review':
      return 'warning'
    case 'resolved':
      return 'resolved'
    case 'dismissed':
      return 'error'
    default:
      return 'pending'
  }
}

export function mapModerationDecision(
  decision: 'allow' | 'warn' | 'fail' | 'unscanned'
): StatusType {
  switch (decision) {
    case 'allow':
      return 'success'
    case 'warn':
      return 'warning'
    case 'fail':
      return 'error'
    case 'unscanned':
      return 'pending'
    default:
      return 'pending'
  }
}
