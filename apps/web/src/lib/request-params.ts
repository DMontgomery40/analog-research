export interface BoundedIntegerOptions {
  paramName: string
  min: number
  max: number
  defaultValue: number
}

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }

function integerErrorMessage({ paramName, min, max }: BoundedIntegerOptions): string {
  return `${paramName} must be an integer between ${min} and ${max}`
}

export function parseBoundedIntegerParam(
  rawValue: string | null,
  options: BoundedIntegerOptions
): ParseResult<number> {
  if (rawValue === null || rawValue.trim() === '') {
    return { ok: true, value: options.defaultValue }
  }

  if (!/^-?\d+$/.test(rawValue.trim())) {
    return { ok: false, error: integerErrorMessage(options) }
  }

  const parsed = Number.parseInt(rawValue, 10)
  if (!Number.isFinite(parsed) || parsed < options.min || parsed > options.max) {
    return { ok: false, error: integerErrorMessage(options) }
  }

  return { ok: true, value: parsed }
}

export interface OptionalBoundedIntegerOptions {
  paramName: string
  min: number
  max: number
}

export function parseOptionalBoundedIntegerParam(
  rawValue: string | null,
  options: OptionalBoundedIntegerOptions
): ParseResult<number | null> {
  if (rawValue === null || rawValue.trim() === '') {
    return { ok: true, value: null }
  }

  if (!/^-?\d+$/.test(rawValue.trim())) {
    return { ok: false, error: `${options.paramName} must be an integer between ${options.min} and ${options.max}` }
  }

  const parsed = Number.parseInt(rawValue, 10)
  if (!Number.isFinite(parsed) || parsed < options.min || parsed > options.max) {
    return { ok: false, error: `${options.paramName} must be an integer between ${options.min} and ${options.max}` }
  }

  return { ok: true, value: parsed }
}

export interface PaginationOptions {
  limitParamName?: string
  offsetParamName?: string
  minLimit?: number
  maxLimit?: number
  defaultLimit?: number
  minOffset?: number
  maxOffset?: number
  defaultOffset?: number
}

export function parsePaginationParams(
  searchParams: URLSearchParams,
  options?: PaginationOptions
): ParseResult<{ limit: number; offset: number }> {
  const limitParamName = options?.limitParamName ?? 'limit'
  const offsetParamName = options?.offsetParamName ?? 'offset'

  const limitResult = parseBoundedIntegerParam(searchParams.get(limitParamName), {
    paramName: limitParamName,
    min: options?.minLimit ?? 1,
    max: options?.maxLimit ?? 100,
    defaultValue: options?.defaultLimit ?? 20,
  })
  if (!limitResult.ok) return limitResult

  const offsetResult = parseBoundedIntegerParam(searchParams.get(offsetParamName), {
    paramName: offsetParamName,
    min: options?.minOffset ?? 0,
    max: options?.maxOffset ?? 10000,
    defaultValue: options?.defaultOffset ?? 0,
  })
  if (!offsetResult.ok) return offsetResult

  return {
    ok: true,
    value: { limit: limitResult.value, offset: offsetResult.value },
  }
}
