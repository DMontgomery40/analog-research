import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Returns the current authenticated user (or null).
 *
 * @remarks
 * This endpoint exists so PublicNav can check auth state without creating a
 * browser Supabase client. Browser clients have `autoRefreshToken: true` by
 * default, which can cause infinite refresh loops when stale cookies exist.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return NextResponse.json({ user: user ?? null })
}
