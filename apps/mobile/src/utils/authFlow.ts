type VerificationAttempt = {
  status?: string | null
  createdSessionId?: string | null
  missingFields?: string[] | null
  unverifiedFields?: string[] | null
}

export type AuthVerificationFlow = 'sign-in' | 'sign-up'

export type UnsupportedVerificationResolution = {
  kind: 'unsupported'
  flow: AuthVerificationFlow
  status: string | null
  missingFields: string[]
  unverifiedFields: string[]
}

export type VerificationResolution =
  | {
      kind: 'session'
      sessionId: string
    }
  | UnsupportedVerificationResolution

const SUPPORTED_SIGN_UP_FIELDS = new Set(['emailAddress', 'email_address'])

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
}

export function getUnsupportedSignUpRequirements(attempt: VerificationAttempt) {
  const missingFields = unique(attempt.missingFields ?? []).filter(
    (field) => !SUPPORTED_SIGN_UP_FIELDS.has(field),
  )
  const unverifiedFields = unique(attempt.unverifiedFields ?? []).filter(
    (field) => !SUPPORTED_SIGN_UP_FIELDS.has(field),
  )

  return {
    missingFields,
    unverifiedFields,
  }
}

export function resolveVerificationAttempt(
  flow: AuthVerificationFlow,
  attempt: VerificationAttempt,
): VerificationResolution {
  if (attempt.createdSessionId) {
    return {
      kind: 'session',
      sessionId: attempt.createdSessionId,
    }
  }

  if (flow === 'sign-up') {
    const { missingFields, unverifiedFields } =
      getUnsupportedSignUpRequirements(attempt)

    return {
      kind: 'unsupported',
      flow,
      status: attempt.status ?? null,
      missingFields,
      unverifiedFields,
    }
  }

  return {
    kind: 'unsupported',
    flow,
    status: attempt.status ?? null,
    missingFields: [],
    unverifiedFields: [],
  }
}
