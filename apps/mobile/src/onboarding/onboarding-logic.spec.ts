import '../../test/future-capabilities'

import { RegistrationRole } from '@anstoss/shared'
import { validateDob } from './DateOfBirthInput'
import { buildJoinProfilePatch, joinErrorKey } from './joinClub'
import { inviteRedeemError, retryAfterSeconds, verifyCodeError } from './errors'
import { needsDateOfBirth, needsDisplayName, resolveSignedInRoute } from './routing'
import { computeKeyboardInset } from './ui'
import { ApiError } from '../api/client'

jest.mock('react-native-keyboard-controller', () => require('react-native-keyboard-controller/jest'))

describe('needsDisplayName / needsDateOfBirth', () => {
  it('flags the name the server derives from the email', () => {
    expect(needsDisplayName({ email: 'Tim.Weber@x.de', name: 'tim.weber' })).toBe(true)
    expect(needsDisplayName({ email: 'tim@x.de', name: 'Tim Weber' })).toBe(false)
    expect(needsDisplayName({ email: 'tim@x.de', name: ' ' })).toBe(true)
  })

  it('asks every new account for a DOB; only a legacy 16+ declaration is exempt (B1)', () => {
    expect(needsDateOfBirth({ name: 'Tim Weber', dateOfBirth: null })).toBe(true)
    expect(needsDateOfBirth({ name: 'Tim Weber', dateOfBirth: '1998-05-15' })).toBe(false)
    expect(needsDateOfBirth({ name: 'Tim Weber', adultConfirmedAt: '2026-08-01' })).toBe(false)
  })
})

describe('resolveSignedInRoute', () => {
  const base = {
    user: {
      email: 'a@b.de',
      name: 'Lukas Hoffmann',
      registrationRole: 'PLAYER',
      dateOfBirth: '1998-05-15',
    },
    memberships: [],
    ageGate: null,
    pendingJoinRequest: null,
    pendingClubClaim: null,
  }

  it('blocks and parent-approval gates win over everything', () => {
    expect(resolveSignedInRoute({ ...base, ageGate: { status: 'BLOCKED' } })).toBe('/access-blocked')
    expect(resolveSignedInRoute({ ...base, ageGate: { status: 'PENDING_PARENT_APPROVAL' } })).toBe(
      '/pending-approval',
    )
  })

  it('H1: checks a saved invite before memberships', () => {
    expect(
      resolveSignedInRoute({ ...base, memberships: [{ id: 'm' }], pendingInviteCode: 'E2EINV01' }),
    ).toBe('/join/E2EINV01')
    expect(resolveSignedInRoute({ ...base, memberships: [{ id: 'm' }] })).toBe('/(tabs)')
  })

  it('B1: a name without a DOB still goes to "Wie heißt du?"', () => {
    expect(
      resolveSignedInRoute({ ...base, user: { ...base.user, dateOfBirth: null } }),
    ).toBe('/(auth)/name')
  })

  it('routes the intents after the profile, not through it', () => {
    expect(resolveSignedInRoute({ ...base, intent: 'free-agent' })).toBe('/(auth)/free-agent-profile')
    expect(resolveSignedInRoute({ ...base, intent: 'parent-handoff' })).toBe('/(auth)/parent-handoff')
    expect(
      resolveSignedInRoute({ ...base, user: { ...base.user, dateOfBirth: null }, intent: 'free-agent' }),
    ).toBe('/(auth)/name')
  })
})

describe('buildJoinProfilePatch', () => {
  it('only writes the role when it changes, never a DOB or a 16+ declaration', () => {
    expect(buildJoinProfilePatch('PLAYER', 'PLAYER')).toEqual({})
    expect(buildJoinProfilePatch('PARENT', 'PLAYER')).toEqual({
      registrationRole: RegistrationRole.PARENT,
    })
    // H3: a role left over from an abandoned club setup is changed, not kept.
    expect(buildJoinProfilePatch('COACH', 'CLUB_ADMIN')).toEqual({
      registrationRole: RegistrationRole.COACH,
    })
  })
})

