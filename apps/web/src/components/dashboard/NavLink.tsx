'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@analogresearch/ui'

export function DashboardNavLink({
  href,
  icon,
  children,
  className,
}: {
  href: string
  icon: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  const pathname = usePathname()

  const isActive = (() => {
    if (!pathname) return false
    if (href === '/dashboard') return pathname === href
    return pathname === href || pathname.startsWith(`${href}/`)
  })()

  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-md transition-colors min-h-[44px]',
        isActive
          ? 'bg-accent text-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent',
        className
      )}
    >
      {icon}
      {children}
    </Link>
  )
}

