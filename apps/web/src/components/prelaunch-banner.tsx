'use client'

import { FlaskConical, ShieldAlert } from 'lucide-react'
import { PRELAUNCH_NOTICE, TESTING_DATA_NOTICE } from '@/lib/brand'

type PrelaunchBannerProps = {
  compact?: boolean
  className?: string
}

export function PrelaunchBanner({ compact = false, className = '' }: PrelaunchBannerProps) {
  return (
    <div className={`border-y border-amber-300/50 bg-amber-100/70 text-amber-950 ${className}`.trim()}>
      <div className="mx-auto max-w-7xl px-4 py-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-[0.12em]">
            <FlaskConical className="h-3.5 w-3.5" />
            Pre-launch
          </span>
          {!compact && (
            <span className="hidden items-center gap-1 text-[11px] font-medium uppercase tracking-[0.08em] sm:inline-flex">
              <ShieldAlert className="h-3.5 w-3.5" />
              Browse-only mode
            </span>
          )}
        </div>

        <p className="mt-1 leading-relaxed">{PRELAUNCH_NOTICE}</p>
        {!compact && <p className="mt-1 text-[11px] font-medium leading-relaxed">{TESTING_DATA_NOTICE}</p>}
      </div>
    </div>
  )
}
