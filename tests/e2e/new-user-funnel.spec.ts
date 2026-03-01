import crypto from 'node:crypto'

import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

test('new user can confirm email and generate an API key', async ({ page, request }) => {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_PROJECT_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

  test.skip(
    !supabaseUrl || !serviceRoleKey,
    'Missing Supabase env vars (need NEXT_PUBLIC_SUPABASE_URL/SUPABASE_PROJECT_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEY).'
  )

  const supabase = createClient(supabaseUrl!, serviceRoleKey!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  const email = `e2e_${Date.now()}_${crypto.randomBytes(4).toString('hex')}@example.com`
  const password = `TestPassw0rd!${crypto.randomBytes(6).toString('hex')}`

  const redirectTo = `${baseURL}/auth/callback?redirect=/dashboard/settings`

  let userId: string | null = null

  try {
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'signup',
      email,
      password,
      options: { redirectTo },
    })

    if (error || !data?.properties?.action_link) {
      throw new Error(error?.message || 'Failed to generate confirmation link')
    }

    userId = data.user?.id || null

    await page.goto(data.properties.action_link, { waitUntil: 'networkidle' })
    await page.waitForURL('**/dashboard/settings', { timeout: 60_000 })

    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

    await page.getByRole('button', { name: /Generate Key/i }).click()

    const rawKeyLocator = page.locator('code', { hasText: /^al_live_/ }).first()
    await expect(rawKeyLocator).toBeVisible()

    const rawKey = (await rawKeyLocator.innerText()).trim()
    expect(rawKey).toMatch(/^al_live_[a-f0-9]{64}$/)

    const notificationsResponse = await request.get('/api/v1/agent/notifications', {
      headers: {
        'X-API-Key': rawKey,
      },
    })

    expect(notificationsResponse.ok()).toBe(true)
    const notificationsJson = await notificationsResponse.json()
    expect(notificationsJson).toMatchObject({ success: true })
  } finally {
    if (!userId) return

    try {
      const { data: human } = await supabase
        .from('humans')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle()

      if (human?.id) {
        await supabase
          .from('agents')
          .delete()
          .eq('name', `human_${human.id}`)
      }
    } catch (error) {
      console.warn('E2E cleanup warning: failed to delete agent/api keys:', error)
    }

    try {
      await supabase.auth.admin.deleteUser(userId)
    } catch (error) {
      console.warn('E2E cleanup warning: failed to delete auth user:', error)
    }
  }
})
