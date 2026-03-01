import type { NextRequest } from 'next/server'
import { POST as generateKey } from '../route'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  return generateKey(request)
}
