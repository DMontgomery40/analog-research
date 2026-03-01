import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('humans')
    .select('skills')

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  const skills = [...new Set(
    (data || []).flatMap(h => h.skills || []).filter(Boolean)
  )].sort()

  return NextResponse.json({ success: true, data: skills })
}
