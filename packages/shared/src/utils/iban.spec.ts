import { isValidIban, normalizeIban } from './iban'

describe('isValidIban', () => {
  it('accepts real, correctly-checksummed IBANs', () => {
    expect(isValidIban('DE89370400440532013000')).toBe(true) // Deutsche Bank sample
    expect(isValidIban('DE89 3704 0044 0532 0130 00')).toBe(true) // spaced
    expect(isValidIban('gb29nwbk60161331926819')).toBe(true) // lower-case
    expect(isValidIban('AT611904300234573201')).toBe(true)
  })

  it('rejects MOD-97 checksum failures (typos)', () => {
    expect(isValidIban('DE89370400440532013001')).toBe(false) // last digit off
    expect(isValidIban('DE00370400440532013000')).toBe(false) // bad check digits
  })

  it('rejects junk that is merely IBAN-shaped', () => {
    expect(isValidIban('DEABAAAAAAAAAAAAAAAA')).toBe(false)
    expect(isValidIban('ZZ00AAAAAAAAAAA')).toBe(false)
    expect(isValidIban('DE123')).toBe(false)
    expect(isValidIban('')).toBe(false)
    expect(isValidIban('not an iban')).toBe(false)
  })

  it('enforces per-country length where known', () => {
    expect(isValidIban('DE8937040044053201300')).toBe(false) // 21, DE needs 22
  })

  it('normalizeIban strips spaces and upper-cases', () => {
    expect(normalizeIban(' de89 3704 ')).toBe('DE893704')
  })
})
