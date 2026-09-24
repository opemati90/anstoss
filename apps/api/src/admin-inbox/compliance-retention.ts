import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { TeamGroupType, TeamRole } from '@prisma/client'
import { COMPLIANCE_REMINDER_COOLDOWN_HOURS, COMPLIANCE_RETENTION_DAYS } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { tenantContext } from '../prisma/tenant.context'
import { activeTeamAccessWhere } from '../teams/active-team-access'

/**
 * Retention for ComplianceRecord (Führungszeugnis, Spielerpass, certificates,
 * SEPA mandate, data consent).
 *
 * §72a(5) SGB VIII: Führungszeugnis data must be deleted at the latest three
 * months after the activity with children ends; DSGVO Art. 5(1)(e) (storage
 * limitation) covers the other kinds. Strategy:
 *
 *   1. Immediate: leaving or being removed from a club deletes every record
 *      and reminder of that member inside the same transaction
 *      (deleteMemberComplianceData). Offboarding from staff deletes the
 *      Führungszeugnis (deleteStaffCertificate).
 *   2. Nightly sweep (ComplianceRetentionWorker): deletes records whose member
 *      has no membership in the club any more (paths that bypassed step 1),
 *      and Führungszeugnis records of members who have not coached a youth
 *      team for COMPLIANCE_RETENTION_DAYS (role changed, coach unassigned).
 */

type Tx = {
  complianceRecord: { deleteMany: (args: any) => Promise<{ count: number }> }
  complianceReminder: { deleteMany: (args: any) => Promise<{ count: number }> }
}

/** Call inside the transaction that removes a member from a club. */
export async function deleteMemberComplianceData(tx: Tx, clubId: string, memberUserId: string) {
  await tx.complianceRecord.deleteMany({ where: { clubId, memberUserId } })
  await tx.complianceReminder.deleteMany({ where: { clubId, memberUserId } })
}

/** Call inside the transaction that ends a member's staff activity. */
export async function deleteStaffCertificate(tx: Tx, clubId: string, memberUserId: string) {
  await tx.complianceRecord.deleteMany({
    where: { clubId, memberUserId, kind: 'FUEHRUNGSZEUGNIS' },
  })
}

const DAY_MS = 24 * 60 * 60 * 1000
const SWEEP_INTERVAL_MS = DAY_MS
const YOUTH_GROUP_TYPES = [TeamGroupType.YOUTH, TeamGroupType.MINI]
const COACH_ROLES = [TeamRole.HEAD_COACH, TeamRole.ASSISTANT_COACH]

@Injectable()
export class ComplianceRetentionWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ComplianceRetentionWorker.name)
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

  /** Runs even while COMPLIANCE_FEATURE_ENABLED is false: deleting is always safe. */
  async sweep(now = new Date()): Promise<{ orphaned: number; expiredActivity: number }> {
    const cutoff = new Date(now.getTime() - COMPLIANCE_RETENTION_DAYS * DAY_MS)
    // Tenant-scoped models can't be read without a club context, so walk the
    // clubs (same pattern as BankImportRetentionWorker).
    const clubs: Array<{ id: string }> = await this.prisma.club.findMany({ select: { id: true } })
    let orphaned = 0
    let expiredActivity = 0
    for (const { id: clubId } of clubs) {
      const result = await tenantContext.run({ clubId, userId: 'system' }, () =>
        this.sweepClub(clubId, now, cutoff),
      )
      orphaned += result.orphaned
      expiredActivity += result.expiredActivity
    }
    return { orphaned, expiredActivity }
  }

  private async sweepClub(clubId: string, now: Date, cutoff: Date) {
    // A reminder row only enforces the 24h cooldown; once that has passed it
    // is personal data without a purpose (covers former members too).
    await this.prisma.complianceReminder.deleteMany({
      where: {
        clubId,
        sentAt: { lt: new Date(now.getTime() - COMPLIANCE_REMINDER_COOLDOWN_HOURS * 60 * 60 * 1000) },
      },
    })
    const records: Array<{ id: string; memberUserId: string; kind: string; updatedAt: Date }> =
      await this.prisma.complianceRecord.findMany({
        where: { clubId },
        select: { id: true, memberUserId: true, kind: true, updatedAt: true },
      })
    if (records.length === 0) return { orphaned: 0, expiredActivity: 0 }
    const memberIds = [...new Set(records.map((record) => record.memberUserId))]

    const [memberships, activeYouthCoaching, lastCoaching] = await Promise.all([
      this.prisma.membership.findMany({
        where: { clubId, userId: { in: memberIds } },
        select: { userId: true },
      }),
      this.prisma.teamAccess.findMany({
        where: {
          clubId,
          userId: { in: memberIds },
          role: { in: COACH_ROLES },
          team: { group: { type: { in: YOUTH_GROUP_TYPES } } },
          ...activeTeamAccessWhere(now),
        },
        select: { userId: true },
      }),
      // Any coach access row (revoked ones included): its updatedAt is the
      // best available "activity ended" timestamp.
      this.prisma.teamAccess.findMany({
        where: { clubId, userId: { in: memberIds }, role: { in: COACH_ROLES } },
        select: { userId: true, updatedAt: true },
      }),
    ])
    const isMember = new Set(memberships.map((row: any) => row.userId))
    const coachesYouthNow = new Set(activeYouthCoaching.map((row: any) => row.userId))
    const lastCoachingAt = new Map<string, number>()
    for (const row of lastCoaching as Array<{ userId: string; updatedAt: Date }>) {
      const at = row.updatedAt.getTime()
      if (at > (lastCoachingAt.get(row.userId) ?? 0)) lastCoachingAt.set(row.userId, at)
    }

    const orphanIds: string[] = []
    const expiredIds: string[] = []
    for (const record of records) {
      if (!isMember.has(record.memberUserId)) {
        orphanIds.push(record.id)
        continue
      }
      if (record.kind !== 'FUEHRUNGSZEUGNIS') continue
      if (coachesYouthNow.has(record.memberUserId)) continue
      const activityEnd = Math.max(
        record.updatedAt.getTime(),
        lastCoachingAt.get(record.memberUserId) ?? 0,
      )
      if (activityEnd <= cutoff.getTime()) expiredIds.push(record.id)
    }

    if (orphanIds.length > 0) {
      await this.prisma.complianceRecord.deleteMany({ where: { clubId, id: { in: orphanIds } } })
    }
    if (expiredIds.length > 0) {
      await this.prisma.complianceRecord.deleteMany({ where: { clubId, id: { in: expiredIds } } })
    }
    return { orphaned: orphanIds.length, expiredActivity: expiredIds.length }
  }

  private async tick() {
    if (this.running) return
    this.running = true
    try {
      const result = await this.sweep()
      if (result.orphaned + result.expiredActivity > 0) {
        this.logger.log(
          `Compliance retention: deleted ${result.orphaned} records of former members and ${result.expiredActivity} Führungszeugnisse past the 3-month limit.`,
        )
      }
    } catch (error) {
      this.logger.error(
        `Compliance retention sweep failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      )
    } finally {
      this.running = false
    }
  }
}
