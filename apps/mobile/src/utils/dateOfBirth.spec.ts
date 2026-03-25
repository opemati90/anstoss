import { formatDateOfBirthInput, parseDateOfBirthInput } from './dateOfBirth'

describe('dateOfBirth helpers', () => {
  it('formats digit input into the German date structure', () => {
    expect(formatDateOfBirthInput('15062000')).toBe('15.06.2000')
    expect(formatDateOfBirthInput('1506')).toBe('15.06')
  })

  it('parses a German date string into an ISO payload', () => {
    expect(parseDateOfBirthInput('15.06.2000')).toEqual({
      date: new Date(2000, 5, 15),
      iso: '2000-06-15',
    })
  })

  it('rejects impossible calendar dates', () => {
    expect(parseDateOfBirthInput('31.02.2000')).toBeNull()
  })
})
