'use client'

import { useState } from 'react'
import { Check, Share2 } from 'lucide-react'

interface ShareProfileButtonProps {
  url: string
  title: string
  className?: string
}

export function ShareProfileButton({ url, title, className = '' }: ShareProfileButtonProps) {
  const [copied, setCopied] = useState(false)

  async function handleShare() {
    if (copied) return

    if (navigator.share) {
      try {
        await navigator.share({ title, url })
        return
      } catch (err) {
        const name = err instanceof Error ? err.name : ''
        if (name === 'AbortError') return
      }
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      } else {
        window.prompt('Copy profile link:', url)
      }
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy profile link:', url)
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className={`inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/40 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground ${className}`.trim()}
      aria-live="polite"
    >
      {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Share2 className="h-4 w-4" />}
      {copied ? 'Copied' : 'Share'}
    </button>
  )
}
