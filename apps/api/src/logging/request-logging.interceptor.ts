import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { Observable, tap } from 'rxjs'
import { randomUUID } from 'crypto'
import { LoggerService } from './logger.service'

/**
 * Logs every HTTP request with structured context:
 * - requestId (UUID per request)
 * - userId, clubId (from auth context)
 * - method, path, statusCode, duration
 */
@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: LoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest()
    if (!request) return next.handle()

    const requestId = randomUUID()
    const startTime = Date.now()
    const method = request.method
    const path = request.url

    // Attach requestId to request for downstream use
    request.requestId = requestId

    const userId = request.user?.id || 'anonymous'
    const clubId = request.params?.clubId || request.headers?.['x-club-id'] || '-'

    const childLogger = this.logger.child({
      requestId,
      userId,
      clubId,
      method,
      path,
    })

    childLogger.info(`→ ${method} ${path}`)

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime
          const response = context.switchToHttp().getResponse()
          const statusCode = response?.statusCode || 200
          childLogger.info(`← ${statusCode} ${method} ${path} (${duration}ms)`)
        },
        error: (err) => {
          const duration = Date.now() - startTime
          childLogger.error(
            `← ERROR ${method} ${path} (${duration}ms): ${err.message}`,
          )
        },
      }),
    )
  }
}
