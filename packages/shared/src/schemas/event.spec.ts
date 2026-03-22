import { createEventSchema } from './event'

describe('createEventSchema', () => {
  const futureDate = new Date(Date.now() + 86400000).toISOString()

  it('accepts valid event', () => {
    const result = createEventSchema.safeParse({
      title: 'Training',
      type: 'TRAINING',
      date: futureDate,
      teamId: 'team-123',
    })
    expect(result.success).toBe(true)
  })

  it('rejects short title', () => {
    const result = createEventSchema.safeParse({
      title: 'T',
      type: 'TRAINING',
      date: futureDate,
      teamId: 'team-123',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid event type', () => {
    const result = createEventSchema.safeParse({
      title: 'Training',
      type: 'INVALID',
      date: futureDate,
      teamId: 'team-123',
    })
    expect(result.success).toBe(false)
  })

  it('accepts all valid event types', () => {
    for (const type of ['TRAINING', 'MATCH', 'OTHER']) {
      const result = createEventSchema.safeParse({
        title: 'Test Event',
        type,
        date: futureDate,
        teamId: 'team-123',
      })
      expect(result.success).toBe(true)
    }
  })

  it('rejects past date', () => {
    const pastDate = new Date('2020-01-01').toISOString()
    const result = createEventSchema.safeParse({
      title: 'Training',
      type: 'TRAINING',
      date: pastDate,
      teamId: 'team-123',
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing teamId', () => {
    const result = createEventSchema.safeParse({
      title: 'Training',
      type: 'TRAINING',
      date: futureDate,
    })
    expect(result.success).toBe(false)
  })

  it('accepts optional location and notes', () => {
    const result = createEventSchema.safeParse({
      title: 'Training',
      type: 'TRAINING',
      date: futureDate,
      teamId: 'team-123',
      location: 'Sportplatz Am Wald',
      notes: 'Bring Schienbeinschoner',
    })
    expect(result.success).toBe(true)
  })
})
