/**
 * Structured logging utility for Analog Research
 *
 * Provides consistent, structured logging with context (file, function, query)
 * for debugging and observability.
 *
 * Usage:
 *   import { logger } from '@/lib/logger'
 *
 *   // In API routes:
 *   const log = logger.withContext('api/v1/bookings/route.ts', 'GET')
 *   log.error('Failed to fetch booking', { bookingId, error: err.message })
 *
 *   // In lib functions:
 *   const log = logger.withContext('lib/booking-settlement.ts', 'ensureBookingSettlementRecords')
 *   log.info('Processing settlement', { bookingId, amount })
 */

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
    message: string
    code?: string
    details?: unknown
  }
}

interface ContextualLogger {
  debug: (message: string, data?: Record<string, unknown>) => void
  info: (message: string, data?: Record<string, unknown>) => void
  warn: (message: string, data?: Record<string, unknown>) => void
  error: (message: string, data?: Record<string, unknown>, error?: Error | { message: string; code?: string }) => void
}

function formatLogEntry(entry: LogEntry): string {
  const parts = [
    `[${entry.timestamp}]`,
    `[${entry.level.toUpperCase()}]`,
    `[${entry.context.file}:${entry.context.function}]`,
  ]

  if (entry.context.requestId) {
    parts.push(`[req:${entry.context.requestId}]`)
  }

  parts.push(entry.message)

  if (entry.data && Object.keys(entry.data).length > 0) {
    parts.push(JSON.stringify(entry.data))
  }

  if (entry.error) {
    parts.push(`error=${JSON.stringify(entry.error)}`)
  }

  return parts.join(' ')
}

function createLogEntry(
  level: LogLevel,
  message: string,
  context: LogContext,
  data?: Record<string, unknown>,
  error?: Error | { message: string; code?: string }
): LogEntry {
  const entry: LogEntry = {
    level,
    message,
    context,
    timestamp: new Date().toISOString(),
  }

  if (data && Object.keys(data).length > 0) {
    entry.data = data
  }

  if (error) {
    entry.error = {
      message: error.message,
      code: 'code' in error ? error.code : undefined,
    }
  }

  return entry
}

function shouldLog(level: LogLevel): boolean {
  const levels: LogLevel[] = ['debug', 'info', 'warn', 'error']
  const minLevel = (process.env.LOG_LEVEL as LogLevel) || 'info'
  return levels.indexOf(level) >= levels.indexOf(minLevel)
}

function logEntry(entry: LogEntry): void {
  if (!shouldLog(entry.level)) return

  const formatted = formatLogEntry(entry)

  switch (entry.level) {
    case 'debug':
      console.debug(formatted)
      break
    case 'info':
      console.info(formatted)
      break
    case 'warn':
      console.warn(formatted)
      break
    case 'error':
      console.error(formatted)
      break
  }
}

function withContext(file: string, fn: string, requestId?: string): ContextualLogger {
  const context: LogContext = { file, function: fn, requestId }

  return {
    debug: (message: string, data?: Record<string, unknown>) => {
      logEntry(createLogEntry('debug', message, context, data))
    },
    info: (message: string, data?: Record<string, unknown>) => {
      logEntry(createLogEntry('info', message, context, data))
    },
    warn: (message: string, data?: Record<string, unknown>) => {
      logEntry(createLogEntry('warn', message, context, data))
    },
    error: (
      message: string,
      data?: Record<string, unknown>,
      error?: Error | { message: string; code?: string }
    ) => {
      logEntry(createLogEntry('error', message, context, data, error))
    },
  }
}

export const logger = {
  withContext,

  // Direct logging without context (for simple cases)
  debug: (message: string, data?: Record<string, unknown>) => {
    logEntry(createLogEntry('debug', message, { file: 'unknown', function: 'unknown' }, data))
  },
  info: (message: string, data?: Record<string, unknown>) => {
    logEntry(createLogEntry('info', message, { file: 'unknown', function: 'unknown' }, data))
  },
  warn: (message: string, data?: Record<string, unknown>) => {
    logEntry(createLogEntry('warn', message, { file: 'unknown', function: 'unknown' }, data))
  },
  error: (
    message: string,
    data?: Record<string, unknown>,
    error?: Error | { message: string; code?: string }
  ) => {
    logEntry(
      createLogEntry('error', message, { file: 'unknown', function: 'unknown' }, data, error)
    )
  },
}
