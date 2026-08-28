import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ContributionsService } from './contributions.service'
import { ClubEntitlementsService } from '../billing/club-entitlements.service'
import { PlanTier } from '@prisma/client'

const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000

@Injectable()
export class ContributionsReminderWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ContributionsReminderWorker.name)
  private timer: NodeJS.Timeout | null = null
  private running = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly contributionsService: ContributionsService,
    private readonly entitlements: ClubEntitlementsService,
  ) {}

  onModuleInit() {
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.CONTRIBUTION_REMINDER_WORKER_DISABLED === 'true'
    ) {
      return
    }

    const intervalMs = resolveReminderInterval()
    this.timer = setInterval(() => {
      void this.tick()
    }, intervalMs)
    this.timer.unref?.()

    void this.tick()
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer)
    }
  }

  async runCycle() {
    const killSwitch = await this.prisma.platformSetting.findUnique({
      where: { key: 'kill_switch_contributions' },
      select: { value: true },
    })
    if (killSwitch?.value === 'true') return
    if (!isContributionDeliveryWindow(new Date())) return

    const clubs = await this.prisma.clubContributionSettings.findMany({
      where: {
        enabled: true,
        autoRemindersEnabled: true,
      },
      select: {
        clubId: true,
      },
    })

    for (const { clubId } of clubs) {
      try {
        const entitlement = await this.entitlements.resolve(clubId)
        if (entitlement.tier === PlanTier.FREE) continue
        const result = await this.contributionsService.runAutomaticReminderSweep(clubId)

        if (result.sent > 0) {
          this.logger.log(
            `Sent ${result.sent} automatic contribution reminders for club ${clubId}.`,
          )
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error'
        this.logger.warn(`Automatic contribution reminders failed for club ${clubId}: ${message}`)
      }
    }
  }

  private async tick() {
    if (this.running) return
    this.running = true
    try {
      await this.runCycle()
    } catch (error) {
      this.logger.error(
        `Automatic contribution reminder sweep failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      )
    } finally {
      this.running = false
    }
  }
}

export function isContributionDeliveryWindow(now: Date) {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Berlin',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(now),
  )
  return hour >= 8 && hour < 20
}

function resolveReminderInterval() {
  const rawValue = process.env.CONTRIBUTION_REMINDER_INTERVAL_MS
  if (!rawValue) {
    return DEFAULT_INTERVAL_MS
  }

  const parsed = Number.parseInt(rawValue, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MS
}
