import { describe, it, expect } from '@jest/globals'
import { findNearestToken } from '../colorMatcher'

describe('findNearestToken', () => {
  it('matches an exact hex to the token name', () => {
    const tokens = { TEXT_PRIMARY: '#1A1C22', SURFACE: '#FFFFFF' }
    expect(findNearestToken('#1A1C22', tokens)).toEqual({
      name: 'TEXT_PRIMARY',
      deltaE: 0,
    })
  })

  it('matches within ΔE < 3 tolerance', () => {
    const tokens = { TEXT_PRIMARY: '#1A1C22' }
    const match = findNearestToken('#1B1D23', tokens)
    expect(match!.name).toBe('TEXT_PRIMARY')
    expect(match!.deltaE).toBeLessThan(3)
  })

  it('returns null when no token within tolerance', () => {
    const tokens = { SURFACE: '#FFFFFF' }
    expect(findNearestToken('#FF0000', tokens)).toBeNull()
  })

  it('handles rgba via the literal source', () => {
    const tokens = { SURFACE: '#FFFFFF' }
    expect(findNearestToken('rgba(255, 255, 255, 0.5)', tokens, { ignoreAlpha: true }))
      .toEqual({ name: 'SURFACE', deltaE: 0 })
  })
})
