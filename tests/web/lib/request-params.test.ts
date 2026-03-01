import { describe, expect, it } from 'vitest'

import {
  parseBoundedIntegerParam,
  parseOptionalBoundedIntegerParam,
} from '@/lib/request-params'

describe('request param helpers', () => {
  it('returns defaults when bounded integer param is missing', () => {
    const result = parseBoundedIntegerParam(null, {
      paramName: 'limit',
      min: 1,
      max: 100,
      defaultValue: 20,
    })

    expect(result).toEqual({ ok: true, value: 20 })
  })

  it('parses valid bounded integer values', () => {
    const result = parseBoundedIntegerParam('42', {
      paramName: 'limit',
      min: 1,
      max: 100,
      defaultValue: 20,
    })

    expect(result).toEqual({ ok: true, value: 42 })
  })

  it('rejects non-integer bounded values', () => {
    const result = parseBoundedIntegerParam('3.14', {
      paramName: 'limit',
      min: 1,
      max: 100,
      defaultValue: 20,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('limit must be an integer')
    }
  })

  it('rejects out-of-range bounded values', () => {
    const result = parseBoundedIntegerParam('1000', {
      paramName: 'limit',
      min: 1,
      max: 100,
      defaultValue: 20,
    })

    expect(result.ok).toBe(false)
  })

  it('returns null for missing optional bounded value', () => {
    const result = parseOptionalBoundedIntegerParam('', {
      paramName: 'offset',
      min: 0,
      max: 10000,
    })

    expect(result).toEqual({ ok: true, value: null })
  })

  it('parses valid optional bounded value', () => {
    const result = parseOptionalBoundedIntegerParam('500', {
      paramName: 'offset',
      min: 0,
      max: 10000,
    })

    expect(result).toEqual({ ok: true, value: 500 })
  })
})
