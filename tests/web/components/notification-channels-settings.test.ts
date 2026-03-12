// @vitest-environment jsdom

import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { NotificationChannelsSettings } from '@/components/settings/notification-channels-settings'

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

describe('NotificationChannelsSettings', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('ignores stale responses when switching between ResearchAgent and Human channel views', async () => {
    const agentRequest = deferred<Response>()
    const humanRequest = deferred<Response>()

    const fetchMock = vi.fn(() => {
      if (fetchMock.mock.calls.length === 1) {
        return agentRequest.promise
      }

      if (fetchMock.mock.calls.length === 2) {
        return humanRequest.promise
      }

      throw new Error(`Unexpected fetch call count: ${fetchMock.mock.calls.length}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    render(React.createElement(NotificationChannelsSettings))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: 'Human channels' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    humanRequest.resolve(jsonResponse({
      success: true,
      data: {
        channels: [
          {
            id: 'human_channel',
            channel_type: 'webhook',
            channel_config: { url: 'https://human.example.test' },
            name: 'Human webhook',
            enabled: true,
            created_at: '2026-03-12T00:00:00.000Z',
          },
        ],
      },
    }))

    await waitFor(() => {
      expect(screen.getByText('Human webhook')).toBeTruthy()
    })

    agentRequest.resolve(jsonResponse({
      success: true,
      data: {
        channels: [
          {
            id: 'agent_channel',
            channel_type: 'webhook',
            channel_config: { url: 'https://agent.example.test' },
            name: 'ResearchAgent webhook',
            enabled: true,
            created_at: '2026-03-12T00:00:00.000Z',
          },
        ],
      },
    }))

    await waitFor(() => {
      expect(screen.getByText('Human webhook')).toBeTruthy()
    })
    expect(screen.queryByText('ResearchAgent webhook')).toBeNull()
  })
})
