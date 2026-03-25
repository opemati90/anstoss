import {
  getUnsupportedSignUpRequirements,
  resolveVerificationAttempt,
} from './authFlow'

describe('authFlow helpers', () => {
  it('returns a session when sign-in verification completes', () => {
    expect(
      resolveVerificationAttempt('sign-in', {
        status: 'complete',
        createdSessionId: 'sess_sign_in',
      }),
    ).toEqual({
      kind: 'session',
      sessionId: 'sess_sign_in',
    })
  })

  it('returns a session when sign-up verification completes', () => {
    expect(
      resolveVerificationAttempt('sign-up', {
        status: 'complete',
        createdSessionId: 'sess_sign_up',
      }),
    ).toEqual({
      kind: 'session',
      sessionId: 'sess_sign_up',
    })
  })

  it('flags unsupported sign-up requirements that the mobile flow does not collect', () => {
    expect(
      getUnsupportedSignUpRequirements({
        status: 'missing_requirements',
        missingFields: ['first_name', 'email_address'],
        unverifiedFields: ['email_address'],
      }),
    ).toEqual({
      missingFields: ['first_name'],
      unverifiedFields: [],
    })
  })

  it('surfaces unsupported sign-up verification states instead of pretending they are complete', () => {
    expect(
      resolveVerificationAttempt('sign-up', {
        status: 'missing_requirements',
        missingFields: ['first_name'],
        unverifiedFields: ['email_address'],
      }),
    ).toEqual({
      kind: 'unsupported',
      flow: 'sign-up',
      status: 'missing_requirements',
      missingFields: ['first_name'],
      unverifiedFields: [],
    })
  })

  it('surfaces unsupported sign-in verification states with the returned status', () => {
    expect(
      resolveVerificationAttempt('sign-in', {
        status: 'needs_second_factor',
        createdSessionId: null,
      }),
    ).toEqual({
      kind: 'unsupported',
      flow: 'sign-in',
      status: 'needs_second_factor',
      missingFields: [],
      unverifiedFields: [],
    })
  })
})
