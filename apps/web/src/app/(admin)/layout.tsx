import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
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
  CircleDollarSign,
  Store,
} from 'lucide-react'
import { MobileNav } from '@/components/admin/MobileNav'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { configuredAdminEmails } from '@/lib/admin/admin-auth'

async function getAdminUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const email = user.email?.toLowerCase() || ''
  const allowlist = configuredAdminEmails()

  if (allowlist.length === 0 || !allowlist.includes(email)) {
    return null
  }

  return { email, userId: user.id }
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const admin = await getAdminUser()

  if (!admin) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border hidden md:flex flex-col">
        <div className="p-4 border-b border-border">
          <Link href="/admin" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-xl">Admin</span>
          </Link>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <NavLink href="/admin" icon={<LayoutDashboard className="w-5 h-5" />}>
            Dashboard
          </NavLink>
          <NavLink href="/admin/humans" icon={<Users className="w-5 h-5" />}>
            Humans
          </NavLink>
          <NavLink href="/admin/disputes" icon={<AlertTriangle className="w-5 h-5" />}>
            Disputes
          </NavLink>
          <NavLink href="/admin/bounties" icon={<Briefcase className="w-5 h-5" />}>
            Bounties
          </NavLink>
          <NavLink href="/admin/bookings" icon={<CreditCard className="w-5 h-5" />}>
            Bookings
          </NavLink>
          <NavLink href="/admin/transactions" icon={<Receipt className="w-5 h-5" />}>
            Transactions
          </NavLink>

          <div className="pt-4">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-3">
              Platform
            </span>
          </div>
          <NavLink href="/admin/payments/config" icon={<CircleDollarSign className="w-5 h-5" />}>
            Payments Control
          </NavLink>
          <NavLink href="/admin/connect-sample" icon={<Store className="w-5 h-5" />}>
            Connect Sample
          </NavLink>

          <div className="pt-4">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-3">
              Moderation
            </span>
          </div>
          <NavLink href="/admin/moderation" icon={<Shield className="w-5 h-5" />}>
            Events Log
          </NavLink>
          <NavLink href="/admin/moderation/rescan-queue" icon={<RefreshCw className="w-5 h-5" />}>
            Rescan Queue
          </NavLink>
          <NavLink href="/admin/moderation/config" icon={<Settings className="w-5 h-5" />}>
            Configuration
          </NavLink>
        </nav>

        <div className="p-4 border-t border-border space-y-1">
          <NavLink href="/dashboard" icon={<ChevronLeft className="w-5 h-5" />}>
            Back to Dashboard
          </NavLink>
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
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="h-16 border-b border-border flex items-center justify-between px-4 md:px-6">
          {/* Mobile: Hamburger + Logo */}
          <div className="flex items-center gap-2 md:hidden">
            <MobileNav email={admin.email} />
            <Link href="/admin" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Shield className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-bold text-lg">Admin</span>
            </Link>
          </div>

          <div className="flex items-center gap-4 ml-auto">
            <NotificationBell />
            <span className="hidden md:inline text-sm text-muted-foreground">
              Logged in as <span className="font-medium text-foreground">{admin.email}</span>
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

function NavLink({
  href,
  icon,
  children,
}: {
  href: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors min-h-[44px]"
    >
      {icon}
      {children}
    </Link>
  )
}
