'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, Check } from 'lucide-react'
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

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationData[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [pollingEnabled, setPollingEnabled] = useState(true)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const disablePolling = useCallback(() => {
    abortRef.current?.abort()
    setPollingEnabled(false)
    setNotifications([])
    setUnreadCount(0)
  }, [])

  const fetchNotifications = useCallback(async () => {
    if (!pollingEnabled) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const response = await fetch('/api/v1/notifications?limit=10', {
        signal: controller.signal,
      })

      // Quietly stop polling if user is logged out or doesn't have a profile yet.
      if (response.status === 401 || response.status === 404) {
        disablePolling()
        return
      }

      const data: NotificationsResponse = await response.json().catch(() => ({ success: false }))
      if (data.success && data.data) {
        setNotifications(data.data.notifications)
        setUnreadCount(data.data.unread_count)
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return
      }
      console.error('Failed to fetch notifications:', error)
    } finally {
      setIsLoading(false)
    }
  }, [disablePolling, pollingEnabled])

  // Initial fetch and polling
  useEffect(() => {
    if (!pollingEnabled) return

    fetchNotifications()
    const interval = setInterval(fetchNotifications, POLL_INTERVAL_MS)

    return () => {
      clearInterval(interval)
      abortRef.current?.abort()
    }
  }, [fetchNotifications, pollingEnabled])

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
    try {
      const response = await fetch('/api/v1/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification_ids: [notificationId] }),
      })

      if (response.status === 401 || response.status === 404) {
        disablePolling()
        return
      }

      if (response.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
        )
        setUnreadCount((prev) => Math.max(0, prev - 1))
      }
    } catch (error) {
      console.error('Failed to mark notification as read:', error)
    }
  }

  const handleMarkAllRead = async () => {
    try {
      const response = await fetch('/api/v1/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mark_all_read: true }),
      })

      if (response.status === 401 || response.status === 404) {
        disablePolling()
        return
      }

      if (response.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
        setUnreadCount(0)
      }
    } catch (error) {
      console.error('Failed to mark all as read:', error)
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
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
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
