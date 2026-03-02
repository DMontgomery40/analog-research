'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Send, Loader2, AlertTriangle, ShieldAlert, Paperclip, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { SendMessageError, useRealtimeMessages } from '@/hooks/use-realtime-messages'
import type { Message } from '@analogresearch/database/types'
import { logger } from '@/lib/logger'

interface Conversation {
  id: string
  agent_id: string
  human_id: string
  agents: { id: string; name: string } | null
  humans: { id: string; name: string; avatar_url: string | null } | null
}

const chatLog = logger.withContext('app/(dashboard)/dashboard/conversations/[id]/page.tsx', 'ChatPage')

export default function ChatPage() {
  const params = useParams()
  const router = useRouter()
  const conversationId = params.id as string

  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newMessage, setNewMessage] = useState('')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sendAppealUrl, setSendAppealUrl] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Use the realtime messages hook
  const { messages, loading: messagesLoading, sendMessage, lastModeration } = useRealtimeMessages(conversationId)

  // Load conversation details and human profile
  useEffect(() => {
    async function loadData() {
      try {
        const supabase = createClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push('/login')
          return
        }
        setCurrentUserId(user.id)

        const { data: human, error: humanError } = await supabase
          .from('humans')
          .select('id')
          .eq('user_id', user.id)
          .single()

        if (humanError && humanError.code !== 'PGRST116') {
          chatLog.error(
            'Failed to fetch human profile for conversation',
            { conversationId },
            { message: humanError.message, code: humanError.code }
          )
        }

        if (!human) {
          setError('Human profile not found')
          return
        }

        const response = await fetch(`/api/v1/conversations/${conversationId}`)
        const result = await response.json().catch(() => null)

        if (!response.ok) {
          const message = typeof result?.error === 'string'
            ? result.error
            : 'Failed to load conversation'
          throw new Error(message)
        }

        if (!result?.success || !result.data) {
          setError(result?.error || 'Failed to load conversation')
          return
        }

        setConversation(result.data)
      } catch (loadError) {
        chatLog.error(
          'Failed to load conversation detail page',
          { conversationId },
          loadError instanceof Error ? { message: loadError.message } : { message: String(loadError) }
        )
        setError(loadError instanceof Error ? loadError.message : 'Failed to load conversation')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [conversationId, router])

  // Scroll to bottom when messages change
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

      await sendMessage({
        content: newMessage,
        attachments,
      })
      setNewMessage('')
      setSelectedFiles([])
    } catch (err) {
      if (err instanceof SendMessageError) {
        setSendError(err.message)
        setSendAppealUrl(err.moderation?.appeal_url || null)
      } else if (err instanceof Error) {
        setSendError(err.message)
      } else {
        setSendError('Failed to send message')
      }
    } finally {
      setSending(false)
    }
  }, [newMessage, selectedFiles, sending, sendMessage, currentUserId, conversationId])

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
          href="/dashboard/conversations"
          className="inline-flex items-center gap-2 mt-4 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to conversations
        </Link>
      </div>
    )
  }

  if (!conversation) {
    return null
  }

  const agentName = conversation.agents?.name || 'AI Agent'

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center gap-4 p-4 border-b border-border bg-card">
        <Link
          href="/dashboard/conversations"
          className="p-2 hover:bg-muted rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>

        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="text-lg font-bold text-primary">
            {agentName[0]}
          </span>
        </div>

        <div>
          <h1 className="font-semibold">{agentName}</h1>
          <p className="text-sm text-muted-foreground">AI Agent</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messagesLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            No messages yet. Start the conversation!
          </div>
        ) : (
          messages.map((message) => {
            const typedMessage = message as Message & {
              moderation_decision?: 'allow' | 'warn' | 'fail' | 'unscanned'
              attachments?: Array<{ name: string; type: string; path?: string; url?: string }>
            }
            const isHuman = message.sender_type === 'human'
            const moderationDecision = typedMessage.moderation_decision
            const showWarnChip = moderationDecision === 'warn'
            const showUnscannedChip = moderationDecision === 'unscanned'
            const attachments = typedMessage.attachments || []

            return (
              <div
                key={message.id}
                className={`flex ${isHuman ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                    isHuman
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground'
                  }`}
                >
                  {(showWarnChip || showUnscannedChip) && (
                    <div className="mb-2">
                      {showWarnChip && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Potential Risk
                        </span>
                      )}
                      {showUnscannedChip && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800">
                          <ShieldAlert className="h-3.5 w-3.5" />
                          Unscanned
                        </span>
                      )}
                    </div>
                  )}
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
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
                  <p
                    className={`text-xs mt-1 ${
                      isHuman ? 'text-primary-foreground/70' : 'text-muted-foreground'
                    }`}
                  >
                    {new Date(message.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            )
          })
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
        <div className="flex items-center gap-2">
          <input
            id="conversation-attachments"
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
            htmlFor="conversation-attachments"
            className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-border p-2 hover:bg-muted"
          >
            <Paperclip className="h-5 w-5" />
          </label>
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-muted border border-border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={(!newMessage.trim() && selectedFiles.length === 0) || sending}
            className="bg-primary text-primary-foreground p-2 rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {sending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
        {selectedFiles.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
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
      </form>
    </div>
  )
}
