import { afterEach, describe, expect, it } from 'vitest'

import {
  getPublicShowcaseConfig,
  hasExactCuratedBountyIds,
  hasExactCuratedHumanIds,
  isBountyPubliclyVisible,
  isHumanPubliclyVisible,
  isPublicShowcaseCuratedMode,
  shouldFailClosedPublicBounties,
  shouldFailClosedPublicHumans,
} from '@/lib/public-showcase'

const ORIGINAL_ENV = {
  mode: process.env.PUBLIC_SHOWCASE_MODE,
  humanIds: process.env.PUBLIC_SHOWCASE_HUMAN_IDS,
  bountyIds: process.env.PUBLIC_SHOWCASE_BOUNTY_IDS,
}

afterEach(() => {
  process.env.PUBLIC_SHOWCASE_MODE = ORIGINAL_ENV.mode
  process.env.PUBLIC_SHOWCASE_HUMAN_IDS = ORIGINAL_ENV.humanIds
  process.env.PUBLIC_SHOWCASE_BOUNTY_IDS = ORIGINAL_ENV.bountyIds
})

describe('public showcase helpers', () => {
  it('defaults to curated mode and fail-closed when IDs are missing', () => {
    delete process.env.PUBLIC_SHOWCASE_MODE
    delete process.env.PUBLIC_SHOWCASE_HUMAN_IDS
    delete process.env.PUBLIC_SHOWCASE_BOUNTY_IDS

    const config = getPublicShowcaseConfig()

    expect(config.mode).toBe('curated')
    expect(config.humanIds).toEqual([])
    expect(config.bountyIds).toEqual([])
    expect(hasExactCuratedHumanIds(config)).toBe(false)
    expect(hasExactCuratedBountyIds(config)).toBe(false)
    expect(shouldFailClosedPublicHumans(config)).toBe(true)
    expect(shouldFailClosedPublicBounties(config)).toBe(true)
  })

  it('parses and deduplicates curated IDs while ignoring invalid tokens', () => {
    process.env.PUBLIC_SHOWCASE_MODE = 'curated'
    process.env.PUBLIC_SHOWCASE_HUMAN_IDS = '11111111-1111-4111-8111-111111111111,invalid,11111111-1111-4111-8111-111111111111,22222222-2222-4222-8222-222222222222,33333333-3333-4333-8333-333333333333'
    process.env.PUBLIC_SHOWCASE_BOUNTY_IDS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa,bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb,cccccccc-cccc-4ccc-8ccc-cccccccccccc,not-a-uuid'

    const config = getPublicShowcaseConfig()

    expect(config.humanIds).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    ])
    expect(config.bountyIds).toEqual([
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    ])
    expect(hasExactCuratedHumanIds(config)).toBe(true)
    expect(hasExactCuratedBountyIds(config)).toBe(true)
  })

  it('supports open mode without curated visibility gating', () => {
    process.env.PUBLIC_SHOWCASE_MODE = 'open'
    process.env.PUBLIC_SHOWCASE_HUMAN_IDS = ''
    process.env.PUBLIC_SHOWCASE_BOUNTY_IDS = ''

    const config = getPublicShowcaseConfig()

    expect(isPublicShowcaseCuratedMode(config)).toBe(false)
    expect(shouldFailClosedPublicHumans(config)).toBe(false)
    expect(shouldFailClosedPublicBounties(config)).toBe(false)
    expect(isHumanPubliclyVisible('11111111-1111-4111-8111-111111111111', config)).toBe(true)
    expect(isBountyPubliclyVisible('33333333-3333-4333-8333-333333333333', config)).toBe(true)
  })

  it('returns 404 visibility behavior for non-curated IDs in curated mode', () => {
    process.env.PUBLIC_SHOWCASE_MODE = 'curated'
    process.env.PUBLIC_SHOWCASE_HUMAN_IDS = '11111111-1111-4111-8111-111111111111,22222222-2222-4222-8222-222222222222,99999999-9999-4999-8999-999999999999'
    process.env.PUBLIC_SHOWCASE_BOUNTY_IDS = '33333333-3333-4333-8333-333333333333,44444444-4444-4444-8444-444444444444,55555555-5555-4555-8555-555555555555'

    const config = getPublicShowcaseConfig()

    expect(isHumanPubliclyVisible('11111111-1111-4111-8111-111111111111', config)).toBe(true)
    expect(isHumanPubliclyVisible('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', config)).toBe(false)
    expect(isBountyPubliclyVisible('33333333-3333-4333-8333-333333333333', config)).toBe(true)
    expect(isBountyPubliclyVisible('66666666-6666-4666-8666-666666666666', config)).toBe(false)
  })

  it('fails closed in curated mode when ID lists are not exactly three', () => {
    process.env.PUBLIC_SHOWCASE_MODE = 'curated'
    process.env.PUBLIC_SHOWCASE_HUMAN_IDS = '11111111-1111-4111-8111-111111111111,22222222-2222-4222-8222-222222222222'
    process.env.PUBLIC_SHOWCASE_BOUNTY_IDS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa,bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb,cccccccc-cccc-4ccc-8ccc-cccccccccccc,dddddddd-dddd-4ddd-8ddd-dddddddddddd'

    const config = getPublicShowcaseConfig()

    expect(hasExactCuratedHumanIds(config)).toBe(false)
    expect(hasExactCuratedBountyIds(config)).toBe(false)
    expect(shouldFailClosedPublicHumans(config)).toBe(true)
    expect(shouldFailClosedPublicBounties(config)).toBe(true)
    expect(isHumanPubliclyVisible('11111111-1111-4111-8111-111111111111', config)).toBe(false)
    expect(isBountyPubliclyVisible('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', config)).toBe(false)
  })
})
