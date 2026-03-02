'use client'

import type { ComponentType, ReactNode } from 'react'
import Link from 'next/link'
import { Database, BriefcaseBusiness, Users } from 'lucide-react'
import { BRAND_NAME, BRAND_TAGLINE, TESTING_DATA_NOTICE } from '@/lib/brand'

type PublicSection = 'overview' | 'humans' | 'bounties'

type PublicResearchShellProps = {
  children: ReactNode
  section: PublicSection
}

const SECTION_LINKS: Array<{ id: PublicSection; href: string; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: 'overview', href: '/', label: 'Overview', icon: Database },
  { id: 'humans', href: '/browse', label: 'Browse Humans', icon: Users },
  { id: 'bounties', href: '/bounties', label: 'Browse Bounties', icon: BriefcaseBusiness },
]

export function PublicResearchShell({ children, section }: PublicResearchShellProps) {
  return (
    <div className="mx-auto grid w-full max-w-[1280px] gap-6 px-4 py-6 lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="hidden lg:block">
        <div className="sticky top-28 space-y-4">
          <div className="rounded-md border border-border bg-card p-4 shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Workspace</p>
            <h2 className="mt-2 text-lg font-semibold">{BRAND_NAME}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{BRAND_TAGLINE}</p>
          </div>

          <nav className="rounded-md border border-border bg-card p-2 shadow-sm" aria-label="Public navigation">
            <ul className="space-y-1">
              {SECTION_LINKS.map((item) => {
                const Icon = item.icon
                const isActive = item.id === section

                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-2 rounded-sm px-3 py-2 text-sm transition-colors ${
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>

          <div className="rounded-md border border-amber-300/50 bg-amber-100/70 p-4 text-xs text-amber-950 shadow-sm">
            <p className="font-semibold uppercase tracking-[0.1em]">Testing Data Notice</p>
            <p className="mt-2 leading-relaxed">{TESTING_DATA_NOTICE}</p>
            <p className="mt-2 leading-relaxed">
              All paid workflows are pre-launch and may be temporarily disabled while production payment provisioning is finalized.
            </p>
            <p className="mt-2 leading-relaxed">
              Preferred: GitHub for public discussion. Use the contact form below for press or private inquiries.
            </p>
          </div>
        </div>
      </aside>

      <div className="min-w-0">{children}</div>
    </div>
  )
}
