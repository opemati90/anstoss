import { updateRsvpSchema } from './rsvp'

describe('updateRsvpSchema', () => {
  it('accepts YES', () => {
    expect(updateRsvpSchema.safeParse({ status: 'YES' }).success).toBe(true)
  })

  it('accepts MAYBE', () => {
    expect(updateRsvpSchema.safeParse({ status: 'MAYBE' }).success).toBe(true)
  })

  it('accepts NO', () => {
    expect(updateRsvpSchema.safeParse({ status: 'NO' }).success).toBe(true)
  })

  it('rejects invalid status', () => {
    expect(updateRsvpSchema.safeParse({ status: 'BANANA' }).success).toBe(false)
  })

  it('rejects empty', () => {
    expect(updateRsvpSchema.safeParse({}).success).toBe(false)
  })
})

describe('rsvp reasons and notes', () => {
  it('accepts every reason chip, including suspended', () => {
    for (const reason of ['injured', 'sick', 'work', 'vacation', 'personal', 'suspended', 'other']) {
      expect(updateRsvpSchema.safeParse({ status: 'NO', reason }).success).toBe(true)
    }
  })

  it('maps the legacy injury spelling to injured', () => {
    const parsed = updateRsvpSchema.parse({ status: 'NO', reason: 'injury' })
    expect(parsed.reason).toBe('injured')
  })

  it('rejects unknown reasons', () => {
    expect(updateRsvpSchema.safeParse({ status: 'NO', reason: 'hangover' }).success).toBe(false)
  })

  it('accepts a short note and rejects one over 200 chars', () => {
    expect(updateRsvpSchema.safeParse({ status: 'NO', note: 'Knie zwickt' }).success).toBe(true)
    expect(updateRsvpSchema.safeParse({ status: 'NO', note: 'x'.repeat(201) }).success).toBe(false)
  })

  it('accepts a childUserId for parents', () => {
    expect(updateRsvpSchema.safeParse({ status: 'YES', childUserId: 'kid-1' }).success).toBe(true)
  })
})
