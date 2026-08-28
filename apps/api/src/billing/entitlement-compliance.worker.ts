import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { sendEmail } from '../email/mailer'
import { ClubEntitlementsService } from './club-entitlements.service'

const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000

@Injectable()
export class EntitlementComplianceWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EntitlementComplianceWorker.name)
  private timer: NodeJS.Timeout | null = null
  private running = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: ClubEntitlementsService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return
    this.timer = setInterval(() => void this.tick(), SWEEP_INTERVAL_MS)
    this.timer.unref?.()
    void this.tick()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  async runCycle() {
    const clubs = await this.prisma.club.findMany({ select: { id: true, name: true } })
    let notified = 0
    for (const club of clubs) {
      try {
        const compliance = await this.entitlements.refreshCompliance(club.id)
        if (!compliance || compliance.status !== 'OVER_QUOTA' || compliance.notifiedAt) continue
        const owner = await this.prisma.membership.findFirst({
          where: { clubId: club.id, role: 'OWNER' },
          include: { user: { select: { email: true } } },
        })
        if (!owner?.user.email) continue
        const ends = new Intl.DateTimeFormat('de-DE', { dateStyle: 'long' }).format(
          compliance.remediationEndsAt,
        )
        const message = `${club.name} is above its current Anstoss plan limit by ${compliance.excessTeams} team(s) and ${compliance.excessPlayers} player seat(s). Existing data stays available. Archive excess teams or seats, or change plan, by ${ends}. New activations are blocked while the club is over quota.`
        const sent = await sendEmail({
          to: owner.user.email,
          subject: `${club.name}: action needed for Anstoss plan limits`,
          text: message,
          html: `<p>${escapeHtml(message)}</p>`,
        })
        if (!sent) continue
        await this.prisma.clubPlanCompliance.updateMany({
          where: { id: compliance.id, status: 'OVER_QUOTA', notifiedAt: null },
          data: { notifiedAt: new Date() },
        })
        notified += 1
      } catch (error) {
        this.logger.warn(
          `Entitlement compliance failed for club ${club.id}: ${error instanceof Error ? error.message : 'unknown error'}`,
        )
      }
    }
    return { clubs: clubs.length, notified }
  }

  private async tick() {
    if (this.running) return
    this.running = true
    try {
      await this.runCycle()
    } finally {
      this.running = false
    }
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
