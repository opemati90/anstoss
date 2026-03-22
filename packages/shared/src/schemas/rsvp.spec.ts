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
