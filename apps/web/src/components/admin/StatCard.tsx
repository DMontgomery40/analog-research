'use client'

import Link from 'next/link'
import { cn } from '@analoglabor/ui'
import { ArrowRight } from 'lucide-react'

interface StatCardProps {
  title: string
  value: string | number
  icon: React.ReactNode
  href?: string
  description?: string
  trend?: {
    value: number
    label: string
    isPositive?: boolean
  }
  className?: string
}

/**
 * Clickable metric card for the admin dashboard.
 * Minimum touch target of 44px for accessibility.
 */
export function StatCard({
  title,
  value,
  icon,
  href,
  description,
  trend,
  className,
}: StatCardProps) {
  const content = (
    <div
      className={cn(
        'bg-card border border-border rounded-xl p-5 min-h-[120px]',
        href && 'hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer group',
        className
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
        <div className="text-primary">{icon}</div>
      </div>

      <p className="text-3xl font-bold tracking-tight">{value}</p>

      {description && (
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      )}

      {trend && (
        <div className="flex items-center gap-1 mt-2">
          <span
            className={cn(
              'text-sm font-medium',
              trend.isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            )}
          >
            {trend.isPositive ? '+' : ''}{trend.value}%
          </span>
          <span className="text-sm text-muted-foreground">{trend.label}</span>
        </div>
      )}

      {href && (
        <div className="flex items-center gap-1 mt-3 text-sm text-primary opacity-0 group-hover:opacity-100 transition-opacity">
          View details
          <ArrowRight className="w-4 h-4" />
        </div>
      )}
    </div>
  )

  if (href) {
    return <Link href={href}>{content}</Link>
  }

  return content
}