describe('joinErrorKey', () => {
  it('names a duplicate request and a locked role specifically', () => {
    expect(joinErrorKey(new ApiError('dup', 409))).toBe('onboardingFlow.club.alreadyRequested')
    expect(joinErrorKey(new ApiError('x', 400, 'ROLE_LOCKED'))).toBe('onboardingFlow.club.roleLocked')
    expect(joinErrorKey(new ApiError('Network', 0, 'network_error'))).toBe(
      'onboardingFlow.common.networkError',
    )
  })
})

describe('verifyCodeError (M1)', () => {
  it('tells a wrong code from a locked code, the hourly cap and the rate limit', () => {
    expect(verifyCodeError(new ApiError('Invalid or expired code', 401)).key).toBe(
      'onboardingFlow.code.wrong',
    )
    expect(verifyCodeError(new ApiError('Too many', 429, 'OTP_CODE_LOCKED'))).toEqual({
      key: 'onboardingFlow.code.codeLocked',
      resendNow: true,
    })
    const cap = new ApiError('Too many', 429, 'OTP_HOURLY_CAP', {
      error: { code: 'OTP_HOURLY_CAP', retryAfterSeconds: 1500 },
    })
    expect(retryAfterSeconds(cap)).toBe(1500)
    expect(verifyCodeError(cap)).toEqual({
      key: 'onboardingFlow.code.hourlyCap',
      values: { count: 25 },
    })
    expect(verifyCodeError(new ApiError('Rate', 429, 'RATE_LIMIT_EXCEEDED')).key).toBe(
      'onboardingFlow.code.tooManyAttempts',
    )
    expect(verifyCodeError(new ApiError('x', 403, 'UNDERAGE_EMAIL_BLOCKED')).key).toBe(
      'onboardingFlow.code.underageBlocked',
    )
    expect(verifyCodeError(new TypeError('offline')).key).toBe('onboardingFlow.common.networkError')
  })
})

describe('inviteRedeemError (M9)', () => {
  it('maps by status and code, never by English message text', () => {
    // The English text alone must not decide anything.
    expect(inviteRedeemError(new ApiError('different email', 400))).toEqual({
      kind: 'error',
      key: 'onboardingFlow.invite.usedBody',
    })
    expect(inviteRedeemError(new ApiError('x', 403, 'INVITE_RECIPIENT_MISMATCH'))).toEqual({
      kind: 'mismatch',
    })
    expect(inviteRedeemError(new ApiError('x', 409, 'ALREADY_MEMBER'))).toEqual({
      kind: 'alreadyMember',
    })
    expect(inviteRedeemError(new ApiError('x', 500))).toEqual({
      kind: 'error',
      key: 'onboardingFlow.invite.redeemFailed',
    })
  })
})

describe('computeKeyboardInset (M8)', () => {
  it('is the keyboard height on edge-to-edge (window does not shrink)', () => {
    expect(computeKeyboardInset(336, 844, 844)).toBe(336)
  })

  it('is 0 when the platform already resized the window by the keyboard', () => {
    expect(computeKeyboardInset(300, 780, 480)).toBe(0)
  })

  it('covers only what a partial resize did not absorb', () => {
    expect(computeKeyboardInset(320, 780, 700)).toBe(240)
  })

  it('is 0 without a keyboard', () => {
    expect(computeKeyboardInset(0, 780, 780)).toBe(0)
    expect(computeKeyboardInset(Number.NaN, 780, 780)).toBe(0)
  })
})

describe('validateDob', () => {
  const now = new Date(2026, 8, 24)
  it('accepts real dates and computes the age', () => {
    expect(validateDob({ day: '24', month: '9', year: '2010' }, now)).toEqual({
      status: 'valid',
      iso: '2010-09-24',
      age: 16,
    })
    expect(validateDob({ day: '25', month: '09', year: '2010' }, now)).toMatchObject({ age: 15 })
  })

  it('rejects impossible and future dates', () => {
    expect(validateDob({ day: '31', month: '02', year: '2000' }, now).status).toBe('invalid')
    expect(validateDob({ day: '01', month: '01', year: '2030' }, now).status).toBe('future')
    expect(validateDob({ day: '1', month: '1', year: '20' }, now).status).toBe('incomplete')
  })
})
