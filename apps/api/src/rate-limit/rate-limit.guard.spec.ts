import { Reflector } from '@nestjs/core'
import { RateLimitGuard } from './rate-limit.guard'

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
