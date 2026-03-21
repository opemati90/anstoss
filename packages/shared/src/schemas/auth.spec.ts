import { registerSchema } from './auth'

describe('registerSchema', () => {
  const validData = {
    email: 'test@example.com',
    name: 'Max Mustermann',
    dateOfBirth: '2000-01-01',
  }

  it('accepts valid registration data', () => {
    const result = registerSchema.safeParse(validData)
    expect(result.success).toBe(true)
  })

  it('rejects user under 16', () => {
    const underAge = {
      ...validData,
      dateOfBirth: new Date().toISOString().split('T')[0], // today = 0 years old
    }
    const result = registerSchema.safeParse(underAge)
    expect(result.success).toBe(false)
  })

  it('rejects invalid email', () => {
    const result = registerSchema.safeParse({ ...validData, email: 'not-email' })
    expect(result.success).toBe(false)
  })

  it('rejects empty name', () => {
    const result = registerSchema.safeParse({ ...validData, name: '' })
    expect(result.success).toBe(false)
  })

  it('accepts user exactly 16 years old', () => {
    const today = new Date()
    const sixteenYearsAgo = new Date(
      today.getFullYear() - 16,
      today.getMonth(),
      today.getDate(),
    )
    const data = {
      ...validData,
      dateOfBirth: sixteenYearsAgo.toISOString().split('T')[0],
    }
    const result = registerSchema.safeParse(data)
    expect(result.success).toBe(true)
  })
})
