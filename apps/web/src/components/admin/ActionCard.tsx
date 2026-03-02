'use client'

import Link from 'next/link'
import { cn } from '@analogresearch/ui'
import { ChevronRight } from 'lucide-react'
import { StatusBadge } from './StatusBadge'

interface ActionCardProps {
  title: string
  subtitle?: string
  status?: 'pending' | 'warning' | 'error' | 'success'
  statusLabel?: string
  href?: string
  metadata?: Array<{ label: string; value: string }>
  actions?: React.ReactNode
  className?: string
}

/**
 * Action queue item card with status indicator and optional actions.
 * Used for displaying items that need admin attention.
 */
export function ActionCard({
  title,
  subtitle,
  status,
  statusLabel,
  href,
  metadata,
  actions,
  className,
}: ActionCardProps) {
  const content = (
    <div
      className={cn(
        'bg-card border border-border rounded-lg p-4',
        href && 'hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer group',
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium truncate">{title}</h3>
            {status && <StatusBadge status={status} label={statusLabel} size="sm" />}
          </div>

          {subtitle && (
            <p className="text-sm text-muted-foreground mt-1 truncate">{subtitle}</p>
          )}

          {metadata && metadata.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
              {metadata.map((item, index) => (
                <span key={index}>
                  <span className="font-medium">{item.label}:</span> {item.value}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {actions}
          {href && (
            <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
          )}
        </div>
      </div>
    </div>
  )

  if (href) {
    return <Link href={href}>{content}</Link>
  }

  return content
}
