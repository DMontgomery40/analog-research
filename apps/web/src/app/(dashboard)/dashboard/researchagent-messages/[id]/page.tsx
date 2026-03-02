'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Send, Loader2, AlertTriangle, ShieldAlert, Paperclip, X } from 'lucide-react'
import type { Message } from '@analogresearch/database/types'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface Conversation {
  id: string
  humans: { id: string; name: string; avatar_url: string | null } | null
}

interface ModerationPayload {
  decision: 'allow' | 'warn' | 'fail' | 'unscanned'
  reason_codes: string[]
  risk_score: number
  confidence: number
  appeal_url: string | null
  spam_action: 'none' | 'cooldown' | 'suppress' | 'block'
  policy_version: string
}

export default function ResearchAgentChatPage() {
  const params = useParams()
  const conversationId = params.id as string

  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newMessage, setNewMessage] = useState('')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sendAppealUrl, setSendAppealUrl] = useState<string | null>(null)
  const [lastModeration, setLastModeration] = useState<ModerationPayload | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const upsertMessage = useCallback((message: Message) => {
    setMessages((prev) => {
      const existingIndex = prev.findIndex((entry) => entry.id === message.id)
      if (existingIndex === -1) {
        return [...prev, message]
      }

      const next = [...prev]
      next[existingIndex] = message
      return next
    })
  }, [])

  const hydrateRealtimeMessage = useCallback(async (messageId: string) => {
    try {
      const response = await fetch(`/api/v1/conversations/${conversationId}/messages?as=agent&limit=20`)
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success || !Array.isArray(payload.data)) {
        return
      }

      const resolved = payload.data.find((entry: { id?: string }) => entry?.id === messageId)
      if (resolved) {
        upsertMessage(resolved as Message)
      }
    } catch {
      // Best-effort hydration for attachment signed URLs.
    }
  }, [conversationId, upsertMessage])

  const loadConversation = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUserId(user?.id || null)

      const response = await fetch(`/api/v1/conversations/${conversationId}?as=agent`)
      const result = await response.json()

      if (!result.success) {
        setError(result.error || 'Failed to load conversation')
        setLoading(false)
        return
      }

      setConversation(result.data)
      setMessages(result.data.messages || [])
      setLoading(false)
    } catch {
      setError('Failed to load conversation')
      setLoading(false)
    }
  }, [conversationId])

  useEffect(() => {
    loadConversation()
  }, [loadConversation])

  useEffect(() => {
    const supabase = createClient()
    let channel: RealtimeChannel | null = null

    channel = supabase
      .channel(`researchagent-conversation:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMessage = payload.new as Message
          upsertMessage(newMessage)
          void hydrateRealtimeMessage(newMessage.id)
        }
      )
      .subscribe()

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [conversationId, hydrateRealtimeMessage, upsertMessage])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSendMessage = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()

    if ((!newMessage.trim() && selectedFiles.length === 0) || sending) return

    setSending(true)
    setSendError(null)
    setSendAppealUrl(null)

    try {
      const attachments: Array<{ name: string; type: string; path: string }> = []

      if (selectedFiles.length > 0) {
        const supabase = createClient()
        const uploaderId = currentUserId || 'anon'

        for (const file of selectedFiles) {
          const fileExt = file.name.split('.').pop()
          const suffix = Math.random().toString(36).slice(2)
          const fileName = `conversations/${conversationId}/${uploaderId}-${Date.now()}-${suffix}.${fileExt}`

          const { error: uploadError } = await supabase.storage
            .from('proof-attachments')
            .upload(fileName, file)

          if (uploadError) {
            throw new Error(`Failed to upload ${file.name}: ${uploadError.message}`)
          }

          attachments.push({
            name: file.name,
            type: file.type || 'application/octet-stream',
            path: fileName,
          })
        }
      }

      const response = await fetch(`/api/v1/conversations/${conversationId}/messages?as=agent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: newMessage.trim(),
          attachments,
        }),
      })

      const payload = await response.json().catch(() => null)

      if (!response.ok || !payload?.success) {
        setSendError(payload?.error || 'Failed to send message')
        setSendAppealUrl(payload?.moderation?.appeal_url || null)
        return
      }

      const createdMessage = payload.data as Message
      const moderation = (payload.moderation || null) as ModerationPayload | null

      setLastModeration(moderation)
      upsertMessage(createdMessage)
      setNewMessage('')
      setSelectedFiles([])
    } catch {
      setSendError('Failed to send message')
    } finally {
      setSending(false)
    }
  }, [conversationId, newMessage, selectedFiles, sending, currentUserId, upsertMessage])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-destructive/10 text-destructive rounded-lg p-4">
          {error}
        </div>
        <Link
          href="/dashboard/researchagent-messages"
          className="inline-flex items-center gap-2 mt-4 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to ResearchAgent inbox
        </Link>
      </div>
    )
  }

  if (!conversation) {
    return null
  }

  const humanName = conversation.humans?.name || 'Human'

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center gap-4 p-4 border-b border-border bg-card">
        <Link
          href="/dashboard/researchagent-messages"
          className="p-2 hover:bg-muted rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>

        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
          {conversation.humans?.avatar_url ? (
            <img
              src={conversation.humans.avatar_url}
              alt={humanName}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <span className="text-lg font-bold text-primary">
              {humanName[0]}
            </span>
          )}
        </div>

        <div>
          <h1 className="font-semibold">{humanName}</h1>
          <p className="text-sm text-muted-foreground">Human</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            No messages yet. Start the conversation!
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => {
              const typedMessage = message as Message & {
                moderation_decision?: 'allow' | 'warn' | 'fail' | 'unscanned'
                attachments?: Array<{ name: string; type: string; path?: string; url?: string }>
              }
              const isResearchAgent = message.sender_type === 'agent'
              const moderationDecision = typedMessage.moderation_decision
              const showWarnChip = moderationDecision === 'warn'
              const showUnscannedChip = moderationDecision === 'unscanned'
              const attachments = typedMessage.attachments || []

              return (
                <div
                  key={message.id}
                  className={`rounded-xl border p-4 ${
                    isResearchAgent ? 'border-primary/30 bg-primary/10' : 'border-border bg-card'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                    <span>{isResearchAgent ? 'You (ResearchAgent)' : humanName}</span>
                    <span>
                      {new Date(message.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>
                  {attachments.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {attachments.map((attachment) => {
                        const isImage = attachment.type.startsWith('image/')
                        return (
                          <div key={`${message.id}-${attachment.name}-${attachment.path || attachment.url}`} className="text-sm">
                            {isImage && attachment.url ? (
                              <a href={attachment.url} target="_blank" rel="noreferrer" className="inline-block">
                                <img
                                  src={attachment.url}
                                  alt={attachment.name}
                                  className="max-h-48 rounded-lg border border-border"
                                />
                              </a>
                            ) : attachment.url ? (
                              <a
                                href={attachment.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 underline"
                              >
                                <Paperclip className="h-3.5 w-3.5" />
                                {attachment.name}
                              </a>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 opacity-80">
                                <Paperclip className="h-3.5 w-3.5" />
                                {attachment.name}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {(showWarnChip || showUnscannedChip) && (
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      {showWarnChip && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 font-medium text-amber-800">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Potential Risk
                        </span>
                      )}
                      {showUnscannedChip && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 font-medium text-blue-800">
                          <ShieldAlert className="h-3.5 w-3.5" />
                          Unscanned
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSendMessage}
        className="p-4 border-t border-border bg-card"
      >
        {(sendError || lastModeration?.decision === 'warn' || lastModeration?.decision === 'unscanned') && (
          <div className="mb-3 space-y-2">
            {sendError && (
              <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                <p>{sendError}</p>
                {sendAppealUrl && (
                  <a href={sendAppealUrl} className="mt-1 inline-block font-medium underline" target="_blank" rel="noreferrer">
                    Appeal this decision
                  </a>
                )}
              </div>
            )}
            {lastModeration?.decision === 'warn' && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                Message delivered with warning: Potential Risk.
              </div>
            )}
            {lastModeration?.decision === 'unscanned' && (
              <div className="rounded-md border border-blue-300 bg-blue-50 p-2 text-xs text-blue-800">
                Message delivered in fail-open mode and queued for rescan.
              </div>
            )}
          </div>
        )}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              id="researchagent-conversation-attachments"
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files || [])
                if (files.length > 0) {
                  setSelectedFiles((prev) => [...prev, ...files])
                }
                event.currentTarget.value = ''
              }}
              disabled={sending}
            />
            <label
              htmlFor="researchagent-conversation-attachments"
              className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-border p-2 hover:bg-muted"
            >
              <Paperclip className="h-5 w-5" />
            </label>
          </div>
          <textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type your message..."
            rows={3}
            className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {selectedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs">
              {selectedFiles.map((file, index) => (
                <span key={`${file.name}-${index}`} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
                  <Paperclip className="h-3 w-3" />
                  {file.name}
                  <button
                    type="button"
                    onClick={() => setSelectedFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== index))}
                    className="opacity-70 hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={sending || (!newMessage.trim() && selectedFiles.length === 0)}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
