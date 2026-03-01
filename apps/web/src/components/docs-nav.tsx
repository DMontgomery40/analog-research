'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export function DocsNav({ crossLink }: { crossLink: { href: string; label: string } }) {
  return (
    <nav className="border-b border-border sticky top-0 bg-background/80 backdrop-blur-sm z-50">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back</span>
          </Link>
          <div className="h-4 w-px bg-border" />
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">A</span>
            </div>
            <span className="font-bold text-xl">Analog Research</span>
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <Link href={crossLink.href} className="text-muted-foreground hover:text-foreground transition-colors">
            {crossLink.label}
          </Link>
          <Link
            href="/signup"
            className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
          >
            Get API Key
          </Link>
        </div>
      </div>
    </nav>
  )
}
