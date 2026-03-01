'use client'

import { cn } from '@analoglabor/ui'
import { Clock, User, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'

interface AuditEntry {
  id: string
  action: string
  adminEmail: string
  createdAt: string
  beforeState?: Record<string, unknown> | null
  afterState?: Record<string, unknown> | null
  notes?: string | null
}

interface AuditTrailProps {
  entries: AuditEntry[]
  isLoading?: boolean
  emptyMessage?: string
  className?: string
}

/**
 * Display audit trail history for admin actions.
 */
export function AuditTrail({
  entries,
  isLoading = false,
  emptyMessage = 'No audit history',
  className,
}: AuditTrailProps) {
  if (isLoading) {
    return (
      <div className={cn('p-4 text-center text-muted-foreground', className)}>
        Loading audit history...
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className={cn('p-4 text-center text-muted-foreground', className)}>
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      {entries.map((entry) => (
        <AuditEntryRow key={entry.id} entry={entry} />
      ))}
    </div>
  )
}

function AuditEntryRow({ entry }: { entry: AuditEntry }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const hasDetails = entry.beforeState || entry.afterState || entry.notes

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }

  const formatAction = (action: string) => {
    return action
      .replace('admin.', '')
      .replace('.', ' ')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => hasDetails && setIsExpanded(!isExpanded)}
        disabled={!hasDetails}
        className={cn(
          'w-full p-3 flex items-center gap-3 text-left',
          hasDetails && 'hover:bg-accent/50 cursor-pointer',
          !hasDetails && 'cursor-default'
        )}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{formatAction(entry.action)}</span>
          </div>
          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <User className="w-3.5 h-3.5" />
              {entry.adminEmail}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {formatDate(entry.createdAt)}
            </span>
          </div>
        </div>
        {hasDetails && (
          isExpanded ? (
            <ChevronUp className="w-5 h-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          )
        )}
      </button>

      {isExpanded && hasDetails && (
        <div className="border-t border-border p-3 bg-muted/30 space-y-3">
          {entry.notes && (
            <div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Notes
              </span>
              <p className="mt-1 text-sm">{entry.notes}</p>
            </div>
          )}
          {entry.beforeState && (
            <div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Before
              </span>
              <pre className="mt-1 text-xs bg-background p-2 rounded overflow-x-auto">
                {JSON.stringify(entry.beforeState, null, 2)}
              </pre>
            </div>
          )}
          {entry.afterState && (
            <div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                After
              </span>
              <pre className="mt-1 text-xs bg-background p-2 rounded overflow-x-auto">
                {JSON.stringify(entry.afterState, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
