import {
  HANDOFF_CODE_ALPHABET,
  HANDOFF_CODE_LENGTH,
  normalizeParentHandoffCode,
} from '../parentHandoffCode'

describe('parent handoff code helpers', () => {
  it('normalizes pasted setup codes with spaces and separators', () => {
    expect(normalizeParentHandoffCode('ab23-cd45')).toBe('AB23CD45')
    expect(normalizeParentHandoffCode('AB23 CD45')).toBe('AB23CD45')
  })

  it('limits by valid code characters rather than raw pasted length', () => {
    expect(normalizeParentHandoffCode('AB23-CD45-EXTRA')).toBe('AB23CD45')
  })

  it('uses the same unambiguous alphabet and length as parent handoff emails', () => {
    expect(HANDOFF_CODE_ALPHABET).toBe('ABCDEFGHJKMNPQRSTUVWXYZ23456789')
    expect(HANDOFF_CODE_LENGTH).toBe(8)
  })
})
