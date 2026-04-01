import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  SetMetadata,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { RateLimitExceededError, RATE_LIMIT } from '@anstoss/shared'

export const RATE_LIMIT_KEY = 'rateLimit'

export type RateLimitType = 'read' | 'write'

/**
 * Decorator: mark an endpoint as read or write for rate limiting.
 * Defaults to 'read' if not specified.
 *
 * Usage:
 *   @RateLimit('write')
 *   @Post('events')
 *   createEvent() { ... }
 */
export const RateLimit = (type: RateLimitType) =>
  SetMetadata(RATE_LIMIT_KEY, type)

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name)
  private readLimiter: Ratelimit | null = null
  private writeLimiter: Ratelimit | null = null

  constructor(private readonly reflector: Reflector) {
    const redisUrl = process.env.UPSTASH_REDIS_URL?.trim()
    const redisToken = process.env.UPSTASH_REDIS_TOKEN?.trim()

    if (!redisUrl || !redisToken) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          'UPSTASH_REDIS_URL and UPSTASH_REDIS_TOKEN are required in production',
        )
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
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()

    const type =
      this.reflector.getAllAndOverride<RateLimitType | undefined>(
        RATE_LIMIT_KEY,
        [context.getHandler(), context.getClass()],
      ) || 'read'

    const limiter = type === 'write' ? this.writeLimiter : this.readLimiter
    if (!limiter) {
      return true
    }
    const identifier = getRateLimitIdentifier(request)

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

function getRateLimitIdentifier(request: {
  user?: { id?: string }
  ip?: string
  headers?: Record<string, string | string[] | undefined>
  socket?: { remoteAddress?: string }
}) {
  const userId = request.user?.id
  if (userId) {
    return `user:${userId}`
  }

  const forwardedFor = request.headers?.['x-forwarded-for']
  const forwardedIp = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor?.split(',')[0]
  const realIp = request.headers?.['x-real-ip']

  const candidate =
    forwardedIp?.trim() ||
    (Array.isArray(realIp) ? realIp[0] : realIp) ||
    request.ip ||
    request.socket?.remoteAddress ||
    'anonymous'

  return `anon:${String(candidate).trim()}`
}
