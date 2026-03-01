import { NextResponse } from 'next/server'
import type { ZodTypeAny } from 'zod'

export type ParseZodJsonResult<TSchema extends ZodTypeAny> =
  | { ok: true; data: ReturnType<TSchema['parse']> }
  | { ok: false; response: NextResponse }

export async function parseZodJsonBody<TSchema extends ZodTypeAny>(
  request: Request,
  schema: TSchema
): Promise<ParseZodJsonResult<TSchema>> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 }),
    }
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: parsed.error.errors }, { status: 400 }),
    }
  }

  return { ok: true, data: parsed.data as ReturnType<TSchema['parse']> }
}

