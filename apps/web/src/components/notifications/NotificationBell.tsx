'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, Check } from 'lucide-react'
import { normalizeError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { NotificationItem, type NotificationData } from './NotificationItem'

interface NotificationsResponse {
  success: boolean
  data?: {
    notifications: NotificationData[]
    total: number
    unread_count: number
  }
  error?: string
}

const POLL_INTERVAL_MS = 30000 // 30 seconds
const notificationBellLog = logger.withContext(
  'components/notifications/NotificationBell.tsx',
  'NotificationBell'
)

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationData[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [pendingReadIds, setPendingReadIds] = useState<Set<string>>(new Set())
  const [markAllPending, setMarkAllPending] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const pendingReadIdsRef = useRef<Set<string>>(new Set())
  const markAllPendingRef = useRef(false)

  const clearNotifications = useCallback(() => {
    abortRef.current?.abort()
    setNotifications([])
    setUnreadCount(0)
  }, [])

  const beginMarkRead = useCallback((notificationId: string) => {
    if (markAllPendingRef.current || pendingReadIdsRef.current.has(notificationId)) {
      return false
    }

    const next = new Set(pendingReadIdsRef.current)
    next.add(notificationId)
    pendingReadIdsRef.current = next
    setPendingReadIds(next)
    return true
  }, [])

  const finishMarkRead = useCallback((notificationId: string) => {
    if (!pendingReadIdsRef.current.has(notificationId)) {
      return
    }

    const next = new Set(pendingReadIdsRef.current)
    next.delete(notificationId)
    pendingReadIdsRef.current = next
    setPendingReadIds(next)
  }, [])

  const beginMarkAll = useCallback(() => {
    if (markAllPendingRef.current || pendingReadIdsRef.current.size > 0) {
      return false
    }

    markAllPendingRef.current = true
    setMarkAllPending(true)
    return true
  }, [])

  const finishMarkAll = useCallback(() => {
    markAllPendingRef.current = false
    setMarkAllPending(false)
  }, [])

  const markNotificationReadLocally = useCallback((notificationId: string) => {
    setNotifications((prev) => prev.map((notification) => {
      if (notification.id !== notificationId || notification.is_read) {
        return notification
      }

      setUnreadCount((prevCount) => Math.max(0, prevCount - 1))
      return { ...notification, is_read: true }
    }))
  }, [])

  const fetchNotifications = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const response = await fetch('/api/v1/notifications?limit=10', {
        signal: controller.signal,
      })

      // Quietly stop polling if user is logged out or doesn't have a profile yet.
      if (response.status === 401 || response.status === 404) {
        clearNotifications()
        return
      }

      const data: NotificationsResponse | null = await response.json().catch(() => null)
      if (!response.ok) {
        notificationBellLog.error(
          'Notification fetch failed',
          {
            endpoint: '/api/v1/notifications',
            status: response.status,
          },
          normalizeError(
            new Error(data?.error || 'Failed to load notifications'),
            {
              operatorHint:
                'NotificationBell fetchNotifications -> /api/v1/notifications GET did not return the expected success payload',
            }
          )
        )
        return
      }

      if (data?.success && data.data) {
        setNotifications(data.data.notifications)
        setUnreadCount(data.data.unread_count)
        return
      }

      notificationBellLog.warn('Notification fetch returned an unexpected payload', {
        endpoint: '/api/v1/notifications',
        operatorHint:
          'NotificationBell fetchNotifications expects success plus data.notifications and data.unread_count',
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return
      }
      notificationBellLog.error(
        'Notification fetch threw unexpectedly',
        {
          endpoint: '/api/v1/notifications',
        },
        normalizeError(error, {
          operatorHint:
            'NotificationBell fetchNotifications -> /api/v1/notifications GET failed before payload parsing completed',
        })
      )
    } finally {
      setIsLoading(false)
    }
  }, [clearNotifications])

  // Initial fetch and polling
  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, POLL_INTERVAL_MS)

    return () => {
      clearInterval(interval)
      abortRef.current?.abort()
    }
  }, [fetchNotifications])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleMarkRead = async (notificationId: string) => {
    if (!beginMarkRead(notificationId)) {
      return
    }

    try {
      const response = await fetch('/api/v1/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification_ids: [notificationId] }),
      })

      if (response.status === 401 || response.status === 404) {
        clearNotifications()
        return
      }

      if (response.ok) {
        markNotificationReadLocally(notificationId)
        return
      }

      const payload: NotificationsResponse | null = await response.json().catch(() => null)
      notificationBellLog.error(
        'Notification mark-read request failed',
        {
          endpoint: '/api/v1/notifications',
          notificationId,
          status: response.status,
        },
        normalizeError(new Error(payload?.error || 'Failed to update notification'), {
          operatorHint:
            'NotificationBell handleMarkRead -> /api/v1/notifications PATCH notification_ids payload failed',
        })
      )
    } catch (error) {
      notificationBellLog.error(
        'Notification mark-read threw unexpectedly',
        {
          endpoint: '/api/v1/notifications',
          notificationId,
        },
        normalizeError(error, {
          operatorHint:
            'NotificationBell handleMarkRead -> /api/v1/notifications PATCH failed before the read mutation completed',
        })
      )
    } finally {
      finishMarkRead(notificationId)
    }
  }

  const handleMarkAllRead = async () => {
    if (!beginMarkAll()) {
      return
    }

    try {
      const response = await fetch('/api/v1/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mark_all_read: true }),
      })

      if (response.status === 401 || response.status === 404) {
        clearNotifications()
        return
      }

      if (response.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
        setUnreadCount(0)
        return
      }

      const payload: NotificationsResponse | null = await response.json().catch(() => null)
      notificationBellLog.error(
        'Notification mark-all-read request failed',
        {
          endpoint: '/api/v1/notifications',
          status: response.status,
        },
        normalizeError(new Error(payload?.error || 'Failed to update notifications'), {
          operatorHint:
            'NotificationBell handleMarkAllRead -> /api/v1/notifications PATCH mark_all_read payload failed',
        })
      )
    } catch (error) {
      notificationBellLog.error(
        'Notification mark-all-read threw unexpectedly',
        {
          endpoint: '/api/v1/notifications',
        },
        normalizeError(error, {
          operatorHint:
            'NotificationBell handleMarkAllRead -> /api/v1/notifications PATCH failed before the bulk read mutation completed',
        })
      )
    } finally {
      finishMarkAll()
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 hover:bg-accent rounded-md transition-colors relative"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-primary text-primary-foreground text-xs font-medium rounded-full flex items-center justify-center px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-background border border-border rounded-lg shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="font-semibold">Notifications</h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={markAllPending || pendingReadIds.size > 0}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check className="w-3 h-3" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Loading...
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkRead={handleMarkRead}
                    disabled={markAllPending || pendingReadIds.has(notification.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
