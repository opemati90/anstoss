import { Reflector } from '@nestjs/core'
import { RateLimitExceededError } from '@anstoss/shared'

type LimitResult = { success: boolean; remaining: number; reset: number }

const limitCalls: Array<{ prefix: string; identifier: string }> = []
const blockedPrefixes = new Set<string>()
const NOW = 1_800_000_000_000

jest.mock('@upstash/redis', () => ({ Redis: jest.fn() }))
jest.mock('@upstash/ratelimit', () => {
  class Ratelimit {
    static slidingWindow(tokens: number, window: string) {
      return { tokens, window }
    }
    private readonly prefix: string
    constructor(options: { prefix: string }) {
      this.prefix = options.prefix
    }
    async limit(identifier: string): Promise<LimitResult> {
      limitCalls.push({ prefix: this.prefix, identifier })
      const blocked = blockedPrefixes.has(this.prefix)
      return {
        success: !blocked,
        remaining: blocked ? 0 : 7,
        // The daily window resets far later than the short ones.
        reset: NOW + (this.prefix.endsWith('1d') ? 3_600_000 : 30_000),
      }
    }
  }
  return { Ratelimit }
})

import { RateLimitGuard, type RateLimitType } from './rate-limit.guard'
import { signSessionToken } from '../auth/otp/jwt.util'

function buildContext(type: RateLimitType | undefined, request: Record<string, unknown>) {
  const response = { setHeader: jest.fn() }
  const reflector = { getAllAndOverride: jest.fn(() => type) } as unknown as Reflector
  const context = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    getHandler: jest.fn(),
    getClass: jest.fn(),
  } as any
  return { guard: new RateLimitGuard(reflector), context, response }
}

describe('RateLimitGuard per-IP policies', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    limitCalls.length = 0
    blockedPrefixes.clear()
    process.env.UPSTASH_REDIS_URL = 'https://example.upstash.io'
    process.env.UPSTASH_REDIS_TOKEN = 'token'
    process.env.AUTH_JWT_SECRET = 'x'.repeat(64)
    jest.spyOn(Date, 'now').mockReturnValue(NOW)
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    jest.restoreAllMocks()
  })

  it('charges a sign-in code request against the per-second, 10-minute, daily and anonymous buckets', async () => {
    const { guard, context } = buildContext('otp-request', { method: 'POST', ip: '203.0.113.9' })

    await expect(guard.canActivate(context)).resolves.toBe(true)

    expect(limitCalls).toEqual([
      { prefix: 'rl:write', identifier: 'anon:203.0.113.9' },
      { prefix: 'rl:otp-request:10m', identifier: 'anon:203.0.113.9' },
      { prefix: 'rl:otp-request:1d', identifier: 'anon:203.0.113.9' },
      { prefix: 'rl:anon-minute', identifier: 'anon:203.0.113.9' },
    ])
  })

  it('rejects a sign-in code request once the daily per-IP ceiling is spent and tells the client how long to wait', async () => {
    blockedPrefixes.add('rl:otp-request:1d')
    const { guard, context, response } = buildContext('otp-request', {
      method: 'POST',
      ip: '203.0.113.9',
    })

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(RateLimitExceededError)
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '3600')
    expect(response.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '0')
  })

  it('keys the per-IP ceilings on the address even when the caller is signed in', async () => {
    const token = signSessionToken('user-1')
    const { guard, context } = buildContext('otp-verify', {
      method: 'POST',
      ip: '203.0.113.9',
      headers: { authorization: `Bearer ${token}` },
    })

    await guard.canActivate(context)

    expect(limitCalls).toEqual([
      { prefix: 'rl:write', identifier: 'user:user-1' },
      { prefix: 'rl:otp-verify:10m', identifier: 'anon:203.0.113.9' },
    ])
  })

  it('caps invite lookups per address on top of the read tier', async () => {
    const { guard, context } = buildContext('public-lookup', { method: 'GET', ip: '203.0.113.9' })

    await guard.canActivate(context)

    expect(limitCalls.map((call) => call.prefix)).toEqual([
      'rl:read',
      'rl:public-lookup:1m',
      'rl:anon-minute',
    ])
  })

  it('applies the anonymous per-minute ceiling to ordinary unauthenticated requests', async () => {
    blockedPrefixes.add('rl:anon-minute')
    const { guard, context, response } = buildContext(undefined, {
      method: 'GET',
      ip: '203.0.113.9',
    })

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(RateLimitExceededError)
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '30')
  })

  it('leaves signed-in callers on their per-user bucket only', async () => {
    const { guard, context, response } = buildContext(undefined, {
      method: 'GET',
      user: { id: 'user-1' },
      ip: '203.0.113.9',
    })

    await expect(guard.canActivate(context)).resolves.toBe(true)
    expect(limitCalls).toEqual([{ prefix: 'rl:read', identifier: 'user:user-1' }])
    expect(response.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '7')
    expect(response.setHeader).not.toHaveBeenCalledWith('Retry-After', expect.anything())
  })
})
