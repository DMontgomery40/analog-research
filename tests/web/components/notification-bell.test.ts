// @vitest-environment jsdom

import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { NotificationBell } from '@/components/notifications/NotificationBell'

vi.mock('@/lib/logger', () => ({
  logger: {
    withContext: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}))

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

describe('NotificationBell', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('keeps polling after a 404 and recovers when notifications become available', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ success: false, error: 'Human profile not found' }, { status: 404 }))
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        data: {
          notifications: [
            {
              id: 'notif_1',
              type: 'new_message',
              title: 'Recovered notification',
              body: 'A new message arrived',
              data: {},
              is_read: false,
              created_at: '2026-03-12T00:00:00.000Z',
            },
          ],
          total: 1,
          unread_count: 2,
        },
      }))

    vi.stubGlobal('fetch', fetchMock)
    const intervalCallbacks: Array<() => Promise<void> | void> = []
    vi.spyOn(globalThis, 'setInterval').mockImplementation(((callback: TimerHandler) => {
      if (typeof callback === 'function') {
        intervalCallbacks.push(callback as () => Promise<void> | void)
      }

      return intervalCallbacks.length as unknown as ReturnType<typeof setInterval>
    }) as typeof setInterval)
    vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => {})

    render(React.createElement(NotificationBell))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy()
    expect(intervalCallbacks.length).toBeGreaterThan(0)

    await act(async () => {
      for (const callback of intervalCallbacks) {
        await callback()
      }
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Notifications (2 unread)' })).toBeTruthy()
    })
  })

  it('ignores duplicate mark-read clicks while a notification update is in flight', async () => {
    const patchRequest = deferred<Response>()
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/v1/notifications?limit=10')) {
        return Promise.resolve(jsonResponse({
          success: true,
          data: {
            notifications: [
              {
                id: 'notif_1',
                type: 'new_message',
                title: 'Unread notification',
                body: 'Click me once',
                data: {},
                is_read: false,
                created_at: '2026-03-12T00:00:00.000Z',
              },
            ],
            total: 1,
            unread_count: 1,
          },
        }))
      }

      if (url.includes('/api/v1/notifications') && init?.method === 'PATCH') {
        return patchRequest.promise
      }

      throw new Error(`Unexpected fetch call: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    render(React.createElement(NotificationBell))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Notifications (1 unread)' })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Notifications (1 unread)' }))

    const notificationButton = await screen.findByRole('button', { name: /Unread notification/i })
    fireEvent.click(notificationButton)
    fireEvent.click(notificationButton)

    const patchCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')
    expect(patchCalls).toHaveLength(1)
    expect((notificationButton as HTMLButtonElement).disabled).toBe(true)

    patchRequest.resolve(jsonResponse({ success: true, message: '1 notification(s) marked as read' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy()
    })
  })
})
