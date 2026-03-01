import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()

  // Get the origin from the request headers or use env variable
  const origin = new URL(request.url).origin

  // Use 303 See Other to redirect after POST
  return NextResponse.redirect(new URL('/', origin), { status: 303 })
}
