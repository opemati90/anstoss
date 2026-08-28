import { Reflector } from '@nestjs/core'
import {
  RateLimitGuard,
  getClubRateLimitIdentifier,
  getRateLimitIdentifier,
  inferRateLimitTypeFromMethod,
} from './rate-limit.guard'
import { signSessionToken } from '../auth/otp/jwt.util'

describe('RateLimitGuard', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('skips rate limiting in local development when Upstash config is missing', async () => {
    delete process.env.UPSTASH_REDIS_URL
    delete process.env.UPSTASH_REDIS_TOKEN
    process.env.NODE_ENV = 'development'

    const reflector = {
      getAllAndOverride: jest.fn(() => 'write'),
    } as unknown as Reflector
    const response = {
      setHeader: jest.fn(),
    }
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: 'user-1' },
        }),
        getResponse: () => response,
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as any

    const guard = new RateLimitGuard(reflector)

    await expect(guard.canActivate(context)).resolves.toBe(true)
    expect(response.setHeader).not.toHaveBeenCalled()
  })

  it('fails fast in production when Upstash config is missing', () => {
    delete process.env.UPSTASH_REDIS_URL
    delete process.env.UPSTASH_REDIS_TOKEN
    process.env.NODE_ENV = 'production'

    expect(
      () =>
        new RateLimitGuard({
          getAllAndOverride: jest.fn(),
        } as unknown as Reflector),
    ).toThrow('UPSTASH_REDIS_URL and UPSTASH_REDIS_TOKEN are required in production')
  })
})

describe('getRateLimitIdentifier', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('keys authenticated requests on the user id', () => {
    expect(getRateLimitIdentifier({ user: { id: 'user-1' }, ip: '1.2.3.4' })).toBe(
      'user:user-1',
    )
  })

  it('keys a verified bearer session on its user before the auth guard runs', () => {
    process.env.AUTH_JWT_SECRET = 'r'.repeat(40)
    const token = signSessionToken('user-from-token')

    expect(
      getRateLimitIdentifier({
        headers: { authorization: `Bearer ${token}` },
        ip: '203.0.113.9',
      }),
    ).toBe('user:user-from-token')
  })

  it('does not trust a tampered bearer token for the user bucket', () => {
    process.env.AUTH_JWT_SECRET = 'r'.repeat(40)
    const token = signSessionToken('user-from-token') + 'tampered'

    expect(
      getRateLimitIdentifier({
        headers: { authorization: `Bearer ${token}` },
        ip: '203.0.113.9',
      }),
    ).toBe('anon:203.0.113.9')
  })

  it('keys anonymous requests on req.ip (the trusted edge IP)', () => {
    expect(getRateLimitIdentifier({ ip: '203.0.113.9' })).toBe('anon:203.0.113.9')
  })

  it('ignores spoofable proxy headers outside Railway', () => {
    delete process.env.RAILWAY_ENVIRONMENT_ID
    const id = getRateLimitIdentifier({
      ip: '203.0.113.9',
      headers: {
        'x-forwarded-for': '9.9.9.9',
        'x-real-ip': '8.8.8.8',
      },
    })
    expect(id).toBe('anon:203.0.113.9')
  })

  it('uses Railways documented stable client IP in a Railway deployment', () => {
    process.env.RAILWAY_ENVIRONMENT_ID = 'production-env'

    expect(
      getRateLimitIdentifier({
        ip: '100.64.1.18',
        headers: { 'x-real-ip': '203.0.113.9' },
      }),
    ).toBe('anon:203.0.113.9')
  })

  it('rejects malformed Railway client IP headers', () => {
    process.env.RAILWAY_ENVIRONMENT_ID = 'production-env'

    expect(
      getRateLimitIdentifier({
        ip: '100.64.1.18',
        headers: { 'x-real-ip': 'attacker-controlled' },
      }),
    ).toBe('anon:100.64.1.18')
  })

  it('falls back to socket.remoteAddress, then anonymous', () => {
    expect(getRateLimitIdentifier({ socket: { remoteAddress: '10.0.0.1' } })).toBe(
      'anon:10.0.0.1',
    )
    expect(getRateLimitIdentifier({})).toBe('anon:anonymous')
  })
})

describe('getClubRateLimitIdentifier', () => {
  it('uses the authenticated route parameter and ignores a spoofed club header', () => {
    expect(
      getClubRateLimitIdentifier({
        params: { clubId: 'real-club' },
        headers: { 'x-club-id': 'rotating-attacker-value' },
        user: { id: 'admin-1' },
      }),
    ).toBe('club:real-club')
  })

  it('falls back to the authenticated caller when a route has no club parameter', () => {
    expect(getClubRateLimitIdentifier({ user: { id: 'admin-1' } })).toBe('user:admin-1')
  })
})

describe('inferRateLimitTypeFromMethod', () => {
  it('uses write limits for state-changing HTTP methods', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'post']) {
      expect(inferRateLimitTypeFromMethod(method)).toBe('write')
    }
  })

  it('uses read limits for safe or unknown methods', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS', undefined]) {
      expect(inferRateLimitTypeFromMethod(method)).toBe('read')
    }
  })
})
