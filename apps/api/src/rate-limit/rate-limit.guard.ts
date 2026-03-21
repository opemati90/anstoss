import {
  CanActivate,
  ExecutionContext,
  Injectable,
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
  private readLimiter: Ratelimit
  private writeLimiter: Ratelimit

  constructor(private readonly reflector: Reflector) {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_URL!,
      token: process.env.UPSTASH_REDIS_TOKEN!,
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
    const userId: string | undefined = request.user?.id

    if (!userId) {
      // Unauthenticated requests are not rate-limited here
      // (they'll be blocked by ClerkAuthGuard anyway)
      return true
    }

    const type =
      this.reflector.getAllAndOverride<RateLimitType | undefined>(
        RATE_LIMIT_KEY,
        [context.getHandler(), context.getClass()],
      ) || 'read'

    const limiter = type === 'write' ? this.writeLimiter : this.readLimiter

    const { success, remaining, reset } = await limiter.limit(userId)

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
