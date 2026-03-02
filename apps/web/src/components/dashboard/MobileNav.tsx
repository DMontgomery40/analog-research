'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Menu,
  X,
  Home,
  User,
  Briefcase,
  MessageSquare,
  Settings,
  LogOut,
  Search,
  Inbox,
  Users,
  Camera,
  PlusCircle,
} from 'lucide-react'
import { BrandMark } from '@/components/brand-mark'
import { DashboardNavLink } from '@/components/dashboard/NavLink'

export function DashboardMobileNav({
  displayName,
}: {
  displayName: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const closeMenu = () => setIsOpen(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="p-2 hover:bg-accent rounded-md transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label="Open menu"
      >
        <Menu className="w-6 h-6" />
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={closeMenu}
          aria-hidden="true"
        />
      )}

      <div
        className={`fixed inset-y-0 left-0 w-72 bg-background border-r border-border z-50 flex flex-col transform transition-transform duration-200 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
          <Link href="/dashboard" className="flex items-center gap-2" onClick={closeMenu}>
            <BrandMark className="h-8 w-8" />
            <span className="font-bold text-xl">Analog Research</span>
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

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <DashboardNavLink href="/dashboard" icon={<Home className="w-5 h-5" />} className="w-full">
            Dashboard
          </DashboardNavLink>
          <DashboardNavLink href="/browse" icon={<Users className="w-5 h-5" />} className="w-full">
            Browse Humans
          </DashboardNavLink>
          <DashboardNavLink href="/dashboard/browse" icon={<Search className="w-5 h-5" />} className="w-full">
            Browse Bounties
          </DashboardNavLink>
          <DashboardNavLink href="/dashboard/bounties/new" icon={<PlusCircle className="w-5 h-5" />} className="w-full">
            Create Bounty
          </DashboardNavLink>
          <DashboardNavLink href="/dashboard/bookings" icon={<Briefcase className="w-5 h-5" />} className="w-full">
            My Bookings
          </DashboardNavLink>
          <DashboardNavLink href="/dashboard/field-checks" icon={<Camera className="w-5 h-5" />} className="w-full">
            Field Checks
          </DashboardNavLink>
          <DashboardNavLink href="/dashboard/conversations" icon={<MessageSquare className="w-5 h-5" />} className="w-full">
            Messages
          </DashboardNavLink>
          <DashboardNavLink href="/dashboard/researchagent-messages" icon={<Inbox className="w-5 h-5" />} className="w-full">
            ResearchAgent Messages
          </DashboardNavLink>
          <DashboardNavLink href="/dashboard/profile" icon={<User className="w-5 h-5" />} className="w-full">
            Profile
          </DashboardNavLink>
          <DashboardNavLink href="/dashboard/settings" icon={<Settings className="w-5 h-5" />} className="w-full">
            Settings
          </DashboardNavLink>
        </nav>

        <div className="p-4 border-t border-border space-y-1 shrink-0">
          <div className="px-3 py-2 text-sm text-muted-foreground">
            Logged in as <span className="font-medium text-foreground">{displayName}</span>
          </div>
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
