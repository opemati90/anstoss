import { describe, it, expect } from '@jest/globals'
import { findNearestSpacingToken, SPACING_TOKENS } from '../spacingMatcher'

describe('findNearestSpacingToken', () => {
  it('matches exact value', () => {
    expect(findNearestSpacingToken(16, SPACING_TOKENS)).toEqual({
      name: 'SPACING_LG',
      delta: 0,
    })
  })

  it('matches within ±2px tolerance', () => {
    const r = findNearestSpacingToken(15, SPACING_TOKENS)
    expect(r?.name).toBe('SPACING_LG')
    expect(Math.abs(r!.delta)).toBeLessThanOrEqual(2)
  })

  it('returns null past tolerance', () => {
    expect(findNearestSpacingToken(7, SPACING_TOKENS, { tolerance: 1 })).toBeNull()
  })

  it('exempts 0 and 1', () => {
    expect(findNearestSpacingToken(0, SPACING_TOKENS)).toEqual({ name: '__exempt__', delta: 0 })
    expect(findNearestSpacingToken(1, SPACING_TOKENS)).toEqual({ name: '__exempt__', delta: 0 })
  })
})
