import { generateJoinCode, JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH } from './team-join-code.util'

describe('generateJoinCode', () => {
  it('returns a 10-char string', () => {
    expect(generateJoinCode()).toHaveLength(JOIN_CODE_LENGTH)
  })

  it('only uses the unambiguous alphabet (no 0, O, 1, I, L)', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateJoinCode()
      for (const ch of code) {
        expect(JOIN_CODE_ALPHABET).toContain(ch)
      }
    }
  })

  it('produces different codes on subsequent calls', () => {
    const codes = new Set<string>()
    for (let i = 0; i < 100; i++) codes.add(generateJoinCode())
    expect(codes.size).toBeGreaterThan(95)
  })
})
