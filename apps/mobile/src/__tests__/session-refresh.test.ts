import {
  shouldRefreshSession,
  SESSION_REFRESH_THRESHOLD_MS,
} from '../context/AuthContext'

/**
 * Builds an unsigned JWT-shaped string with the given `exp` (seconds). The
 * signature segment is irrelevant — shouldRefreshSession decodes the payload
 * without verifying (it only needs the expiry to decide on a refresh).
 */
function makeToken(expSeconds: number): string {
  const b64url = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: 'u1', exp: expSeconds })}.sig`
}

describe('shouldRefreshSession', () => {
  const now = 1_700_000_000_000 // fixed "now" in ms
  const nowSec = Math.floor(now / 1000)

  it('returns false when plenty of life remains (fresh 30-day token)', () => {
    const token = makeToken(nowSec + 30 * 24 * 60 * 60)
    expect(shouldRefreshSession(token, SESSION_REFRESH_THRESHOLD_MS, now)).toBe(false)
  })

  it('returns true when within the 7-day refresh window', () => {
    const token = makeToken(nowSec + 3 * 24 * 60 * 60) // 3 days left
    expect(shouldRefreshSession(token, SESSION_REFRESH_THRESHOLD_MS, now)).toBe(true)
  })

  it('returns false for an already-expired token (let 401 path handle it)', () => {
    const token = makeToken(nowSec - 60)
    expect(shouldRefreshSession(token, SESSION_REFRESH_THRESHOLD_MS, now)).toBe(false)
  })

  it('returns false for a null token', () => {
    expect(shouldRefreshSession(null, SESSION_REFRESH_THRESHOLD_MS, now)).toBe(false)
  })

  it('returns false for a malformed token (no exp / wrong shape)', () => {
    expect(shouldRefreshSession('garbage', SESSION_REFRESH_THRESHOLD_MS, now)).toBe(
      false,
    )
    const noExp = `${Buffer.from('{}').toString('base64')}.${Buffer.from(
      JSON.stringify({ sub: 'u1' }),
    ).toString('base64')}.sig`
    expect(shouldRefreshSession(noExp, SESSION_REFRESH_THRESHOLD_MS, now)).toBe(false)
  })

  it('respects the boundary just inside the window', () => {
    const token = makeToken(nowSec + 7 * 24 * 60 * 60 - 60) // ~1 min inside
    expect(shouldRefreshSession(token, SESSION_REFRESH_THRESHOLD_MS, now)).toBe(true)
  })
})
