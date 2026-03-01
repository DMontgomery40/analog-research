import * as React from 'react'
import Link from 'next/link'
import { LucideIcon } from 'lucide-react'

interface FoundingPartnerCardProps {
  icon: LucideIcon
  title: string
  description: string
  status: 'recruiting' | 'filled'
  applyLink: string
}

export function FoundingPartnerCard({
  icon: Icon,
  title,
  description,
  status,
  applyLink,
}: FoundingPartnerCardProps) {
  return (
    <div className="p-6 rounded-xl border border-border bg-card hover:border-blue-500/50 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
          <Icon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
        </div>
        <span
          className={`text-xs font-medium px-2 py-1 rounded-full ${
            status === 'recruiting'
              ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
          }`}
        >
          {status === 'recruiting' ? 'Recruiting' : 'Filled'}
        </span>
      </div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm mb-4">{description}</p>
      {status === 'recruiting' && (
        <Link
          href={applyLink}
          className="inline-flex items-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          Apply Now &rarr;
        </Link>
      )}
    </div>
  )
}
