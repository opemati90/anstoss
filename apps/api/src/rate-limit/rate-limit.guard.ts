import { CanActivate, ExecutionContext, Injectable, Logger, SetMetadata } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { RateLimitExceededError, RATE_LIMIT } from '@anstoss/shared'
import { isIP } from 'node:net'
import { verifySessionToken } from '../auth/otp/jwt.util'

export const RATE_LIMIT_KEY = 'rateLimit'

export type RateLimitType =
  | 'read'
  | 'write'
  | 'club-claim'
  | 'invite-campaign'
  | 'invite-redeem'
  | 'bank-import'
  | 'member-search'
  | 'dm-message'
  | 'channel-message'

/**
 * Decorator: mark an endpoint as read or write for rate limiting.
 * Defaults to 'read' if not specified.
 *
 * Usage:
 *   @RateLimit('write')
 *   @Post('events')
 *   createEvent() { ... }
 */
export const RateLimit = (type: RateLimitType) => SetMetadata(RATE_LIMIT_KEY, type)

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name)
  private readLimiter: Ratelimit | null = null
  private writeLimiter: Ratelimit | null = null
  private readonly policyLimiters = new Map<RateLimitType, Ratelimit>()
  private clubClaimUserLimiter: Ratelimit | null = null
  private clubClaimIpLimiter: Ratelimit | null = null

  constructor(private readonly reflector: Reflector) {
    const redisUrl = process.env.UPSTASH_REDIS_URL?.trim()
    const redisToken = process.env.UPSTASH_REDIS_TOKEN?.trim()

    if (!redisUrl || !redisToken) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('UPSTASH_REDIS_URL and UPSTASH_REDIS_TOKEN are required in production')
      }

      this.logger.warn(
        'UPSTASH_REDIS_URL/TOKEN not set — rate limiting disabled for local development',
      )
      return
    }

    const redis = new Redis({
      url: redisUrl,
      token: redisToken,
    })

    this.readLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(RATE_LIMIT.READS_PER_SECOND, '1 s'),
      prefix: 'rl:read',
    })

    this.writeLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(RATE_LIMIT.WRITES_PER_SECOND, '1 s'),
      prefix: 'rl:write',
    })
    this.clubClaimUserLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(3, '1 d'),
      prefix: 'rl:club-claim-user',
    })
    this.clubClaimIpLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, '1 d'),
      prefix: 'rl:club-claim-ip',
    })
    this.policyLimiters.set(
      'invite-campaign',
      new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, '1 h'),
        prefix: 'rl:invite-campaign',
      }),
    )
    this.policyLimiters.set(
      'invite-redeem',
      new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, '1 m'),
        prefix: 'rl:invite-redeem',
      }),
    )
    this.policyLimiters.set(
      'bank-import',
      new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, '1 h'),
        prefix: 'rl:bank-import',
      }),
    )
    this.policyLimiters.set(
      'member-search',
      new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(30, '1 m'),
        prefix: 'rl:member-search',
      }),
    )
    this.policyLimiters.set(
      'dm-message',
      new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(30, '1 m'),
        prefix: 'rl:dm-message',
      }),
    )
    this.policyLimiters.set(
      'channel-message',
      new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(60, '1 m'),
        prefix: 'rl:channel-message',
      }),
    )
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()

    const type =
      this.reflector.getAllAndOverride<RateLimitType | undefined>(RATE_LIMIT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) || inferRateLimitTypeFromMethod(request.method)

    if (type === 'club-claim' && this.clubClaimUserLimiter && this.clubClaimIpLimiter) {
      const userIdentifier = getRateLimitIdentifier(request)
      const attempts = [this.clubClaimIpLimiter.limit(getIpRateLimitIdentifier(request))]
      if (userIdentifier.startsWith('user:')) {
        attempts.push(this.clubClaimUserLimiter.limit(userIdentifier))
      }
      const results = await Promise.all(attempts)
      return applyRateLimitResults(context, results)
    }

    const limiter =
      this.policyLimiters.get(type) ?? (type === 'write' ? this.writeLimiter : this.readLimiter)
    if (!limiter) {
      return true
    }
    const identifier =
      type === 'invite-redeem'
        ? getIpRateLimitIdentifier(request)
        : type === 'invite-campaign'
          ? `club:${readHeader(request.headers, 'x-club-id') || getRateLimitIdentifier(request)}`
          : getRateLimitIdentifier(request)

    const { success, remaining, reset } = await limiter.limit(identifier)

    // Set rate limit headers
    const response = context.switchToHttp().getResponse()
    response.setHeader('X-RateLimit-Remaining', remaining.toString())
    response.setHeader('X-RateLimit-Reset', reset.toString())

    if (!success) {
      throw new RateLimitExceededError(
        `Rate limit exceeded. Try again in ${Math.ceil((reset - Date.now()) / 1000)}s`,
      )
    }

    return true
  }
}

