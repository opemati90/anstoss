import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { OAuthProviderService } from './oauth.provider'
import { pruneUnusedAppleRevocations } from './apple-revocation-retention'
import { APPLE_REVOCATION_MARKER } from './apple-session'

/** Soft-deletion is the durable outbox: failed Apple revocations are retried.
 * Login rejects deleted users immediately, even while Apple is unavailable. */
@Injectable()
export class SocialIdentityRetentionWorker implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null
  private running = false
  private readonly logger = new Logger(SocialIdentityRetentionWorker.name)
  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: OAuthProviderService,
  ) {}

  onModuleInit() {
    // The login kill switch must not stop deletion/revocation of existing grants.
    // As with the other workers, deploy the schema migration before this code.
    if (process.env.NODE_ENV === 'test') return
    this.timer = setInterval(() => void this.sweep(), 60_000)
    this.timer.unref?.()
    void this.sweep()
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  async sweep(now = new Date()) {
    if (this.running) return
    this.running = true
    try {
      const removed = await this.prisma.socialIdentity.findMany({
        where: { user: { deletedAt: { not: null } }, cleanupNextAttemptAt: { lte: now } },
        include: { user: { select: { deletedAt: true } } },
        orderBy: [{ cleanupNextAttemptAt: 'asc' }, { id: 'asc' }],
        take: 100,
      })
      for (const identity of removed) {
        try {
          // Persist the next attempt outside the provider transaction. Rollback,
          // deferral or process restart must not pin this row to the queue head.
          const claimed = await this.prisma.socialIdentity.updateMany({
            where: {
              id: identity.id,
              cleanupNextAttemptAt: { lte: now },
              user: { deletedAt: { not: null } },
            },
            data: { cleanupNextAttemptAt: new Date(now.getTime() + 60_000) },
          })
          if (!claimed.count) continue
          await this.prisma.$transaction(
            async (tx) => {
              await tx.$queryRaw`SELECT set_config('lock_timeout', '2000ms', true)`
              await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${identity.provider}), hashtext(${identity.subjectHash}))::text`
              const current = await tx.socialIdentity.findUnique({
                where: { id: identity.id },
                include: { user: true },
              })
              if (!current?.user.deletedAt) return
              const pending = await tx.socialLoginChallenge.findFirst({
                where: {
                  provider: identity.provider,
                  subjectHash: identity.subjectHash,
                  kind: { in: ['grant', 'link'] },
                  expiresAt: { gt: now },
                  sealedRefreshToken: { not: null },
                },
              })
              if (pending) return
              if (current.provider === 'apple' && current.sealedRefreshToken) {
                await this.providers.revokeApple(current.sealedRefreshToken)
              }
              const marker = {
                provider: `social-${identity.provider}`,
                subjectHash: identity.subjectHash,
              }
              await tx.authIdentityTombstone.upsert({
                where: { provider_subjectHash: marker },
                update: {},
                create: {
                  ...marker,
                  deletedUserId: identity.userId,
                  reason: 'account_deleted',
                  createdAt: identity.user.deletedAt!,
                },
              })
              await tx.socialIdentity.deleteMany({
                where: { id: identity.id, user: { deletedAt: { not: null } } },
              })
              // Pending link grants have their own expiry/revocation path below.
              // Don't discard an encrypted grant before it can be revoked.
            },
            { timeout: 15_000 },
          )
        } catch {
          this.logger.error('Social identity revocation failed; will retry')
        }
      }
      const expiredGrants = await this.prisma.socialLoginChallenge.findMany({
        where: {
          expiresAt: { lte: now },
          provider: 'apple',
          sealedRefreshToken: { not: null },
          cleanupNextAttemptAt: { lte: now },
        },
        orderBy: [{ cleanupNextAttemptAt: 'asc' }, { id: 'asc' }],
        take: 100,
      })
      for (const grant of expiredGrants) {
        try {
          const claimed = await this.prisma.socialLoginChallenge.updateMany({
            where: {
              id: grant.id,
              cleanupNextAttemptAt: { lte: now },
              expiresAt: { lte: now },
            },
            data: { cleanupNextAttemptAt: new Date(now.getTime() + 60_000) },
          })
          if (!claimed.count) continue
          await this.prisma.$transaction(
            async (tx) => {
              await tx.$queryRaw`SELECT set_config('lock_timeout', '2000ms', true)`
              await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${grant.provider}), hashtext(${grant.subjectHash ?? ''}))::text`
              const current = await tx.socialLoginChallenge.findUnique({ where: { id: grant.id } })
              if (!current || current.expiresAt > now || current.provider !== 'apple') return
              const linked =
                current.subjectHash &&
                (await tx.socialIdentity.findUnique({
                  where: {
                    provider_subjectHash: { provider: 'apple', subjectHash: current.subjectHash },
                  },
                  include: { user: true },
                }))
              if (linked) {
                // Deleted identities are handled by the coordinated deletion path.
                // Keep their newer journal credentials until that path succeeds.
                if (linked.user.deletedAt || linked.user.managedById) return
                const marker = await tx.authIdentityTombstone.findUnique({
                  where: {
                    provider_subjectHash: {
                      provider: APPLE_REVOCATION_MARKER,
                      subjectHash: current.subjectHash!,
                    },
                  },
                })
                const proof = current.providerAuthenticatedAt
                if (proof && (!marker || proof > marker.createdAt)) {
                  // A legacy identity has unknown freshness: retain the journal,
                  // requiring a live exchange to initialize its proof timestamp.
                  if (!linked.providerAuthenticatedAt) return
                  if (proof > linked.providerAuthenticatedAt && current.sealedRefreshToken) {
                    await tx.socialIdentity.update({
                      where: { id: linked.id },
                      data: {
                        sealedRefreshToken: current.sealedRefreshToken,
                        providerAuthenticatedAt: proof,
                      },
                    })
                  }
                }
                // Never revoke the shared authorization of a working connection.
              } else {
                const pending = await tx.socialLoginChallenge.findFirst({
                  where: {
                    id: { not: current.id },
                    provider: 'apple',
                    subjectHash: current.subjectHash,
                    kind: { in: ['grant', 'link'] },
                    expiresAt: { gt: now },
                    sealedRefreshToken: { not: null },
                  },
                })
                if (pending) return
                if (current.sealedRefreshToken)
                  await this.providers.revokeApple(current.sealedRefreshToken)
              }
              await tx.socialLoginChallenge.deleteMany({ where: { id: current.id } })
            },
            { timeout: 15_000 },
          )
        } catch {
          this.logger.error('Expired Apple link revocation failed; will retry')
        }
      }
      await this.prisma.socialLoginChallenge.deleteMany({
        where: {
          expiresAt: { lte: now },
          sealedRefreshToken: null,
        },
      })
      await this.prisma.authIdentityTombstone.deleteMany({
        where: {
          provider: { in: ['social-google', 'social-apple'] },
          createdAt: { lte: new Date(now.getTime() - 30 * 86_400_000) },
        },
      })
      await pruneUnusedAppleRevocations(this.prisma, now)
    } catch {
      this.logger.error('Social identity cleanup failed; will retry')
    } finally {
      this.running = false
    }
  }
}
