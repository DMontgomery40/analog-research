import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Home, User, Briefcase, MessageSquare, Settings, LogOut, Search, Inbox, Users, Camera } from 'lucide-react'
import { BrandMark } from '@/components/brand-mark'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { Toaster } from '@analoglabor/ui'
import { DashboardNavLink } from '@/components/dashboard/NavLink'
import { DashboardMobileNav } from '@/components/dashboard/MobileNav'

async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

interface HumanProfile {
  id: string
  name: string
  avatar_url: string | null
}

async function getHumanProfile(userId: string): Promise<HumanProfile | null> {
  const supabase = await createClient()
  // Use maybeSingle() since there should be exactly one human per user_id
  const { data, error } = await supabase
    .from('humans')
    .select('id, name, avatar_url')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('[dashboard/layout] Failed to fetch human profile:', error.message, error.code)
    return null
  }
  return data as HumanProfile | null
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getUser()

  if (!user) {
    redirect('/login')
  }

  const human = await getHumanProfile(user.id)

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border hidden md:flex flex-col">
        <div className="p-4 border-b border-border">
          <Link href="/" className="flex items-center gap-2">
            <BrandMark className="h-8 w-8" />
            <span className="font-bold text-xl">Analog Research</span>
          </Link>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <DashboardNavLink href="/dashboard" icon={<Home className="w-5 h-5" />}>
            Dashboard
          </DashboardNavLink>
          <DashboardNavLink href="/browse" icon={<Users className="w-5 h-5" />}>
            Browse Humans
          </DashboardNavLink>
          <DashboardNavLink href="/dashboard/browse" icon={<Search className="w-5 h-5" />}>
            Browse Bounties
          </DashboardNavLink>
          <DashboardNavLink href="/dashboard/bookings" icon={<Briefcase className="w-5 h-5" />}>
            My Bookings
          </DashboardNavLink>
          <DashboardNavLink href="/dashboard/field-checks" icon={<Camera className="w-5 h-5" />}>
            Field Checks
          </DashboardNavLink>
          <DashboardNavLink href="/dashboard/conversations" icon={<MessageSquare className="w-5 h-5" />}>
            Messages
          </DashboardNavLink>
          <DashboardNavLink href="/dashboard/molty-messages" icon={<Inbox className="w-5 h-5" />}>
            ResearchAgent Messages
          </DashboardNavLink>
          <DashboardNavLink href="/dashboard/profile" icon={<User className="w-5 h-5" />}>
            Profile
          </DashboardNavLink>
          <DashboardNavLink href="/dashboard/settings" icon={<Settings className="w-5 h-5" />}>
            Settings
          </DashboardNavLink>
        </nav>

        <div className="p-4 border-t border-border">
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="flex items-center gap-3 px-3 py-2 w-full text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
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
        <header className="h-16 border-b border-border flex items-center justify-between px-6">
          <div className="md:hidden flex items-center gap-2">
            <DashboardMobileNav displayName={human?.name || user.email || ''} />
            <Link href="/" className="flex items-center gap-2">
              <BrandMark className="h-8 w-8" />
            </Link>
          </div>

          <div className="flex items-center gap-4 ml-auto">
            <NotificationBell />
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                {human?.avatar_url ? (
                  <img
                    src={human.avatar_url}
                    alt={human.name}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <span className="text-sm font-medium text-primary">
                    {human?.name?.[0] || user.email?.[0]?.toUpperCase()}
                  </span>
                )}
              </div>
              <span className="text-sm font-medium hidden sm:block">
                {human?.name || user.email}
              </span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
      <Toaster />
    </div>
  )
}
