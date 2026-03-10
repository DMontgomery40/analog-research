import pino, { type Logger as PinoLogger } from 'pino'
import { getRequestId, normalizeError } from '@/lib/errors'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogContext {
  file: string
  function: string
  requestId?: string
}

export interface LogEntry {
  level: LogLevel
  message: string
  context: LogContext
  data?: Record<string, unknown>
  timestamp: string
  error?: {
    name: string
    message: string
    code?: string
    details?: unknown
    operatorHint?: string
  }
  operatorHint?: string
}

export interface ContextualLogger {
  debug: (message: string, data?: Record<string, unknown>) => void
  info: (message: string, data?: Record<string, unknown>) => void
  warn: (message: string, data?: Record<string, unknown>) => void
  error: (message: string, data?: Record<string, unknown>, error?: unknown) => void
}

function resolveLogLevel(): LogLevel {
  if (typeof window !== 'undefined') {
    return (process.env.NEXT_PUBLIC_LOG_LEVEL as LogLevel) || 'info'
  }

  return ((process.env.LOG_LEVEL || process.env.NEXT_PUBLIC_LOG_LEVEL) as LogLevel) || 'info'
}

const baseLogger = pino({
  level: resolveLogLevel(),
  base: undefined,
  messageKey: 'message',
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  formatters: {
    level: (label) => ({ level: label }),
  },
  browser: typeof window !== 'undefined'
    ? {
        asObject: true,
      }
    : undefined,
})

const rootContextLogger = baseLogger.child({
  context: {
    file: 'unknown',
    function: 'unknown',
  },
})

function buildPayload(data?: Record<string, unknown>, error?: unknown) {
  const normalized = error ? normalizeError(error) : null
  const operatorHint =
    normalized?.operatorHint ||
    (typeof data?.operatorHint === 'string' ? data.operatorHint : undefined)

  return {
    ...(data && Object.keys(data).length > 0 ? { data } : {}),
    ...(normalized
      ? {
          error: {
            name: normalized.name,
            message: normalized.message,
            ...(normalized.code ? { code: normalized.code } : {}),
            ...(normalized.details !== undefined ? { details: normalized.details } : {}),
            ...(normalized.operatorHint ? { operatorHint: normalized.operatorHint } : {}),
          },
        }
      : {}),
    ...(operatorHint ? { operatorHint } : {}),
  }
}

function logWithLevel(
  instance: PinoLogger,
  level: LogLevel,
  message: string,
  data?: Record<string, unknown>,
  error?: unknown
): void {
  instance[level](buildPayload(data, error), message)
}

function withContext(file: string, fn: string, requestId?: string): ContextualLogger {
  const child = baseLogger.child({
    context: {
      file,
      function: fn,
      ...(requestId ? { requestId } : {}),
    },
    ...(requestId ? { requestId } : {}),
  })

  return {
    debug: (message, data) => logWithLevel(child, 'debug', message, data),
    info: (message, data) => logWithLevel(child, 'info', message, data),
    warn: (message, data) => logWithLevel(child, 'warn', message, data),
    error: (message, data, error) => logWithLevel(child, 'error', message, data, error),
  }
}

function withRequest(
  request: Pick<Request, 'headers'>,
  file: string,
  fn: string
): { requestId: string; log: ContextualLogger } {
  const requestId = getRequestId(request)
  return {
    requestId,
    log: withContext(file, fn, requestId),
  }
}

export const logger = {
  withContext,
  withRequest,
  debug: (message: string, data?: Record<string, unknown>) => {
    logWithLevel(rootContextLogger, 'debug', message, data)
  },
  info: (message: string, data?: Record<string, unknown>) => {
    logWithLevel(rootContextLogger, 'info', message, data)
  },
  warn: (message: string, data?: Record<string, unknown>) => {
    logWithLevel(rootContextLogger, 'warn', message, data)
  },
  error: (message: string, data?: Record<string, unknown>, error?: unknown) => {
    logWithLevel(rootContextLogger, 'error', message, data, error)
  },
}
