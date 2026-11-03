import { rsvpReasonSchema, updateRsvpSchema } from './rsvp'

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
  it('does not collect explanations in the public release', () => {
    for (const reason of ['injured', 'sick', 'work', 'vacation', 'personal', 'suspended', 'other']) {
      expect(updateRsvpSchema.safeParse({ status: 'NO', reason }).success).toBe(false)
    }
  })

  it('maps the legacy injury spelling to injured', () => {
    expect(rsvpReasonSchema.parse('injury')).toBe('injured')
    expect(updateRsvpSchema.safeParse({ status: 'NO', reason: 'injury' }).success).toBe(false)
  })

  it('rejects unknown reasons', () => {
    expect(updateRsvpSchema.safeParse({ status: 'NO', reason: 'hangover' }).success).toBe(false)
  })

  it('rejects free-text notes while allowing an empty legacy value', () => {
    expect(updateRsvpSchema.safeParse({ status: 'NO', note: 'Knie zwickt' }).success).toBe(false)
    expect(updateRsvpSchema.safeParse({ status: 'NO', note: '' }).success).toBe(true)
    expect(updateRsvpSchema.safeParse({ status: 'NO', note: 'x'.repeat(201) }).success).toBe(false)
  })

  it('accepts a childUserId for parents', () => {
    expect(updateRsvpSchema.safeParse({ status: 'YES', childUserId: 'kid-1' }).success).toBe(true)
  })
})
