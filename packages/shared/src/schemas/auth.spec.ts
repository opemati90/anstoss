import { registerSchema, getAge, MIN_AGE } from './auth'

describe('registerSchema', () => {
  it('accepts valid registration', () => {
    const result = registerSchema.safeParse({
      name: 'Max Müller',
      email: 'max@example.com',
      dateOfBirth: '1990-05-15',
    })
    expect(result.success).toBe(true)
  })

  it('rejects name shorter than 2 chars', () => {
    const result = registerSchema.safeParse({
      name: 'X',
      email: 'x@example.com',
      dateOfBirth: '1990-01-01',
    })
    expect(result.success).toBe(false)
  })

  it('rejects name longer than 100 chars', () => {
    const result = registerSchema.safeParse({
      name: 'A'.repeat(101),
      email: 'x@example.com',
      dateOfBirth: '1990-01-01',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid email', () => {
    const result = registerSchema.safeParse({
      name: 'Max',
      email: 'not-an-email',
      dateOfBirth: '1990-01-01',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid date string', () => {
    const result = registerSchema.safeParse({
      name: 'Max',
      email: 'max@example.com',
      dateOfBirth: 'not-a-date',
    })
    expect(result.success).toBe(false)
  })

  it('rejects under-16 (GDPR Germany)', () => {
    const today = new Date()
    const under16 = new Date(
      today.getFullYear() - 15,
      today.getMonth(),
      today.getDate(),
    )
    const result = registerSchema.safeParse({
      name: 'Young Player',
      email: 'young@example.com',
      dateOfBirth: under16.toISOString().split('T')[0],
    })
    expect(result.success).toBe(false)
  })

  it('accepts exactly 16 years old', () => {
    const today = new Date()
    const exactly16 = new Date(
      today.getFullYear() - 16,
      today.getMonth(),
      today.getDate(),
    )
    const result = registerSchema.safeParse({
      name: 'Just Old Enough',
      email: 'just@example.com',
      dateOfBirth: exactly16.toISOString().split('T')[0],
    })
    expect(result.success).toBe(true)
  })
})

describe('getAge', () => {
  it('returns correct age for past birthday this year', () => {
    const dob = new Date()
    dob.setFullYear(dob.getFullYear() - 25)
    dob.setMonth(dob.getMonth() - 1)
    expect(getAge(dob)).toBe(25)
  })

  it('returns age minus 1 if birthday is later this year', () => {
    const dob = new Date()
    dob.setFullYear(dob.getFullYear() - 25)
    dob.setMonth(dob.getMonth() + 1)
    expect(getAge(dob)).toBe(24)
  })
})

describe('MIN_AGE', () => {
  it('is 16 (GDPR Germany)', () => {
    expect(MIN_AGE).toBe(16)
  })
})
