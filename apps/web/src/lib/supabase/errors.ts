/**
 * Supabase error handling utilities
 *
 * Provides consistent error handling for Supabase queries, especially .single() calls
 * which throw on 0 or 2+ results.
 *
 * Usage:
 *   import { handleSingleResult, handleQueryError, SupabaseQueryError } from '@/lib/supabase/errors'
 *
 *   // For .single() calls:
 *   const { data, error } = await supabase.from('bookings').select('*').eq('id', id).single()
 *   const result = handleSingleResult(data, error, log, 'Booking', { bookingId: id })
 *   if (result.response) return result.response
 *   const booking = result.data
 */

import { NextResponse } from 'next/server'
import type { PostgrestError } from '@supabase/supabase-js'

// Supabase PostgREST error codes
// https://postgrest.org/en/stable/references/errors.html
export const SUPABASE_ERROR_CODES = {
  // Row-level errors
  PGRST116: 'PGRST116', // JSON object requested, multiple (or no) rows returned
  PGRST204: 'PGRST204', // Column not found

  // Auth errors
  PGRST301: 'PGRST301', // JWT expired
  PGRST302: 'PGRST302', // Anonymous access disabled

  // RLS errors
  '42501': '42501', // Insufficient privilege (RLS)

  // Constraint violations
  '23505': '23505', // Unique constraint violation
  '23503': '23503', // Foreign key violation
  '23502': '23502', // Not null violation
} as const

export interface SupabaseQueryError {
  message: string
  code?: string
  details?: string
  hint?: string
}

export interface LoggerLike {
  error: (
    message: string,
    data?: Record<string, unknown>,
    error?: { message: string; code?: string }
  ) => void
  warn: (message: string, data?: Record<string, unknown>) => void
}

interface SingleResultSuccess<T> {
  data: T
  response: null
}

interface SingleResultError {
  data: null
  response: NextResponse
}

type SingleResult<T> = SingleResultSuccess<T> | SingleResultError

/**
 * Maps Supabase error codes to appropriate HTTP status codes
 */
export function mapErrorToStatus(error: PostgrestError | SupabaseQueryError): number {
  if (!error.code) return 500

  switch (error.code) {
    case SUPABASE_ERROR_CODES.PGRST116:
      return 404 // Not found (0 rows) or 409 (multiple rows)
    case SUPABASE_ERROR_CODES['42501']:
      return 403 // Forbidden (RLS)
    case SUPABASE_ERROR_CODES['23505']:
      return 409 // Conflict (duplicate)
    case SUPABASE_ERROR_CODES['23503']:
      return 400 // Bad request (FK violation)
    case SUPABASE_ERROR_CODES['23502']:
      return 400 // Bad request (null violation)
    case SUPABASE_ERROR_CODES.PGRST301:
    case SUPABASE_ERROR_CODES.PGRST302:
      return 401 // Unauthorized
    default:
      return 500
  }
}

/**
 * Determines if an error is "not found" (0 rows from .single())
 */
export function isNotFoundError(error: PostgrestError | SupabaseQueryError | null): boolean {
  return error?.code === SUPABASE_ERROR_CODES.PGRST116
}

/**
 * Detects missing-column errors across both PostgreSQL and PostgREST schema-cache variants.
 *
 * Examples:
 * - 42703: column does not exist
 * - PGRST204: Could not find the 'column' column of 'table' in the schema cache
 */
export function isMissingColumnError(
  error: PostgrestError | SupabaseQueryError | null,
  options?: { column?: string; table?: string }
): boolean {
  if (!error) return false

  const code = (error.code || '').trim().toUpperCase()
  const text = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  const codeMatches = code === SUPABASE_ERROR_CODES.PGRST204 || code === '42703'
  const textMatches = text.includes('column') && (
    text.includes('schema cache')
    || text.includes('does not exist')
    || text.includes('could not find')
  )

  if (!codeMatches && !textMatches) {
    return false
  }

  if (options?.column) {
    const needle = options.column.toLowerCase()
    if (!text.includes(needle)) return false
  }

  if (options?.table) {
    const needle = options.table.toLowerCase()
    if (!text.includes(needle)) return false
  }

  return true
}

/**
 * Creates a standardized error response for API routes
 */
export function createErrorResponse(
  message: string,
  status: number,
  code?: string
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: message,
      ...(code && { code }),
    },
    { status }
  )
}

/**
 * Handles the result of a .single() query with proper error handling and logging
 *
 * @param data - The data returned from the query
 * @param error - The error returned from the query
 * @param log - A contextual logger instance
 * @param entityName - Human-readable name of the entity (e.g., "Booking", "Human")
 * @param context - Additional context for logging
 * @returns Object with either data (success) or response (error)
 */
export function handleSingleResult<T>(
  data: T | null,
  error: PostgrestError | null,
  log: LoggerLike,
  entityName: string,
  context?: Record<string, unknown>
): SingleResult<T> {
  if (error) {
    const status = mapErrorToStatus(error)

    if (isNotFoundError(error)) {
      log.warn(`${entityName} not found`, context)
      return {
        data: null,
        response: createErrorResponse(`${entityName} not found`, 404),
      }
    }

    log.error(`Failed to fetch ${entityName}`, context, { message: error.message, code: error.code })
    return {
      data: null,
      response: createErrorResponse(error.message, status, error.code),
    }
  }

  if (!data) {
    log.warn(`${entityName} not found (null data)`, context)
    return {
      data: null,
      response: createErrorResponse(`${entityName} not found`, 404),
    }
  }

  return { data, response: null }
}

/**
 * Handles a generic query error (for non-.single() queries)
 */
export function handleQueryError(
  error: PostgrestError | null,
  log: LoggerLike,
  operation: string,
  context?: Record<string, unknown>
): NextResponse | null {
  if (!error) return null

  const status = mapErrorToStatus(error)
  log.error(`${operation} failed`, context, { message: error.message, code: error.code })
  return createErrorResponse(error.message, status, error.code)
}

/**
 * Handles insert/update operations that use .single() to return the created/updated row
 */
export function handleMutationResult<T>(
  data: T | null,
  error: PostgrestError | null,
  log: LoggerLike,
  operation: string,
  context?: Record<string, unknown>
): SingleResult<T> {
  if (error) {
    const status = mapErrorToStatus(error)
    log.error(`${operation} failed`, context, { message: error.message, code: error.code })
    return {
      data: null,
      response: createErrorResponse(error.message, status, error.code),
    }
  }

  if (!data) {
    log.error(`${operation} returned no data`, context)
    return {
      data: null,
      response: createErrorResponse(`${operation} failed`, 500),
    }
  }

  return { data, response: null }
}

/**
 * Wraps a fire-and-forget operation with error logging
 * Use this for operations like notifications where failure shouldn't block the main flow
 */
export async function logOnError<T>(
  promise: PromiseLike<{ data: T | null; error: PostgrestError | null }>,
  log: LoggerLike,
  operation: string,
  context?: Record<string, unknown>
): Promise<T | null> {
  const { data, error } = await promise

  if (error) {
    log.error(`${operation} failed (non-blocking)`, context, {
      message: error.message,
      code: error.code,
    })
  }

  return data
}
