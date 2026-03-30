import {
  buildGermanDateTime,
  formatGermanDateInput,
  formatGermanTimeInput,
  parseGermanDateInput,
  parseGermanTimeInput,
} from './germanDate'

describe('germanDate helpers', () => {
  it('formats digit input into DD.MM.YYYY', () => {
    expect(formatGermanDateInput('30032026')).toBe('30.03.2026')
    expect(formatGermanDateInput('3003')).toBe('30.03')
  })

  it('parses DD.MM.YYYY into a stable date payload', () => {
    expect(parseGermanDateInput('30.03.2026')).toEqual({
      date: new Date(2026, 2, 30),
      iso: '2026-03-30',
    })
  })

  it('formats digit input into HH:mm', () => {
    expect(formatGermanTimeInput('1830')).toBe('18:30')
    expect(formatGermanTimeInput('18')).toBe('18')
  })

  it('rejects impossible time values', () => {
    expect(parseGermanTimeInput('27:15')).toBeNull()
    expect(parseGermanTimeInput('18:61')).toBeNull()
  })

  it('builds a local date-time for valid German date and time inputs', () => {
    const result = buildGermanDateTime('30.03.2026', '18:30')

    expect(result).toEqual(new Date(2026, 2, 30, 18, 30, 0, 0))
  })
})
