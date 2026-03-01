'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Message } from '@analoglabor/database/types'
import type { RealtimeChannel } from '@supabase/supabase-js'

export interface MessageAttachment {
  name: string
  type: string
  path?: string
  url?: string
}

export interface ModerationPayload {
  decision: 'allow' | 'warn' | 'fail' | 'unscanned'
  reason_codes: string[]
  risk_score: number
  confidence: number
  appeal_url: string | null
  spam_action: 'none' | 'cooldown' | 'suppress' | 'block'
  policy_version: string
}

interface SendMessageResult {
  message: Message
  moderation: ModerationPayload | null
}

interface SendMessageArgs {
  content: string
  attachments?: MessageAttachment[]
}

export class SendMessageError extends Error {
  status: number
  code: string | null
  moderation: ModerationPayload | null

  constructor(message: string, status: number, code: string | null, moderation: ModerationPayload | null) {
    super(message)
    this.name = 'SendMessageError'
    this.status = status
    this.code = code
    this.moderation = moderation
  }
}

export function useRealtimeMessages(conversationId: string) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [lastModeration, setLastModeration] = useState<ModerationPayload | null>(null)

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
      const response = await fetch(`/api/v1/conversations/${conversationId}/messages?limit=20`)
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

  // Load initial messages
  useEffect(() => {
    let cancelled = false

    async function loadMessages() {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch(`/api/v1/conversations/${conversationId}/messages?limit=100`)
        const payload = await response.json()

        if (cancelled) return

        if (!response.ok || !payload?.success) {
          setError(new Error(payload?.error || 'Failed to load messages'))
          return
        }

        setMessages(payload.data || [])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadMessages()

    return () => {
      cancelled = true
    }
  }, [conversationId])

  // Subscribe to realtime updates
  useEffect(() => {
    const supabase = createClient()
    let channel: RealtimeChannel | null = null

    channel = supabase
      .channel(`conversation:${conversationId}`)
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

  const sendMessage = useCallback(async (args: SendMessageArgs): Promise<SendMessageResult> => {
    const content = args.content.trim()
    const response = await fetch(`/api/v1/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content,
        attachments: args.attachments || [],
      }),
    })

    let payload: any = null

    try {
      payload = await response.json()
    } catch {
      throw new SendMessageError('Failed to parse server response', response.status, null, null)
    }

    if (!response.ok || !payload?.success) {
      throw new SendMessageError(
        payload?.error || 'Failed to send message',
        response.status,
        payload?.code || null,
        payload?.moderation || null,
      )
    }

    const createdMessage = payload.data as Message
    const moderation = (payload.moderation || null) as ModerationPayload | null

    setLastModeration(moderation)
    upsertMessage(createdMessage)

    return {
      message: createdMessage,
      moderation,
    }
  }, [conversationId, upsertMessage])

  return {
    messages,
    loading,
    error,
    sendMessage,
    lastModeration,
  }
}
