import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common'
import { Response } from 'express'
import { ZodError } from 'zod'
import { AppError } from '@anstoss/shared'
import { LoggerService } from './logger.service'

/**
 * Global exception filter — catches every unhandled error.
 *
 * - AppError subclasses → structured JSON with code + userMessage
 * - NestJS HttpException → standard NestJS response
 * - Unknown errors → 500 + "Something went wrong" + Sentry report
 *
 * No generic catch-all swallowing. Every rescue logs full context.
 */
@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest()

    const requestId = request?.requestId || '-'
    const userId = request?.user?.id || 'anonymous'
    const method = request?.method || '-'
    const path = request?.url || '-'

    // Named AppError → structured response
    if (exception instanceof AppError) {
      this.logger.error(
        `[${exception.code}] ${method} ${path} userId=${userId} requestId=${requestId}: ${exception.message}`,
      )

      // Non-operational errors get reported to Sentry
      if (!exception.isOperational) {
        this.reportToSentry(exception, { requestId, userId, method, path })
      }

      response.status(exception.httpStatus).json({
        error: {
          code: exception.code,
          message: exception.userMessage,
        },
        requestId,
      })
      return
    }

    // Zod validation errors → 422 with field-level details
    if (exception instanceof ZodError) {
      const fields = exception.issues.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      }))

      this.logger.warn(
        `[VALIDATION] ${method} ${path} userId=${userId} requestId=${requestId}: ${JSON.stringify(fields)}`,
      )

      response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          fields,
        },
        requestId,
      })
      return
    }

    // NestJS HttpException (validation errors, 404s, etc.)
    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const exceptionResponse = exception.getResponse()
      const message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as Record<string, unknown>).message || exception.message

      this.logger.warn(
        `[HTTP_${status}] ${method} ${path} userId=${userId} requestId=${requestId}: ${JSON.stringify(message)}`,
      )

      // onboarding review fixes (M1/M9): an HttpException thrown with an
      // object body may carry a stable machine code (and a wait time) so
      // clients map errors by code instead of English message substrings.
      const body =
        typeof exceptionResponse === 'object' && exceptionResponse !== null
          ? (exceptionResponse as Record<string, unknown>)
          : null
      const customCode =
        body && typeof body.code === 'string' && /^[A-Z0-9_]{2,64}$/.test(body.code)
          ? body.code
          : null
      const retryAfterSeconds =
        body && typeof body.retryAfterSeconds === 'number' && body.retryAfterSeconds >= 0
          ? Math.ceil(body.retryAfterSeconds)
          : null
      const retryAfter = status === 429 && customCode === 'RSVP_REMINDER_COOLDOWN'
        && typeof body?.retryAfter === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(body.retryAfter)
        && Number.isFinite(Date.parse(body.retryAfter)) && new Date(body.retryAfter).toISOString() === body.retryAfter
        ? body.retryAfter : null

      response.status(status).json({
        error: {
          code: customCode ?? `HTTP_${status}`,
          message,
          ...(retryAfterSeconds !== null ? { retryAfterSeconds } : {}),
          ...(retryAfter !== null ? { retryAfter } : {}),
        },
        requestId,
      })
      return
    }

    // Unknown error — 500 + Sentry
    const err = exception instanceof Error ? exception : new Error(String(exception))
    this.logger.error(
      `[UNHANDLED] ${method} ${path} userId=${userId} requestId=${requestId}: ${err.message}`,
      err.stack,
    )
    this.reportToSentry(err, { requestId, userId, method, path })

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Please try again.',
      },
      requestId,
    })
  }

  private reportToSentry(
    error: Error,
    context: Record<string, string>,
  ) {
    try {
      const Sentry = require('@sentry/node')
      Sentry.withScope((scope: { setTag: (k: string, v: string) => void }) => {
        Object.entries(context).forEach(([key, value]) => {
          scope.setTag(key, value)
        })
        Sentry.captureException(error)
      })
    } catch {
      // Sentry not available — already logged above
    }
  }
}