function applyRateLimitResults(
  context: ExecutionContext,
  results: Array<{ success: boolean; remaining: number; reset: number }>,
) {
  const remaining = Math.min(...results.map((result) => result.remaining))
  const reset = Math.max(...results.map((result) => result.reset))
  const response = context.switchToHttp().getResponse()
  response.setHeader('X-RateLimit-Remaining', remaining.toString())
  response.setHeader('X-RateLimit-Reset', reset.toString())
  if (results.some((result) => !result.success)) {
    throw new RateLimitExceededError(
      `Rate limit exceeded. Try again in ${Math.ceil((reset - Date.now()) / 1000)}s`,
    )
  }
  return true
}

export function getRateLimitIdentifier(request: {
  user?: { id?: string }
  headers?: Record<string, string | string[] | undefined>
  ip?: string
  socket?: { remoteAddress?: string }
}) {
  const userId = request.user?.id
  if (userId) {
    return `user:${userId}`
  }

  // APP_GUARDs run before controller-scoped authentication guards. Verify a
  // valid session token here so authenticated callers receive a real per-user
  // bucket instead of sharing the anonymous IP bucket with everyone behind
  // the same carrier/NAT. Invalid/expired tokens fall through to the IP tier;
  // the auth guard still returns the eventual 401.
  const authorization = readHeader(request.headers, 'authorization')
  if (authorization?.startsWith('Bearer ')) {
    try {
      const claims = verifySessionToken(authorization.slice(7))
      return `user:${claims.sub}`
    } catch {
      // Treat unverifiable credentials as anonymous for rate limiting.
    }
  }

  // Railway documents X-Real-IP as the original client address. `req.ip` with
  // trust-proxy=1 resolves to a changing internal Railway hop in production,
  // which creates a fresh bucket across requests. Only trust X-Real-IP when
  // Railway's deployment metadata is present; local/direct callers cannot opt
  // into this path by spoofing a header.
  return getIpRateLimitIdentifier(request)
}

export function getIpRateLimitIdentifier(request: {
  headers?: Record<string, string | string[] | undefined>
  ip?: string
  socket?: { remoteAddress?: string }
}) {
  const railwayRealIp = process.env.RAILWAY_ENVIRONMENT_ID
    ? readHeader(request.headers, 'x-real-ip')
    : undefined
  const candidate =
    (railwayRealIp && isIP(railwayRealIp) ? railwayRealIp : undefined) ||
    request.ip ||
    request.socket?.remoteAddress ||
    'anonymous'

  return `anon:${String(candidate).trim()}`
}

function readHeader(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string,
): string | undefined {
  const value = headers?.[name] ?? headers?.[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

export function inferRateLimitTypeFromMethod(method: unknown): RateLimitType {
  const normalized = typeof method === 'string' ? method.toUpperCase() : 'GET'
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(normalized) ? 'write' : 'read'
}
