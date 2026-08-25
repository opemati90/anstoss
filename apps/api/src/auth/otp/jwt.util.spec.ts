import {
  DEFAULT_SESSION_TTL_SECONDS,
  JwtVerificationError,
  signSessionToken,
  verifySessionToken,
} from './jwt.util'

const SECRET = 'test-jwt-secret-0123456789'

describe('jwt.util', () => {
  beforeAll(() => {
    process.env.AUTH_JWT_SECRET = SECRET
  })

  it('round-trips sign → verify', () => {
    const token = signSessionToken('user_123')
    const claims = verifySessionToken(token)
    expect(claims.sub).toBe('user_123')
    expect(claims.exp - claims.iat).toBe(DEFAULT_SESSION_TTL_SECONDS)
    expect(claims.auth_time).toBe(claims.iat)
  })

  it('preserves the original authentication time when a session is refreshed', () => {
    const authenticatedAt = 1_700_000_000
    const token = signSessionToken('user_123', {
      now: (authenticatedAt + 3_600) * 1000,
      authenticatedAt,
    })
    expect(verifySessionToken(token, { now: (authenticatedAt + 3_601) * 1000 }).auth_time).toBe(
      authenticatedAt,
    )
  })

  it('rejects a tampered payload', () => {
    const token = signSessionToken('user_123')
    const [h, , s] = token.split('.')
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: 'attacker', iat: 0, exp: 9_999_999_999 }),
    )
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    const tampered = `${h}.${forgedPayload}.${s}`
    expect(() => verifySessionToken(tampered)).toThrow(JwtVerificationError)
  })

  it('rejects a token signed with a different secret', () => {
    const token = signSessionToken('user_123', { secret: 'other-secret' })
    expect(() => verifySessionToken(token)).toThrow('Invalid signature')
  })

  it('rejects an expired token', () => {
    const past = Date.now() - 60 * 60 * 1000
    const token = signSessionToken('user_123', { ttlSeconds: 1, now: past })
    expect(() => verifySessionToken(token)).toThrow('Token expired')
  })

  it('rejects a malformed token', () => {
    expect(() => verifySessionToken('not.a.jwt.at.all')).toThrow(
      JwtVerificationError,
    )
    expect(() => verifySessionToken('garbage')).toThrow('Malformed token')
  })

  it('throws when secret is unconfigured', () => {
    const saved = process.env.AUTH_JWT_SECRET
    delete process.env.AUTH_JWT_SECRET
    try {
      expect(() => signSessionToken('u')).toThrow('AUTH_JWT_SECRET')
    } finally {
      process.env.AUTH_JWT_SECRET = saved
    }
  })
})
