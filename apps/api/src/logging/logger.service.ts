import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common'
import pino from 'pino'

/**
 * Structured JSON logger using pino.
 *
 * - JSON output in production, pretty-print in development
 * - requestId, userId, clubId context via child loggers
 * - No PII: never log passwords, tokens, or email bodies
 */
@Injectable()
export class LoggerService implements NestLoggerService {
  private readonly logger: pino.Logger

  constructor() {
    this.logger = pino({
      level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
      transport:
        process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
      redact: {
        paths: ['req.headers.authorization', 'password', 'token', 'secret'],
        censor: '[REDACTED]',
      },
    })
  }

  /**
   * Create a child logger with request context.
   */
  child(bindings: Record<string, unknown>) {
    return this.logger.child(bindings)
  }

  log(message: string, ...optionalParams: unknown[]) {
    this.logger.info({ data: optionalParams.length ? optionalParams : undefined }, message)
  }

  error(message: string, ...optionalParams: unknown[]) {
    this.logger.error({ data: optionalParams.length ? optionalParams : undefined }, message)
  }

  warn(message: string, ...optionalParams: unknown[]) {
    this.logger.warn({ data: optionalParams.length ? optionalParams : undefined }, message)
  }

  debug(message: string, ...optionalParams: unknown[]) {
    this.logger.debug({ data: optionalParams.length ? optionalParams : undefined }, message)
  }

  verbose(message: string, ...optionalParams: unknown[]) {
    this.logger.trace({ data: optionalParams.length ? optionalParams : undefined }, message)
  }
}
