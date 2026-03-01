import { NextResponse } from 'next/server'
import { QUALITY_FORMULAS_V1 } from '@/lib/quality-formulas'

export async function GET() {
  return NextResponse.json({
    success: true,
    data: QUALITY_FORMULAS_V1,
  })
}
