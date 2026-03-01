import { test, expect } from '@playwright/test'

test('admin moderation pages render and show data (mocked)', async ({ page }) => {
  test.skip(
    !process.env.ADMIN_DEV_BYPASS_EMAIL,
    'Set ADMIN_DEV_BYPASS_EMAIL to bypass Supabase auth for admin page rendering checks.',
  )

  let queueItemStatus: 'pending' | 'completed' | 'failed' = 'pending'

  await page.route('**/api/v1/admin/moderation/events**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: [
          {
            id: '00000000-0000-0000-0000-000000000111',
            surface: 'message',
            content_type: 'message',
            content_id: '00000000-0000-0000-0000-000000000222',
            actor_type: 'human',
            actor_id: '00000000-0000-0000-0000-000000000333',
            decision: 'warn',
            reason_codes: ['SUSPICIOUS_EXTERNAL_LINK'],
            risk_score: 0.62,
            confidence: 0.71,
            spam_action: 'none',
            policy_version: '2026-02-08-v1',
            provider: 'openrouter',
            model: 'mistralai/mistral-nemo',
            evidence: {
              trace: {
                run_id: 'trace_123',
                started_at: new Date().toISOString(),
                timings_ms: {
                  normalize_ms: 1,
                  deterministic_ms: 2,
                  link_risk_ms: 3,
                  spam_ms: 4,
                  model_ms: 12,
                  total_ms: 25,
                },
                model: {
                  status: 'ok',
                  model: 'mistralai/mistral-nemo',
                  error: null,
                  attempts: [
                    {
                      model: 'mistralai/mistral-nemo',
                      strict: false,
                      status: 'ok',
                      error: null,
                      meta: {
                        duration_ms: 12,
                        http_status: 200,
                        request_id: 'req_123',
                        response_id: 'resp_123',
                        response_model: 'mistralai/mistral-nemo',
                        usage: { total_tokens: 42 },
                      },
                      output: {
                        decision_suggestion: 'warn',
                        reason_codes: ['SUSPICIOUS_EXTERNAL_LINK'],
                        risk_score: 0.62,
                        confidence: 0.71,
                        spam_score: 0.12,
                        needs_escalation: false,
                        summary: 'Suspicious link patterns detected',
                      },
                    },
                  ],
                },
                decision_notes: {
                  deterministic_hard_fail: false,
                  hard_fail_signal_count: 0,
                  spam_action: 'none',
                  fail_open_needs_rescan: false,
                },
              },
            },
            created_at: new Date().toISOString(),
          },
        ],
        pagination: { limit: 50, offset: 0, total: 1 },
      }),
    })
  })

  await page.route('**/api/v1/admin/moderation/rescan-queue**', async (route) => {
    const url = new URL(route.request().url())
    const isItemPatch = /\/api\/v1\/admin\/moderation\/rescan-queue\/[^/]+$/.test(url.pathname)

    if (route.request().method() === 'PATCH' && isItemPatch) {
      queueItemStatus = 'completed'
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: '00000000-0000-0000-0000-000000000aaa',
            status: queueItemStatus,
          },
        }),
      })
      return
    }

    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              id: '00000000-0000-0000-0000-000000000aaa',
              surface: 'message',
              content_type: 'message',
              content_id: '00000000-0000-0000-0000-000000000bbb',
              actor_type: 'agent',
              actor_id: '00000000-0000-0000-0000-000000000ccc',
              reason: 'timeout',
              status: queueItemStatus,
              attempt_count: 2,
              next_run_at: new Date(Date.now() + 60_000).toISOString(),
              last_error: queueItemStatus === 'pending' ? 'OpenRouter moderation request timed out' : null,
              content_text: 'hello https://example.com',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
          pagination: { limit: 50, offset: 0, total: 1 },
        }),
      })
      return
    }

    await route.fallback()
  })

  await page.goto('/admin/moderation', { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { name: 'Moderation Events' })).toBeVisible()

  await page.getByText('warn', { exact: true }).first().click()
  await expect(page.getByText('Trace', { exact: true })).toBeVisible()
  await expect(page.getByText('Model attempts', { exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'req_123' })).toBeVisible()

  await page.goto('/admin/moderation/rescan-queue', { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { name: 'Moderation Rescan Queue' })).toBeVisible()
  await expect(page.getByRole('cell', { name: /pending/i })).toBeVisible()

  // Expand row and mark completed to verify the action UI is wired up.
  await page.locator('tbody tr').filter({ hasText: /pending/i }).first().click()
  await expect(page.getByRole('button', { name: 'Mark Completed' })).toBeVisible()
  await page.getByRole('button', { name: 'Mark Completed' }).click()

  await expect(page.getByRole('cell', { name: /completed/i })).toBeVisible()
})
