import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { Observable } from 'rxjs'
import { tenantContext } from './tenant.context'

/**
 * NestJS interceptor that sets the tenant context for every request.
 *
 * Reads `user.id` from the authenticated request (set by ClerkAuthGuard)
 * and `clubId` from route params or request headers.
 *
 * All downstream Prisma queries run inside this AsyncLocalStorage context,
 * so the tenant middleware can auto-inject clubId.
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest()

    const userId: string | undefined = request.user?.id
    const clubId: string | undefined =
      request.params?.clubId || request.headers['x-club-id']

    if (!userId || !clubId) {
      // No tenant context needed — global endpoints (e.g., /me, /clubs)
      return next.handle()
    }

    return new Observable((subscriber) => {
      tenantContext.run({ clubId, userId }, () => {
        next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        })
      })
    })
  }
}
