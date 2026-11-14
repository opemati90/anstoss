import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { EMPTY, mergeMap } from 'rxjs'

/** Nest treats { event, data } as an outgoing event, NOT an acknowledgement.
 * Clients use request callbacks for history, search and send results.
 * Acknowledge those requests explicitly; keep event-only clients compatible.
 * Room broadcasts and authorization still belong to the gateway handlers.
 */
@Injectable()
export class SocketAckInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const ack = context.getArgByIndex<unknown>(2)
    if (typeof ack !== 'function') return next.handle()
    return next.handle().pipe(
      mergeMap((response) => {
        ack(response)
        // Prevent the adapter from also emitting or acknowledging this result.
        return EMPTY
      }),
    )
  }
}
