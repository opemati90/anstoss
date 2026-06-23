import { Reflector } from '@nestjs/core'
import { RateLimitGuard, getRateLimitIdentifier } from './rate-limit.guard'

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
  it('keys authenticated requests on the user id', () => {
    expect(getRateLimitIdentifier({ user: { id: 'user-1' }, ip: '1.2.3.4' })).toBe(
      'user:user-1',
    )
  })

  it('keys anonymous requests on req.ip (the trusted edge IP)', () => {
    expect(getRateLimitIdentifier({ ip: '203.0.113.9' })).toBe('anon:203.0.113.9')
  })

  it('ignores spoofable x-forwarded-for / x-real-ip headers', () => {
    // An attacker rotating these headers must NOT rotate the rate-limit key;
    // only the Express-resolved req.ip counts.
    const id = getRateLimitIdentifier({
      ip: '203.0.113.9',
      // headers are intentionally not part of the identifier anymore
      ...({
        headers: {
          'x-forwarded-for': '9.9.9.9',
          'x-real-ip': '8.8.8.8',
        },
      } as any),
    })
    expect(id).toBe('anon:203.0.113.9')
  })

  it('falls back to socket.remoteAddress, then anonymous', () => {
    expect(getRateLimitIdentifier({ socket: { remoteAddress: '10.0.0.1' } })).toBe(
      'anon:10.0.0.1',
    )
    expect(getRateLimitIdentifier({})).toBe('anon:anonymous')
  })
})
