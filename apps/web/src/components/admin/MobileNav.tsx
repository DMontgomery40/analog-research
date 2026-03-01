'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  LayoutDashboard,
  Users,
  AlertTriangle,
  Briefcase,
  CreditCard,
  Receipt,
  Shield,
  LogOut,
  Settings,
  ChevronLeft,
  RefreshCw,
  Menu,
  X,
} from 'lucide-react'

interface MobileNavProps {
  email: string
}

export function MobileNav({ email }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false)

  const closeMenu = () => setIsOpen(false)

  return (
    <>
      {/* Hamburger button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="p-2 hover:bg-accent rounded-md transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label="Open menu"
      >
        <Menu className="w-6 h-6" />
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={closeMenu}
          aria-hidden="true"
        />
      )}

      {/* Slide-out drawer */}
      <div
        className={`fixed inset-y-0 left-0 w-72 bg-background border-r border-border z-50 flex flex-col transform transition-transform duration-200 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
          <Link href="/admin" className="flex items-center gap-2" onClick={closeMenu}>
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-xl">Admin</span>
          </Link>
          <button
            type="button"
            onClick={closeMenu}
            className="p-2 hover:bg-accent rounded-md transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation - scrollable */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <MobileNavLink href="/admin" icon={<LayoutDashboard className="w-5 h-5" />} onClick={closeMenu}>
            Dashboard
          </MobileNavLink>
          <MobileNavLink href="/admin/humans" icon={<Users className="w-5 h-5" />} onClick={closeMenu}>
            Humans
          </MobileNavLink>
          <MobileNavLink href="/admin/disputes" icon={<AlertTriangle className="w-5 h-5" />} onClick={closeMenu}>
            Disputes
          </MobileNavLink>
          <MobileNavLink href="/admin/bounties" icon={<Briefcase className="w-5 h-5" />} onClick={closeMenu}>
            Bounties
          </MobileNavLink>
          <MobileNavLink href="/admin/bookings" icon={<CreditCard className="w-5 h-5" />} onClick={closeMenu}>
            Bookings
          </MobileNavLink>
          <MobileNavLink href="/admin/transactions" icon={<Receipt className="w-5 h-5" />} onClick={closeMenu}>
            Transactions
          </MobileNavLink>

          <div className="pt-4">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-3">
              Moderation
            </span>
          </div>
          <MobileNavLink href="/admin/moderation" icon={<Shield className="w-5 h-5" />} onClick={closeMenu}>
            Events Log
          </MobileNavLink>
          <MobileNavLink href="/admin/moderation/rescan-queue" icon={<RefreshCw className="w-5 h-5" />} onClick={closeMenu}>
            Rescan Queue
          </MobileNavLink>
          <MobileNavLink href="/admin/moderation/config" icon={<Settings className="w-5 h-5" />} onClick={closeMenu}>
            Configuration
          </MobileNavLink>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-border space-y-1 shrink-0">
          {/* Logged in as */}
          <div className="px-3 py-2 text-sm text-muted-foreground">
            Logged in as <span className="font-medium text-foreground">{email}</span>
          </div>

          <MobileNavLink href="/dashboard" icon={<ChevronLeft className="w-5 h-5" />} onClick={closeMenu}>
            Back to Dashboard
          </MobileNavLink>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="flex items-center gap-3 px-3 py-2 w-full text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors min-h-[44px]"
            >
              <LogOut className="w-5 h-5" />
              Sign out
            </button>
          </form>
        </div>
      </div>
    </>
  )
}

function MobileNavLink({
  href,
  icon,
  children,
  onClick,
}: {
  href: string
  icon: React.ReactNode
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-3 px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors min-h-[44px]"
    >
      {icon}
      {children}
    </Link>
  )
}
