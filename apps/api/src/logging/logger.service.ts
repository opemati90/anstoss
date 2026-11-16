import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common'
import pino from 'pino'
import { sanitizeStoreTelemetry } from './sanitize-store-telemetry'

function resolveTransport() {
  if (process.env.NODE_ENV === 'production' || process.env.PINO_PRETTY === 'false') {
    return undefined
  }

  try {
    require.resolve('pino-pretty')
    return { target: 'pino-pretty', options: { colorize: true } }
  } catch {
    return undefined
  }
}

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
      transport: resolveTransport(),
      redact: {
        paths: ['req.headers.authorization', 'req.body.reference', 'req.body.signedPayload', 'req.body.message.data', 'password', 'token', 'secret', 'purchaseToken', 'reference', 'signedPayload', 'sealedReference'],
        censor: '[REDACTED]',
      },
    })
  }

  /**
   * Create a child logger with request context.
   */
  child(bindings: Record<string, unknown>) {
    return this.logger.child(sanitizeStoreTelemetry(bindings) as Record<string, unknown>)
  }

  log(message: string, ...optionalParams: unknown[]) {
    this.logger.info({ data: optionalParams.length ? sanitizeStoreTelemetry(optionalParams) : undefined }, message)
  }

  error(message: string, ...optionalParams: unknown[]) {
    this.logger.error({ data: optionalParams.length ? sanitizeStoreTelemetry(optionalParams) : undefined }, message)
  }

  warn(message: string, ...optionalParams: unknown[]) {
    this.logger.warn({ data: optionalParams.length ? sanitizeStoreTelemetry(optionalParams) : undefined }, message)
  }

  debug(message: string, ...optionalParams: unknown[]) {
    this.logger.debug({ data: optionalParams.length ? sanitizeStoreTelemetry(optionalParams) : undefined }, message)
  }

  verbose(message: string, ...optionalParams: unknown[]) {
    this.logger.trace({ data: optionalParams.length ? sanitizeStoreTelemetry(optionalParams) : undefined }, message)
  }
}
