import { Injectable } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { PrismaService } from '../../prisma/prisma.service'
import { OAuthProviderService } from './oauth.provider'
import { socialSubjectHash } from './oauth.service'
import { APPLE_REVOCATION_MARKER } from './apple-session'

@Injectable()
export class AppleNotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: OAuthProviderService,
    private readonly events: EventEmitter2,
  ) {}

  async receive(token: string): Promise<{ ok: true }> {
    const event = await this.providers.verifyAppleNotification(token)
    // Email forwarding changes are not account/session revocations.
    if (event.type !== 'consent-revoked' && event.type !== 'account-deleted') return { ok: true }
    const subjectHash = socialSubjectHash('apple', event.subject)
    const identityId = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'apple'}), hashtext(${subjectHash}))::text`
      const key = { provider: APPLE_REVOCATION_MARKER, subjectHash }
      const previous = await tx.authIdentityTombstone.findUnique({
        where: { provider_subjectHash: key },
      })
      // Monotonic state makes duplicates/out-of-order notifications harmless.
      if (!previous || previous.createdAt.getTime() < event.eventTime * 1000) {
        await tx.authIdentityTombstone.upsert({
          where: { provider_subjectHash: key },
          create: { ...key, reason: event.type, createdAt: new Date(event.eventTime * 1000) },
          update: { reason: event.type, createdAt: new Date(event.eventTime * 1000) },
        })
      }
      const identity = await tx.socialIdentity.findUnique({
        where: {
          provider_subjectHash: { provider: 'apple', subjectHash },
        },
        select: { id: true },
      })
      return identity?.id
    })
    // Retry delivery also repeats the disconnect, covering a crash after commit.
    // Each gateway checks the proof timestamp, so late notifications cannot
    // disconnect sessions created after a genuine re-authorization.
    if (identityId) await this.events.emitAsync('auth.apple.revoked', { identityId })
    return { ok: true }
  }
}
