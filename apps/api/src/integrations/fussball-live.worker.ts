import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { FussballService } from './fussball.service'
import { tenantContext } from '../prisma/tenant.context'
import { isLicensedFussballFeedEnabled } from './fussball-scraper.client'

const DEFAULT_INTERVAL_MS = 60 * 1000
const MIN_INTERVAL_MS = 15 * 1000

/**
 * Live fixture poller.
 *
 * The live ticker (mobile match-live screen + /live socket) is push-driven:
 * FussballService.upsertImportedFixture broadcasts GOAL/STATE/FINAL events and
 * sends push when a fixture's score or status changes. Those changes are only
 * detected when we re-fetch from api-fussball.de — so without a poller the
 * ticker never moves during a match. This worker closes that gap: every minute
 * it finds team links with a fixture in the live window and refreshes them.
 *
 * Matches the setInterval-on-init pattern used by event-reminder.worker /
 * contributions-reminder.worker (the codebase has no ScheduleModule). Each link
 * is processed inside tenantContext so the tenant-scoped fixture/event writes
 * pass the scope guard (the cron has no request context of its own).
 */
@Injectable()
export class FussballLiveWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FussballLiveWorker.name)
  private timer: NodeJS.Timeout | null = null
  private running = false

  constructor(private readonly fussball: FussballService) {}

  onModuleInit() {
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.FUSSBALL_LIVE_WORKER_DISABLED === 'true' ||
      !isLicensedFussballFeedEnabled()
    ) {
      return
    }

    // No scraper configured → nothing to poll; stay dormant instead of throwing
    // ServiceUnavailable on every cycle. (Fixtures are sourced from the
    // fussball.de scraper sidecar, not a token-based API.)
    if (!process.env.FUSSBALL_SCRAPER_URL) {
      this.logger.warn(
        'FUSSBALL_SCRAPER_URL not set — live fixture poller disabled',
      )
      return
    }

    const intervalMs = resolveInterval()
    this.timer = setInterval(() => {
      void this.runCycle()
    }, intervalMs)
    this.timer.unref?.()
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer)
    }
  }

  async runCycle() {
    if (!isLicensedFussballFeedEnabled()) return
    // Skip if the previous cycle is still in flight (a slow upstream must not
    // stack overlapping polls).
    if (this.running) {
      return
    }
    this.running = true

    try {
      const links = await this.fussball.findLiveWindowLinks()
      if (links.length === 0) {
        return
      }

      let refreshed = 0
      for (const link of links) {
        await tenantContext.run(
          { clubId: link.clubId, userId: 'system:fussball-live' },
          async () => {
            try {
              await this.fussball.refreshLinkFixtures(link.id)
              refreshed += 1
            } catch (err) {
              const message = err instanceof Error ? err.message : 'unknown error'
              this.logger.warn(
                `Live refresh failed for link ${link.id}: ${message}`,
              )
            }
          },
        )
      }

      this.logger.log(`Live poll refreshed ${refreshed}/${links.length} linked team(s).`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error'
      this.logger.warn(`Live poll cycle failed: ${message}`)
    } finally {
      this.running = false
    }
  }
}

function resolveInterval() {
  const raw = process.env.FUSSBALL_LIVE_INTERVAL_MS
  if (!raw) return DEFAULT_INTERVAL_MS
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed >= MIN_INTERVAL_MS
    ? parsed
    : DEFAULT_INTERVAL_MS
}
