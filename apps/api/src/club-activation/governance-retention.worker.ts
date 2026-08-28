import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { tenantContext } from '../prisma/tenant.context'

const SWEEP_INTERVAL_MS = 60 * 60 * 1000
const EVIDENCE_RETENTION_DAYS = 180
const UNACCEPTED_INVITE_RETENTION_DAYS = 90
const CAMPAIGN_IDENTITY_RETENTION_DAYS = 90

@Injectable()
export class GovernanceRetentionWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GovernanceRetentionWorker.name)
  private timer: NodeJS.Timeout | null = null
  private running = false

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return
    this.timer = setInterval(() => void this.tick(), SWEEP_INTERVAL_MS)
    this.timer.unref?.()
    void this.tick()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  async runCycle(now = new Date()) {
    const [claims, transfers, clubs] = await Promise.all([
      this.prisma.clubClaim.findMany({
        where: { status: { in: ['SUBMITTED', 'NEEDS_INFO'] }, expiresAt: { lte: now } },
        select: { id: true, clubId: true, claimantUserId: true },
      }),
      this.prisma.ownershipTransfer.findMany({
        where: { status: 'PENDING', expiresAt: { lte: now } },
        select: { id: true, clubId: true, fromUserId: true, toUserId: true },
      }),
      this.prisma.club.findMany({ select: { id: true } }),
    ])

    for (const claim of claims) {
      await this.prisma.$transaction(async (tx) => {
        const changed = await tx.clubClaim.updateMany({
          where: {
            id: claim.id,
            status: { in: ['SUBMITTED', 'NEEDS_INFO'] },
            expiresAt: { lte: now },
          },
          data: { status: 'EXPIRED', reviewedAt: now },
        })
        if (changed.count !== 1) return
        await tx.auditLog.create({
          data: {
            clubId: claim.clubId,
            type: 'club.claim_expired',
            actorType: 'system',
            actorId: null,
            actorLabel: 'governance-retention',
            summary: 'Club authority claim expired without approval.',
            metadata: { claimId: claim.id, claimantUserId: claim.claimantUserId },
          },
        })
      })
    }

    for (const transfer of transfers) {
      await this.prisma.$transaction(async (tx) => {
        const changed = await tx.ownershipTransfer.updateMany({
          where: { id: transfer.id, status: 'PENDING', expiresAt: { lte: now } },
          data: { status: 'EXPIRED' },
        })
        if (changed.count !== 1) return
        await tx.auditLog.create({
          data: {
            clubId: transfer.clubId,
            type: 'club.ownership_transfer_expired',
            actorType: 'system',
            actorId: null,
            actorLabel: 'governance-retention',
            summary: 'Club ownership transfer expired without acceptance.',
            metadata: {
              transferId: transfer.id,
              fromUserId: transfer.fromUserId,
              toUserId: transfer.toUserId,
            },
          },
        })
      })
    }

    for (const club of clubs) {
      await tenantContext.run(
        { clubId: club.id, userId: 'system:governance-retention' },
        async () => {
          const [invites, campaigns] = await Promise.all([
            this.prisma.invite.findMany({
              where: { clubId: club.id, status: 'PENDING', expiresAt: { lte: now } },
              select: { id: true },
            }),
            this.prisma.inviteCampaign.findMany({
              where: {
                clubId: club.id,
                status: { in: ['ACTIVE', 'PAUSED'] },
                expiresAt: { lte: now },
              },
              select: { id: true },
            }),
          ])
          for (const invite of invites) {
            const changed = await this.prisma.invite.updateMany({
              where: { id: invite.id, status: 'PENDING', expiresAt: { lte: now } },
              data: { status: 'EXPIRED' },
            })
            if (changed.count === 1) {
              await this.prisma.auditLog.create({
                data: {
                  clubId: club.id,
                  type: 'invite.expired',
                  actorType: 'system',
                  actorId: null,
                  actorLabel: 'governance-retention',
                  summary: 'Invitation expired without redemption.',
                  metadata: { inviteId: invite.id },
                },
              })
            }
          }
          for (const campaign of campaigns) {
            const changed = await this.prisma.inviteCampaign.updateMany({
              where: {
                id: campaign.id,
                status: { in: ['ACTIVE', 'PAUSED'] },
                expiresAt: { lte: now },
              },
              data: { status: 'EXPIRED' },
            })
            if (changed.count === 1) {
              await this.prisma.auditLog.create({
                data: {
                  clubId: club.id,
                  type: 'invite.campaign_expired',
                  actorType: 'system',
                  actorId: null,
                  actorLabel: 'governance-retention',
                  summary: 'Invite campaign expired.',
                  metadata: { campaignId: campaign.id },
                },
              })
            }
          }
        },
      )
    }

    const evidenceCutoff = new Date(
      now.getTime() - EVIDENCE_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    )
    const retainedClaims = await this.prisma.clubClaim.findMany({
      where: {
        status: { in: ['APPROVED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'] },
        reviewedAt: { lte: evidenceCutoff },
      },
      select: {
        evidence: { select: { id: true } },
        club: {
          select: {
            disputes: {
              where: { status: { in: ['OPEN', 'FROZEN'] } },
              select: { id: true },
            },
          },
        },
      },
    })
    const evidenceIds = retainedClaims
      .filter((claim) => !claim.club || claim.club.disputes.length === 0)
      .flatMap((claim) => claim.evidence.map((item) => item.id))
    if (evidenceIds.length > 0) {
      await this.prisma.clubClaimEvidence.deleteMany({ where: { id: { in: evidenceIds } } })
    }
    await this.prisma.ownershipTransferChallenge.deleteMany({
      where: { OR: [{ expiresAt: { lte: now } }, { consumedAt: { not: null } }] },
    })
    const inviteCutoff = new Date(
      now.getTime() - UNACCEPTED_INVITE_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    )
    const purgedInvites = await this.prisma.invite.deleteMany({
      where: {
        acceptedByUserId: null,
        status: { in: ['EXPIRED', 'REVOKED'] },
        updatedAt: { lte: inviteCutoff },
      },
    })
    const campaignCutoff = new Date(
      now.getTime() - CAMPAIGN_IDENTITY_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    )
    const campaignsToRetire = await this.prisma.inviteCampaign.findMany({
      where: {
        status: { in: ['EXPIRED', 'REVOKED'] },
        updatedAt: { lte: campaignCutoff },
        retiredAt: null,
      },
      select: { id: true },
    })
    for (const campaign of campaignsToRetire) {
      await this.prisma.inviteCampaign.update({
        where: { id: campaign.id },
        data: {
          recipientEmail: null,
          code: `retired-${campaign.id}`,
          retiredAt: now,
        },
      })
    }

    return {
      expiredClaims: claims.length,
      expiredTransfers: transfers.length,
      purgedEvidence: evidenceIds.length,
      purgedInvites: purgedInvites.count,
      retiredCampaigns: campaignsToRetire.length,
    }
  }

  private async tick() {
    if (this.running) return
    this.running = true
    try {
      await this.runCycle()
    } catch (error) {
      this.logger.error(
        `Governance retention sweep failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      )
    } finally {
      this.running = false
    }
  }
}
