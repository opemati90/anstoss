import { Injectable, Logger, Optional, Inject } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PUSH, TeamAccessStatus } from '@anstoss/shared'
import { resolveLocale, type Locale } from '../i18n/translations'
import {
  formatPush,
  type NotificationType,
  type TemplateData,
} from './push.templates'
interface NotificationChecker {
  getMutedUserIds(clubId: string, teamId: string, category: string): Promise<Set<string>>
  isInQuietHours(userId: string, clubId: string): Promise<boolean>
}

type ExpoPushMessage = {
  to: string
  title: string
  body: string
  data?: Record<string, string>
  sound?: 'default'
  badge?: number
  channelId?: string
}

type ExpoPushTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message: string; details?: { error: string } }

/**
 * Push notification service using Expo Push API.
 *
 * - Sends via Expo's HTTP/2 endpoint
 * - Batches in groups of PUSH.BATCH_SIZE (100)
 * - Cleans up invalid tokens on DeviceNotRegistered errors
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name)
  private readonly EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
  private readonly EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts'
  /** How long to wait before fetching receipts for a send (Expo defers errors). */
  private readonly RECEIPT_DELAY_MS = 15_000

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject('NotificationsService')
    private readonly notificationsService?: NotificationChecker,
  ) {}

  /**
   * Register or update an Expo push token for a user.
   */
  async registerToken(userId: string, token: string, platform: string) {
    return this.prisma.pushToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform, updatedAt: new Date() },
    })
  }

  /**
   * Remove a push token (user logged out or token expired).
   */
  async removeToken(token: string, userId: string) {
    return this.prisma.pushToken.deleteMany({
      where: { token, userId },
    })
  }

  /**
   * Send push to all members of a team.
   */
  async sendToTeam(
    teamId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
    excludeUserId?: string,
    options?: { clubId?: string; category?: 'chat' | 'events' | 'announcements' },
  ) {
    const userIds = await this.resolveTeamRecipientIds(teamId, excludeUserId, options)
    if (userIds.length === 0) return

    const tokens = await this.prisma.pushToken.findMany({
      where: { userId: { in: userIds } },
      select: { token: true },
    })

    if (tokens.length === 0) return

    await this.sendPush(
      tokens.map((t: { token: string }) => t.token),
      title,
      body,
      data,
    )
  }

  /**
   * Resolve the deliverable recipient set for a team push: active members,
   * minus the excluded sender, minus muted users, minus users in quiet hours.
   * Shared by {@link sendToTeam} and {@link sendToTeamLocalized}.
   */
  private async resolveTeamRecipientIds(
    teamId: string,
    excludeUserId?: string,
    options?: { clubId?: string; category?: 'chat' | 'events' | 'announcements' },
  ): Promise<string[]> {
    const teamMembers = await this.prisma.teamAccess.findMany({
      where: {
        teamId,
        status: TeamAccessStatus.ACTIVE,
      },
      select: { userId: true, clubId: true },
    })

    let userIds = Array.from(
      new Set(
        teamMembers
          .map((m: typeof teamMembers[number]) => m.userId)
          .filter((id: string) => id !== excludeUserId),
      ),
    )

    // Filter out muted users if notification preferences are available
    if (this.notificationsService && options?.clubId && options?.category) {
      const mutedIds = await this.notificationsService.getMutedUserIds(
        options.clubId,
        teamId,
        options.category,
      )
      userIds = userIds.filter((id) => !mutedIds.has(id))
    }

    // Filter out users in quiet hours
    if (this.notificationsService && options?.clubId && userIds.length > 0) {
      const quietUserIds = await this.getQuietHoursUserIds(userIds, options.clubId)
      if (quietUserIds.size > 0) {
        userIds = userIds.filter((id) => !quietUserIds.has(id))
        this.logger.debug(`Filtered ${quietUserIds.size} user(s) in quiet hours`)
      }
    }

    return userIds
  }

  /**
   * Group a team's deliverable recipients' push tokens by resolved locale, so
   * each locale batch can be sent with its own copy. German fallback.
   */
  private async groupTeamTokensByLocale(
    teamId: string,
    excludeUserId?: string,
    options?: { clubId?: string; category?: 'chat' | 'events' | 'announcements' },
  ): Promise<Map<Locale, string[]>> {
    const userIds = await this.resolveTeamRecipientIds(teamId, excludeUserId, options)
    const byLocale = new Map<Locale, string[]>()
    if (userIds.length === 0) return byLocale

    const tokens = await this.prisma.pushToken.findMany({
      where: { userId: { in: userIds } },
      select: { token: true, user: { select: { preferredLanguage: true } } },
    })
    for (const t of tokens) {
      const locale = resolveLocale(t.user?.preferredLanguage)
      const bucket = byLocale.get(locale) ?? []
      bucket.push(t.token)
      byLocale.set(locale, bucket)
    }
    return byLocale
  }

  /**
   * Localized variant of {@link sendToTeam}: renders the template once per
   * recipient language and sends each batch with the matching copy. Recipients
   * with no language preference fall back to German.
   */
  async sendToTeamLocalized<T extends NotificationType>(
    teamId: string,
    type: T,
    templateData: TemplateData<T>,
    payload?: Record<string, string>,
    excludeUserId?: string,
    options?: { clubId?: string; category?: 'chat' | 'events' | 'announcements' },
  ) {
    const byLocale = await this.groupTeamTokensByLocale(teamId, excludeUserId, options)
    for (const [locale, groupTokens] of byLocale) {
      const { title, body } = formatPush(type, templateData, locale)
      await this.sendPush(groupTokens, title, body, payload)
    }
  }

  /**
   * Localized team push for computed notifications that don't map to a single
   * template (e.g. fixture-change copy with branching logic). The `render`
   * callback is invoked once per recipient locale.
   */
  async sendToTeamRendered(
    teamId: string,
    render: (locale: Locale) => { title: string; body: string },
    payload?: Record<string, string>,
    excludeUserId?: string,
    options?: { clubId?: string; category?: 'chat' | 'events' | 'announcements' },
  ) {
    const byLocale = await this.groupTeamTokensByLocale(teamId, excludeUserId, options)
    for (const [locale, groupTokens] of byLocale) {
      const { title, body } = render(locale)
      await this.sendPush(groupTokens, title, body, payload)
    }
  }

  /**
   * Localized variant of {@link sendToUser}: looks up the recipient's language
   * and renders the template before delivering (German fallback).
   */
  async sendToUserLocalized<T extends NotificationType>(
    userId: string,
    type: T,
    templateData: TemplateData<T>,
    payload?: Record<string, string>,
    options?: { clubId?: string },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { preferredLanguage: true },
    })
    const locale = resolveLocale(user?.preferredLanguage)
    const { title, body } = formatPush(type, templateData, locale)
    await this.sendToUser(userId, title, body, payload, options)
  }

  /**
   * Send push to a specific user.
   */
  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
    options?: { clubId?: string },
  ) {
    // Skip if user is in quiet hours
    if (this.notificationsService && options?.clubId) {
      const inQuiet = await this.notificationsService.isInQuietHours(
        userId,
        options.clubId,
      )
      if (inQuiet) {
        this.logger.debug(`Skipping push to ${userId} — in quiet hours`)
        return
      }
    }
    const tokens = await this.prisma.pushToken.findMany({
      where: { userId },
      select: { token: true },
    })

    if (tokens.length === 0) return

    await this.sendPush(
      tokens.map((t: { token: string }) => t.token),
      title,
      body,
      data,
    )
  }

  /**
   * Batch-check quiet hours for multiple users. Returns the set of user IDs
   * currently in their quiet window.
   */
  private async getQuietHoursUserIds(
    userIds: string[],
    clubId: string,
  ): Promise<Set<string>> {
    const prefs = await this.prisma.notificationPreference.findMany({
      where: {
        userId: { in: userIds },
        clubId,
        quietStart: { not: null },
        quietEnd: { not: null },
      },
      select: { userId: true, quietStart: true, quietEnd: true },
    })

    if (prefs.length === 0) return new Set()

    const now = new Date()
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

    const quietIds = new Set<string>()
    for (const p of prefs) {
      const start = p.quietStart!
      const end = p.quietEnd!
      const isQuiet =
        start <= end
          ? hhmm >= start && hhmm < end
          : hhmm >= start || hhmm < end
      if (isQuiet) quietIds.add(p.userId)
    }

    return quietIds
  }

  /**
   * Public-facing send-to-tokens for admin broadcasts. Bypasses quiet
   * hours and notification preferences — broadcasts are explicit
   * platform-admin actions. Returns delivery stats per batch.
   */
  async sendToTokens(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<{ recipientCount: number; successCount: number; failureCount: number }> {
    if (tokens.length === 0) {
      return { recipientCount: 0, successCount: 0, failureCount: 0 }
    }

    let success = 0
    let failure = 0

    const messages: ExpoPushMessage[] = tokens.map((token) => ({
      to: token,
      title,
      body,
      data,
      sound: 'default' as const,
    }))

    for (let i = 0; i < messages.length; i += PUSH.BATCH_SIZE) {
      const batch = messages.slice(i, i + PUSH.BATCH_SIZE)
      try {
        const response = await fetch(this.EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(batch),
        })

        if (!response.ok) {
          failure += batch.length
          this.logger.error(`Expo Push API error: ${response.status}`)
          continue
        }

        const result = (await response.json()) as { data: ExpoPushTicket[] }
        const invalidTokens: string[] = []
        result.data.forEach((ticket, index) => {
          if (ticket.status === 'ok') {
            success++
          } else {
            failure++
            if (ticket.details?.error === 'DeviceNotRegistered') {
              invalidTokens.push(batch[index].to)
            }
          }
        })

        if (invalidTokens.length > 0) {
          await this.prisma.pushToken.deleteMany({
            where: { token: { in: invalidTokens } },
          })
        }
      } catch (err) {
        failure += batch.length
        this.logger.error('Failed to send broadcast batch', err)
      }
    }

    return {
      recipientCount: tokens.length,
      successCount: success,
      failureCount: failure,
    }
  }

  /**
   * Low-level: send Expo push notifications in batches.
   */
  private async sendPush(
    pushTokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
  ) {
    const messages: ExpoPushMessage[] = pushTokens.map((token) => ({
      to: token,
      title,
      body,
      data,
      sound: 'default' as const,
    }))

    // Map of ok-ticket id → token, for deferred receipt polling. Expo keys
    // receipts by ticket id; we keep the originating token so a deferred
    // DeviceNotRegistered receipt can prune the right row.
    const ticketTokens = new Map<string, string>()

    // Batch into groups of PUSH.BATCH_SIZE
    for (let i = 0; i < messages.length; i += PUSH.BATCH_SIZE) {
      const batch = messages.slice(i, i + PUSH.BATCH_SIZE)

      try {
        const response = await fetch(this.EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(batch),
        })

        if (!response.ok) {
          this.logger.error(`Expo Push API error: ${response.status}`)
          continue
        }

        const result = (await response.json()) as { data: ExpoPushTicket[] }

        // Clean up invalid tokens
        const invalidTokens: string[] = []
        result.data.forEach((ticket, index) => {
          if (ticket.status === 'ok') {
            ticketTokens.set(ticket.id, batch[index].to)
          } else if (
            ticket.status === 'error' &&
            ticket.details?.error === 'DeviceNotRegistered'
          ) {
            invalidTokens.push(batch[index].to)
          }
        })

        if (invalidTokens.length > 0) {
          await this.prisma.pushToken.deleteMany({
            where: { token: { in: invalidTokens } },
          })
          this.logger.log(`Cleaned up ${invalidTokens.length} invalid push tokens`)
        }
      } catch (err) {
        this.logger.error('Failed to send push notifications', err)
      }
    }

    // Expo defers some errors (DeviceNotRegistered, MessageRateExceeded) to the
    // receipt. Schedule a deferred receipt check to catch them and prune dead
    // tokens. Fire-and-forget — never block or fail the send.
    this.scheduleReceiptCheck(ticketTokens)
  }

  /**
   * Schedule a deferred receipt poll for the given ticket→token map. Expo asks
   * callers to wait before fetching receipts, so we defer by RECEIPT_DELAY_MS.
   * Skipped under tests (no real network / timers to leak).
   */
  private scheduleReceiptCheck(ticketTokens: Map<string, string>) {
    if (ticketTokens.size === 0) return
    if (process.env.NODE_ENV === 'test') return

    const timer = setTimeout(() => {
      void this.checkReceipts(ticketTokens).catch((err) =>
        this.logger.error('Receipt check failed', err),
      )
    }, this.RECEIPT_DELAY_MS)
    timer.unref?.()
  }

  /**
   * Fetch Expo push receipts for the given ticket→token map and prune push
   * tokens whose receipt reports DeviceNotRegistered. Batches receipt IDs in
   * groups of ≤1000 (Expo's documented limit) and swallows network errors.
   */
  async checkReceipts(ticketTokens: Map<string, string>): Promise<void> {
    if (ticketTokens.size === 0) return

    const ticketIds = Array.from(ticketTokens.keys())
    const RECEIPT_BATCH = 1000
    const deadTokens: string[] = []

    for (let i = 0; i < ticketIds.length; i += RECEIPT_BATCH) {
      const ids = ticketIds.slice(i, i + RECEIPT_BATCH)
      try {
        const response = await fetch(this.EXPO_RECEIPTS_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ ids }),
        })

        if (!response.ok) {
          this.logger.error(`Expo getReceipts error: ${response.status}`)
          continue
        }

        const result = (await response.json()) as {
          data?: Record<
            string,
            { status: 'ok' | 'error'; details?: { error?: string } }
          >
        }

        for (const [id, receipt] of Object.entries(result.data ?? {})) {
          if (
            receipt.status === 'error' &&
            receipt.details?.error === 'DeviceNotRegistered'
          ) {
            const token = ticketTokens.get(id)
            if (token) deadTokens.push(token)
          }
        }
      } catch (err) {
        this.logger.error('Failed to fetch push receipts', err)
      }
    }

    if (deadTokens.length > 0) {
      try {
        const deleted = await this.prisma.pushToken.deleteMany({
          where: { token: { in: deadTokens } },
        })
        if (deleted.count > 0) {
          this.logger.log(
            `Pruned ${deleted.count} push token(s) from DeviceNotRegistered receipts`,
          )
        }
      } catch (err) {
        this.logger.error('Failed to prune tokens from receipts', err)
      }
    }
  }
}
