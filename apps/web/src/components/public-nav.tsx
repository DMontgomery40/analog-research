'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { BrandMark } from '@/components/brand-mark'
import { PrelaunchBanner } from '@/components/prelaunch-banner'
import { BRAND_NAME } from '@/lib/brand'

type AuthUser = { id: string; email?: string } | null
const GITHUB_REPO_URL = 'https://github.com/DMontgomery40/analog-research'

function GitHubNavLink({ className, onClick }: { className: string; onClick?: () => void }) {
  return (
    <a
      href={GITHUB_REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className={className}
    >
      GitHub
    </a>
  )
}

/**
 * Public navigation bar with auth-aware Login/Dashboard toggle.
 *
 * @remarks
 * Uses `/api/auth/me` instead of creating a browser Supabase client to avoid
 * triggering infinite token refresh loops when stale auth cookies exist.
 */
export function PublicNav() {
  const pathname = usePathname()
  const [user, setUser] = useState<AuthUser>(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    let isMounted = true

    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (isMounted) setUser(data.user)
      })
      .catch(() => {
        // Fail silently - show logged out state
      })

    return () => { isMounted = false }
  }, [])

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  const approachHref = pathname === '/' ? '#product-snapshot' : '/#product-snapshot'

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95">
      <PrelaunchBanner compact={pathname !== '/'} />

      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-border text-foreground transition-colors hover:bg-accent md:hidden"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <Link href="/" className="flex items-center gap-2">
            <BrandMark className="h-8 w-8" />
            <span className="text-lg font-semibold tracking-tight">{BRAND_NAME}</span>
          </Link>
        </div>

        <div className="hidden items-center gap-5 text-sm md:flex">
          <Link href={approachHref} className="text-muted-foreground transition-colors hover:text-foreground">
            Snapshot
          </Link>
          <Link href="/browse" className="text-muted-foreground transition-colors hover:text-foreground">
            Humans
          </Link>
          <Link href="/bounties" className="text-muted-foreground transition-colors hover:text-foreground">
            Bounties
          </Link>
          <Link href="/mcp" className="text-muted-foreground transition-colors hover:text-foreground">
            ResearchAgent API
          </Link>
          <GitHubNavLink className="text-muted-foreground transition-colors hover:text-foreground" />
        </div>

        <div className="hidden items-center gap-3 md:flex">
          {user ? (
            <>
              <Link href="/dashboard" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                Dashboard
              </Link>
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                Login
              </Link>
              <Link
                href="/signup"
                className="rounded-sm border border-primary bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Early Access
              </Link>
            </>
          )}
        </div>

      </nav>

      {mobileOpen && (
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-[60] bg-black/65 md:hidden"
          aria-label="Close navigation menu"
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-[70] h-full w-[min(88vw,18.5rem)] overflow-y-auto border-r border-border bg-white p-5 shadow-2xl transition-transform duration-200 md:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
        }`}
        aria-hidden={!mobileOpen}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BrandMark className="h-8 w-8" />
            <span className="text-base font-semibold tracking-tight">{BRAND_NAME}</span>
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-border text-foreground transition-colors hover:bg-accent"
            aria-label="Close navigation menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 space-y-1">
          <Link href={approachHref} onClick={() => setMobileOpen(false)} className="block rounded-sm px-3 py-2 text-sm font-medium text-foreground hover:bg-accent">
            Snapshot
          </Link>
          <Link href="/browse" onClick={() => setMobileOpen(false)} className="block rounded-sm px-3 py-2 text-sm font-medium text-foreground hover:bg-accent">
            Humans
          </Link>
          <Link href="/bounties" onClick={() => setMobileOpen(false)} className="block rounded-sm px-3 py-2 text-sm font-medium text-foreground hover:bg-accent">
            Bounties
          </Link>
          <Link href="/mcp" onClick={() => setMobileOpen(false)} className="block rounded-sm px-3 py-2 text-sm font-medium text-foreground hover:bg-accent">
            ResearchAgent API
          </Link>
          <GitHubNavLink
            onClick={() => setMobileOpen(false)}
            className="block rounded-sm px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
          />
        </div>

        <div className="mt-5 border-t border-border pt-5">
          {user ? (
            <div className="space-y-1">
              <Link href="/dashboard" onClick={() => setMobileOpen(false)} className="block rounded-sm px-3 py-2 text-sm font-medium text-foreground hover:bg-accent">
                Dashboard
              </Link>
              <form action="/auth/signout" method="post">
                <button type="submit" className="block w-full rounded-sm px-3 py-2 text-left text-sm font-medium text-foreground hover:bg-accent">
                  Sign out
                </button>
              </form>
            </div>
          ) : (
            <div className="space-y-2">
              <Link href="/login" onClick={() => setMobileOpen(false)} className="block rounded-sm border border-border px-3 py-2 text-center text-sm font-medium text-foreground hover:bg-accent">
                Login
              </Link>
              <Link
                href="/signup"
                onClick={() => setMobileOpen(false)}
                className="block rounded-sm border border-primary bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Early Access
              </Link>
            </div>
          )}
        </div>
      </aside>
    </header>
  )
}
