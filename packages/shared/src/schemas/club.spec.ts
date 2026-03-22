import { createClubSchema, createTeamSchema } from './club'

describe('createClubSchema', () => {
  it('accepts valid club', () => {
    const result = createClubSchema.safeParse({
      name: 'FC Bayern',
      primaryColor: '#D50000',
    })
    expect(result.success).toBe(true)
  })

  it('rejects short name', () => {
    const result = createClubSchema.safeParse({ name: 'F', primaryColor: '#D50000' })
    expect(result.success).toBe(false)
  })

  it('rejects name over 50 chars', () => {
    const result = createClubSchema.safeParse({
      name: 'A'.repeat(51),
      primaryColor: '#D50000',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid hex color (no hash)', () => {
    const result = createClubSchema.safeParse({ name: 'FC Test', primaryColor: 'D50000' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid hex color (short)', () => {
    const result = createClubSchema.safeParse({ name: 'FC Test', primaryColor: '#D50' })
    expect(result.success).toBe(false)
  })

  it('accepts lowercase hex', () => {
    const result = createClubSchema.safeParse({ name: 'FC Test', primaryColor: '#d5aabb' })
    expect(result.success).toBe(true)
  })
})

describe('createTeamSchema', () => {
  it('accepts valid team', () => {
    const result = createTeamSchema.safeParse({ name: 'U19 Herren' })
    expect(result.success).toBe(true)
  })

  it('rejects short name', () => {
    const result = createTeamSchema.safeParse({ name: 'A' })
    expect(result.success).toBe(false)
  })

  it('accepts optional ageGroup', () => {
    const result = createTeamSchema.safeParse({ name: 'Erste', ageGroup: 'U19' })
    expect(result.success).toBe(true)
  })
})
