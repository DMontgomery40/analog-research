'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Mail, Loader2 } from 'lucide-react'

interface ContactHumanProps {
  humanId: string
  humanName: string
  viewerUserId: string | null
  viewerHumanId: string | null
}

export function ContactHuman({
  humanId,
  humanName,
  viewerUserId,
  viewerHumanId,
}: ContactHumanProps) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isLoggedIn = Boolean(viewerUserId)
  const isSelf = viewerHumanId === humanId
  const redirect = `/humans/${humanId}`
  const signupHref = `/signup?redirect=${encodeURIComponent(redirect)}`
  const loginHref = `/login?redirect=${encodeURIComponent(redirect)}`

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim() || sending) return

    setSending(true)
    setError(null)

    try {
      const response = await fetch('/api/v1/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ human_id: humanId, content: message.trim() }),
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok || !payload?.success) {
        setError(payload?.error || 'Failed to send message')
        return
      }

      const conversationId = payload?.data?.conversation?.id
      if (conversationId) {
        router.push(`/dashboard/researchagent-messages/${conversationId}`)
        return
      }

      setError('Message sent, but conversation could not be opened.')
    } catch {
      setError('Failed to send message')
    } finally {
      setSending(false)
    }
  }

  if (!isLoggedIn) {
    return (
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-muted/30 via-background/60 to-transparent p-5 shadow-[0_20px_50px_-40px_rgba(0,0,0,0.9)]">
        <p className="text-sm font-medium text-foreground">Contact {humanName}</p>
        <p className="mt-1 text-xs text-muted-foreground">Create a ResearchAgent to start the conversation.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            href={signupHref}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_12px_30px_-16px_rgba(249,115,22,0.9)] transition-colors hover:bg-primary/90"
          >
            <Mail className="w-4 h-4" />
            Sign up to contact
          </Link>
          <Link
            href={loginHref}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Log in instead
          </Link>
        </div>
      </div>
    )
  }

  if (isSelf) {
    return (
      <div className="rounded-2xl border border-border/60 bg-muted/30 px-4 py-4 text-sm text-muted-foreground">
        This is your profile. Use your dashboard to manage messages and bookings.
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-background/90 via-background/70 to-muted/40 p-5 shadow-[0_20px_50px_-40px_rgba(0,0,0,0.9)]">
      <form onSubmit={handleSend} className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Contact {humanName}</p>
          <p className="text-xs text-muted-foreground">Your ResearchAgent will start the conversation.</p>
        </div>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Message
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          placeholder="Introduce yourself and describe the task..."
          className="w-full rounded-xl border border-border/70 bg-background/70 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/60"
        />
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={sending || !message.trim()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_12px_30px_-16px_rgba(249,115,22,0.9)] transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          {sending ? 'Sending...' : 'Send message'}
        </button>
      </form>
      <p className="mt-3 text-xs text-muted-foreground">
        Replies appear in your ResearchAgent inbox.
      </p>
    </div>
  )
}
