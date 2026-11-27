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
  | 'admin-login'
  | 'club-claim'
  | 'invite-campaign'
  | 'invite-redeem'
  | 'bank-import'
  | 'member-search'
  | 'join-request'
  | 'dm-message'
  | 'channel-message'
  | 'ownership-challenge'
  | 'otp-request'
  | 'otp-verify'
  | 'public-lookup'

type RateLimitWindow = Parameters<typeof Ratelimit.slidingWindow>[1]

/**
 * Per-IP ceilings layered on top of the per-second read/write tier for the
 * unauthenticated surface. The per-second tier alone lets one address send
 * 5 sign-in emails a second around the clock (the per-email cap does not help
 * when every request names a different address), or walk invite codes at 20
 * lookups a second. Sized so a whole squad onboarding from one clubhouse
 * Wi-Fi address still fits comfortably.
 */
const IP_WINDOW_POLICIES: Partial<
  Record<RateLimitType, { base: 'read' | 'write'; windows: Array<[number, RateLimitWindow]> }>
> = {
  'otp-request': {
    base: 'write',
    windows: [
      [60, '10 m'],
      [300, '1 d'],
    ],
  },
  'otp-verify': { base: 'write', windows: [[120, '10 m']] },
  'public-lookup': { base: 'read', windows: [[120, '1 m']] },
}

/** Sustained ceiling for callers without a valid session, per IP address. */
export const ANONYMOUS_REQUESTS_PER_MINUTE = 300

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
  private anonymousSustainedLimiter: Ratelimit | null = null
  private readonly ipWindowLimiters = new Map<RateLimitType, Ratelimit[]>()

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
    this.anonymousSustainedLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(ANONYMOUS_REQUESTS_PER_MINUTE, '1 m'),
      prefix: 'rl:anon-minute',
    })
    for (const [type, policy] of Object.entries(IP_WINDOW_POLICIES)) {
      this.ipWindowLimiters.set(
        type as RateLimitType,
        policy.windows.map(
          ([tokens, window]) =>
            new Ratelimit({
              redis,
              limiter: Ratelimit.slidingWindow(tokens, window),
              prefix: `rl:${type}:${window.replace(' ', '')}`,
            }),
        ),
      )
    }
    this.policyLimiters.set(
      'admin-login',
      new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, '15 m'),
        prefix: 'rl:admin-login',
      }),
    )
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
      'join-request',
      new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, '1 d'),
        prefix: 'rl:join-request',
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
    this.policyLimiters.set(
      'ownership-challenge',
      new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, '1 h'),
        prefix: 'rl:ownership-challenge',
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

    const baseType = IP_WINDOW_POLICIES[type]?.base ?? type
    const limiter =
      this.policyLimiters.get(baseType) ??
      (baseType === 'write' ? this.writeLimiter : this.readLimiter)
    if (!limiter) {
      return true
    }
    const callerIdentifier = getRateLimitIdentifier(request)
    const identifier =
      type === 'invite-redeem'
        ? getIpRateLimitIdentifier(request)
        : type === 'invite-campaign'
          ? getClubRateLimitIdentifier(request)
          : callerIdentifier

    const attempts = [limiter.limit(identifier)]
    const ipIdentifier = getIpRateLimitIdentifier(request)
    for (const ipLimiter of this.ipWindowLimiters.get(type) ?? []) {
      attempts.push(ipLimiter.limit(ipIdentifier))
    }
    // Signed-in callers already have their own per-user bucket. Everyone else
    // shares the small unauthenticated surface, so cap it per address too.
    if (this.anonymousSustainedLimiter && callerIdentifier.startsWith('anon:')) {
      attempts.push(this.anonymousSustainedLimiter.limit(ipIdentifier))
    }

    return applyRateLimitResults(context, await Promise.all(attempts))
  }
}

export function getClubRateLimitIdentifier(request: {
  params?: { clubId?: string }
  user?: { id?: string }
  headers?: Record<string, string | string[] | undefined>
  ip?: string
  socket?: { remoteAddress?: string }
}) {
  const clubId = request.params?.clubId?.trim()
  return clubId ? `club:${clubId}` : getRateLimitIdentifier(request)
}

function applyRateLimitResults(
  context: ExecutionContext,
  results: Array<{ success: boolean; remaining: number; reset: number }>,
) {
  // Advertise the limit the caller is closest to hitting, not a mix of several.
  const tightest = results.reduce((a, b) => (b.remaining < a.remaining ? b : a))
  const response = context.switchToHttp().getResponse()
  response.setHeader('X-RateLimit-Remaining', tightest.remaining.toString())
  response.setHeader('X-RateLimit-Reset', tightest.reset.toString())
  const blocked = results.filter((result) => !result.success)
  if (blocked.length > 0) {
    // Report the longest wait among the limits that actually tripped, so a
    // well-behaved client backs off for long enough to succeed on retry.
    const retryAt = Math.max(...blocked.map((result) => result.reset))
    const retryAfterSeconds = Math.max(1, Math.ceil((retryAt - Date.now()) / 1000))
    response.setHeader('Retry-After', retryAfterSeconds.toString())
    throw new RateLimitExceededError(`Rate limit exceeded. Try again in ${retryAfterSeconds}s`)
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
