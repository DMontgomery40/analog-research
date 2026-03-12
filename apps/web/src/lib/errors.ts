export interface ErrorDetails {
  [key: string]: unknown
}

export interface AppErrorOptions {
  name?: string
  code?: string
  status?: number
  operatorHint?: string
  details?: unknown
  requestId?: string
  cause?: unknown
}

export interface NormalizedError {
  name: string
  message: string
  code?: string
  status?: number
  operatorHint?: string
  details?: unknown
  requestId?: string
  cause?: unknown
}

export class AppError extends Error {
  code?: string
  status?: number
  operatorHint?: string
  details?: unknown
  requestId?: string

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message)

    this.name = options.name ?? 'AppError'
    this.code = options.code
    this.status = options.status
    this.operatorHint = options.operatorHint
    this.details = options.details
    this.requestId = options.requestId

    if (options.cause !== undefined) {
      ;(this as Error & { cause?: unknown }).cause = options.cause
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function maybeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function maybeStatus(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined
}

function getErrorField(error: unknown, field: keyof AppErrorOptions | 'message' | 'name'): unknown {
  if (!isRecord(error)) return undefined
  return error[field]
}

export function normalizeError(
  error: unknown,
  fallback: AppErrorOptions & { message?: string } = {}
): NormalizedError {
  const message =
    (typeof error === 'string' ? maybeString(error) : undefined) ??
    maybeString(error instanceof Error ? error.message : getErrorField(error, 'message')) ??
    fallback.message ??
    'Unexpected error'

  const name =
    (typeof error === 'string' ? 'Error' : undefined) ??
    maybeString(error instanceof Error ? error.name : getErrorField(error, 'name')) ??
    fallback.name ??
    'Error'

  const code =
    maybeString(getErrorField(error, 'code')) ??
    (error instanceof Error ? maybeString((error as Error & { code?: unknown }).code) : undefined) ??
    fallback.code

  const status =
    maybeStatus(getErrorField(error, 'status')) ??
    (error instanceof Error ? maybeStatus((error as Error & { status?: unknown }).status) : undefined) ??
    fallback.status

  const operatorHint =
    maybeString(getErrorField(error, 'operatorHint')) ??
    (error instanceof Error
      ? maybeString((error as Error & { operatorHint?: unknown }).operatorHint)
      : undefined) ??
    fallback.operatorHint

  const requestId =
    maybeString(getErrorField(error, 'requestId')) ??
    (error instanceof Error
      ? maybeString((error as Error & { requestId?: unknown }).requestId)
      : undefined) ??
    fallback.requestId

  const details =
    getErrorField(error, 'details') !== undefined
      ? getErrorField(error, 'details')
      : fallback.details

  const cause =
    (error instanceof Error ? (error as Error & { cause?: unknown }).cause : undefined) ??
    getErrorField(error, 'cause') ??
    fallback.cause

  return {
    name,
    message,
    ...(code ? { code } : {}),
    ...(status ? { status } : {}),
    ...(operatorHint ? { operatorHint } : {}),
    ...(details !== undefined ? { details } : {}),
    ...(requestId ? { requestId } : {}),
    ...(cause !== undefined ? { cause } : {}),
  }
}

export function getRequestId(source?: Pick<Request, 'headers'> | Headers | null): string {
  const headers = source instanceof Headers ? source : source?.headers
  const existing = headers?.get('x-request-id')?.trim()
  return existing || crypto.randomUUID()
}

export function toPublicErrorPayload(error: unknown): {
  success: false
  error: string
  code?: string
  requestId?: string
} {
  const normalized = normalizeError(error)

  return {
    success: false,
    error: normalized.message,
    ...(normalized.code ? { code: normalized.code } : {}),
    ...(normalized.requestId ? { requestId: normalized.requestId } : {}),
  }
}

export function withRequestId<T extends Response>(response: T, requestId?: string): T {
  if (requestId) {
    response.headers.set('x-request-id', requestId)
  }

  return response
}
