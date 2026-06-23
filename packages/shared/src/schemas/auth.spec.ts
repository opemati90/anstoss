import {
  registerSchema,
  getAge,
  MIN_AGE,
  completeOnboardingSchema,
  updateProfileSchema,
  claimPhoneSchema,
} from './auth'
import { RegistrationRole } from '../types/club-operations'

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

describe('completeOnboardingSchema', () => {
  const validProfile = {
    displayName: 'Max Müller',
    dateOfBirth: '1990-05-15',
  }
  const validCuid = 'clxabc1234567890abcdefghij'

  it('accepts CLUB_ADMIN with clubCreate', () => {
    const result = completeOnboardingSchema.safeParse({
      registrationRole: RegistrationRole.CLUB_ADMIN,
      profile: validProfile,
      clubCreate: {
        name: 'FC Berlin',
        primaryColor: '#1A1A18',
        firstTeamName: 'Herren I',
      },
    })
    expect(result.success).toBe(true)
  })

  it('rejects CLUB_ADMIN when clubCreate is missing', () => {
    const result = completeOnboardingSchema.safeParse({
      registrationRole: RegistrationRole.CLUB_ADMIN,
      profile: validProfile,
    })
    expect(result.success).toBe(false)
  })

  it('accepts FREE_AGENT with freeAgent payload', () => {
    const result = completeOnboardingSchema.safeParse({
      registrationRole: RegistrationRole.FREE_AGENT,
      profile: validProfile,
      freeAgent: {
        position: ['ST', 'LW'],
        experienceYears: 5,
        location: 'Berlin',
        availableForTrials: true,
        bio: 'Open to trials in Berlin area.',
      },
    })
    expect(result.success).toBe(true)
  })

  it('accepts PLAYER with join.inviteCode', () => {
    const result = completeOnboardingSchema.safeParse({
      registrationRole: RegistrationRole.PLAYER,
      profile: validProfile,
      join: { inviteCode: 'ABC123' },
    })
    expect(result.success).toBe(true)
  })

  it('accepts COACH with join.clubId (no inviteCode)', () => {
    const result = completeOnboardingSchema.safeParse({
      registrationRole: RegistrationRole.COACH,
      profile: validProfile,
      join: { clubId: validCuid },
    })
    expect(result.success).toBe(true)
  })

  it('rejects PLAYER when join has both inviteCode and clubId', () => {
    const result = completeOnboardingSchema.safeParse({
      registrationRole: RegistrationRole.PLAYER,
      profile: validProfile,
      join: { inviteCode: 'ABC123', clubId: validCuid },
    })
    expect(result.success).toBe(false)
  })

  it('rejects PLAYER when join has neither inviteCode nor clubId', () => {
    const result = completeOnboardingSchema.safeParse({
      registrationRole: RegistrationRole.PLAYER,
      profile: validProfile,
      join: {},
    })
    expect(result.success).toBe(false)
  })

  it('rejects profile.dateOfBirth under 16', () => {
    const today = new Date()
    const under16 = new Date(
      today.getFullYear() - 15,
      today.getMonth(),
      today.getDate(),
    )
    const result = completeOnboardingSchema.safeParse({
      registrationRole: RegistrationRole.PLAYER,
      profile: {
        displayName: 'Young Player',
        dateOfBirth: under16.toISOString().split('T')[0],
      },
      join: { inviteCode: 'ABC123' },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const flat = JSON.stringify(result.error.issues)
      expect(flat).toMatch(/dateOfBirth|16/)
    }
  })

  it('accepts PARENT with parentLink.approvalInviteCode', () => {
    const result = completeOnboardingSchema.safeParse({
      registrationRole: RegistrationRole.PARENT,
      profile: validProfile,
      parentLink: { approvalInviteCode: 'XYZ789' },
    })
    expect(result.success).toBe(true)
  })

  it('accepts PARENT with parentLink.childEmail', () => {
    const result = completeOnboardingSchema.safeParse({
      registrationRole: RegistrationRole.PARENT,
      profile: validProfile,
      parentLink: { childEmail: 'child@test.com' },
    })
    expect(result.success).toBe(true)
  })
})

describe('updateProfileSchema (PATCH /me)', () => {
  it('accepts a partial profile update', () => {
    const r = updateProfileSchema.safeParse({ name: 'New Name' })
    expect(r.success).toBe(true)
  })

  it('accepts an empty object (no-op patch)', () => {
    expect(updateProfileSchema.safeParse({}).success).toBe(true)
  })

  it('accepts a valid registrationRole enum value', () => {
    const r = updateProfileSchema.safeParse({
      registrationRole: RegistrationRole.COACH,
    })
    expect(r.success).toBe(true)
  })

  it('rejects an arbitrary string for registrationRole', () => {
    const r = updateProfileSchema.safeParse({ registrationRole: 'SUPER_ADMIN' })
    expect(r.success).toBe(false)
  })

  it('rejects unknown fields (strict) — no smuggling raw columns', () => {
    const r = updateProfileSchema.safeParse({ platformRole: 'PLATFORM_ADMIN' })
    expect(r.success).toBe(false)
  })

  it('rejects a malformed date of birth', () => {
    expect(updateProfileSchema.safeParse({ dateOfBirth: '15.05.1990' }).success).toBe(
      false,
    )
    expect(updateProfileSchema.safeParse({ dateOfBirth: 'not-a-date' }).success).toBe(
      false,
    )
  })

  it('accepts a YYYY-MM-DD date of birth', () => {
    expect(updateProfileSchema.safeParse({ dateOfBirth: '1990-05-15' }).success).toBe(
      true,
    )
  })

  it('rejects a non-URL avatarUrl', () => {
    expect(updateProfileSchema.safeParse({ avatarUrl: 'not a url' }).success).toBe(
      false,
    )
  })
})

describe('claimPhoneSchema', () => {
  it('accepts a plausible phone', () => {
    expect(claimPhoneSchema.safeParse({ phone: '+491234567' }).success).toBe(true)
  })

  it('rejects a too-short phone', () => {
    expect(claimPhoneSchema.safeParse({ phone: '123' }).success).toBe(false)
  })

  it('rejects a missing phone', () => {
    expect(claimPhoneSchema.safeParse({}).success).toBe(false)
  })
})
