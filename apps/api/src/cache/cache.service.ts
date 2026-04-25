import { Injectable, Logger } from '@nestjs/common'
import { Redis } from '@upstash/redis'

type SetOptions = { ex?: number }

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name)
  private redis: Redis | null = null

  constructor() {
    const url = process.env.UPSTASH_REDIS_URL?.trim()
    const token = process.env.UPSTASH_REDIS_TOKEN?.trim()
    if (!url || !token) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('UPSTASH_REDIS_URL and UPSTASH_REDIS_TOKEN are required in production')
      }
      this.logger.warn('UPSTASH_REDIS_URL/TOKEN not set — cache disabled for local development')
      return
    }
    this.redis = new Redis({ url, token })
  }

  async get(key: string): Promise<string | null> {
    if (!this.redis) return null
    const value = await this.redis.get<string>(key)
    return value ?? null
  }

  async set(key: string, value: string, mode: 'EX', seconds: number): Promise<'OK' | null>
  async set(key: string, value: string, options?: SetOptions): Promise<'OK' | null>
  async set(
    key: string,
    value: string,
    modeOrOptions?: 'EX' | SetOptions,
    seconds?: number,
  ): Promise<'OK' | null> {
    if (!this.redis) return null
    if (modeOrOptions === 'EX' && typeof seconds === 'number') {
      await this.redis.set(key, value, { ex: seconds })
      return 'OK'
    }
    if (modeOrOptions && typeof modeOrOptions === 'object' && modeOrOptions.ex) {
      await this.redis.set(key, value, { ex: modeOrOptions.ex })
      return 'OK'
    }
    await this.redis.set(key, value)
    return 'OK'
  }
}
