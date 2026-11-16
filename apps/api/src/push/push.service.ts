import { ConflictException, Injectable, Logger, Optional, Inject } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { PUSH, type PushRegistrationLease } from '@anstoss/shared'
import { resolveLocale, type Locale } from '../i18n/translations'
import { activeTeamAccessWhere } from '../teams/active-team-access'
import { formatPush, type NotificationType, type TemplateData } from './push.templates'
// Privacy/safeguarding: recipients who fail the age gate for the push's club
// (e.g. consent withdrawn) are skipped.
import { AgeGateService } from '../auth/age-gate.service'
import { InboxService } from '../inbox/inbox.service'
import { isInboxWorthy, type InboxRenderedType } from '../inbox/inbox.policy'
import { isQuietAt } from '../notifications/quiet-hours'
import { advanceReminderDelivery } from './reminder-delivery'
import { reminderTransport } from './reminder-transport'
interface NotificationChecker {
  getMutedUserIds(clubId: string, teamId: string, category: string): Promise<Set<string>>
  isInQuietHours(userId: string, clubId: string): Promise<boolean>
  isMuted(
    userId: string,
    clubId: string,
    category: 'chat' | 'events' | 'announcements',
  ): Promise<boolean>
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
  { status: 'ok'; id: string } | { status: 'error'; message: string; details?: { error: string } }

type PushRegistration = { id: string; token: string; userId: string; updatedAt: Date }
const registrationLease = (row: { id: string; updatedAt: Date }): PushRegistrationLease => (
  { id: row.id, updatedAt: row.updatedAt.toISOString() }
)
export class PushRegistrationChangedException extends ConflictException {
  constructor(row: { id: string; updatedAt: Date } | null) {
    super({ code: 'push_registration_changed', registration: row ? registrationLease(row) : null })
  }
}

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
  private readonly RECEIPT_DELAY_MS = 15 * 60_000

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject('NotificationsService')
    private readonly notificationsService?: NotificationChecker,
    @Optional() private readonly ageGate?: AgeGateService,
    @Optional() private readonly inbox?: InboxService,
  ) {}

  /**
   * Register or update an Expo push token for a user.
   */
  async registerToken(userId: string, token: string, platform: string, expected?: PushRegistrationLease | null) {
    const current = await this.prisma.pushToken.findUnique({ where: { token } })
    if (!current) {
      if (expected) throw new PushRegistrationChangedException(null)
      try {
        return registrationLease(await this.prisma.pushToken.create({ data: { userId, token, platform } }))
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
        throw new PushRegistrationChangedException(await this.prisma.pushToken.findUnique({ where: { token } }))
      }
    }
    // Legacy clients may retain their own binding, but cannot overwrite a new
    // owner/version. Upgraded clients explicitly use null or a previous lease.
    if (expected === undefined && current.userId === userId) return registrationLease(current)
    if (!expected || expected.id !== current.id || expected.updatedAt !== current.updatedAt.toISOString()) {
      throw new PushRegistrationChangedException(current)
    }
    // Distinct leases even when two requests land in the same millisecond.
    const updatedAt = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1))
    const changed = await this.prisma.pushToken.updateMany({
      where: { token, id: expected.id, updatedAt: new Date(expected.updatedAt) },
      data: { userId, platform, updatedAt },
    })
    if (!changed.count) throw new PushRegistrationChangedException(await this.prisma.pushToken.findUnique({ where: { token } }))
    return { id: current.id, updatedAt: updatedAt.toISOString() }
  }

  /**
   * Remove a push token (user logged out or token expired).
   */
  async removeToken(token: string, userId: string, expected?: PushRegistrationLease) {
    // A legacy DELETE has no proof of which registration it intends to remove.
    if (!expected) return { count: 0 }
    return this.prisma.pushToken.deleteMany({
      where: { token, userId, id: expected.id, updatedAt: new Date(expected.updatedAt) },
    })
  }

  private async snapshotRegistrations(tokens: string[]): Promise<Map<string, PushRegistration>> {
    const rows = await this.prisma.pushToken.findMany({
      where: { token: { in: tokens } },
      select: { id: true, token: true, userId: true, updatedAt: true },
    })
    return new Map(rows.map(row => [row.token, row]))
  }

  private pruneRegistrations(registrations: PushRegistration[]) {
    // A delayed provider error belongs to the registration that was sent.
    // Re-registration, reassignment and delete/recreate must survive it.
    return this.prisma.pushToken.deleteMany({ where: { OR: registrations.map(({ id, token, userId, updatedAt }) => (
      { id, token, userId, updatedAt }
    )) } })
  }

  private async isClosedChannel(data?: Record<string, string>): Promise<boolean> {
    if (!data?.channelId) return false
    const channel = await this.prisma.channel.findUnique({
      where: { id: data.channelId, ...(data.clubId ? { clubId: data.clubId } : {}) },
      select: { archivedAt: true },
    })
    return !channel || channel.archivedAt !== null
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
        ...activeTeamAccessWhere(),
      },
      select: { userId: true, clubId: true },
    })

    let userIds = Array.from(
      new Set(
        teamMembers
          .map((m: (typeof teamMembers)[number]) => m.userId)
          .filter((id: string) => id !== excludeUserId),
      ),
    )

    // Privacy: a child whose consent for this team/club was withdrawn gets
    // no further pushes from it.
    if (this.ageGate && userIds.length > 0) {
      const clubId = options?.clubId ?? teamMembers[0]?.clubId ?? null
      userIds = await this.ageGate.filterAllowedUserIds(userIds, { clubId, teamId })
    }

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
   * Inbox recipients for a team fan-out: active members minus the sender,
   * filtered by the privacy age gate only. Mutes and quiet hours silence the
   * push, not the inbox record.
   */
  private async resolveTeamInboxRecipientIds(
    teamId: string,
    excludeUserId?: string,
    clubId?: string,
  ): Promise<string[]> {
    const teamMembers = await this.prisma.teamAccess.findMany({
      where: { teamId, ...activeTeamAccessWhere() },
      select: { userId: true, clubId: true },
    })
    let userIds = Array.from(
      new Set(
        teamMembers
          .map((m: (typeof teamMembers)[number]) => m.userId)
          .filter((id: string) => id !== excludeUserId),
      ),
    )
    if (this.ageGate && userIds.length > 0) {
      userIds = await this.ageGate.filterAllowedUserIds(userIds, {
        clubId: clubId ?? teamMembers[0]?.clubId ?? null,
        teamId,
      })
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
    if (await this.isClosedChannel(payload)) return
    if (this.inbox && isInboxWorthy(type, templateData)) {
      const inboxUserIds = await this.resolveTeamInboxRecipientIds(
        teamId,
        excludeUserId,
        options?.clubId,
      )
      await this.inbox.record(inboxUserIds, {
        kind: 'template',
        type,
        data: templateData,
        target: payload,
        clubId: options?.clubId ?? payload?.clubId ?? null,
        teamId,
      })
    }
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
    options?: {
      clubId?: string
      category?: 'chat' | 'events' | 'announcements'
      /** Also store this push in each recipient's inbox under this type. */
      inboxType?: InboxRenderedType
    },
  ) {
    if (await this.isClosedChannel(payload)) return
    if (this.inbox && options?.inboxType) {
      const inboxUserIds = await this.resolveTeamInboxRecipientIds(
        teamId,
        excludeUserId,
        options.clubId,
      )
      await this.inbox.record(inboxUserIds, {
        kind: 'rendered',
        type: options.inboxType,
        render,
        target: payload,
        clubId: options.clubId ?? payload?.clubId ?? null,
        teamId,
      })
    }
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
    options?: { clubId?: string; category?: 'chat' | 'events' | 'announcements' },
  ) {
    if (await this.isClosedChannel(payload)) return
    if (this.inbox && isInboxWorthy(type, templateData)) {
      // The inbox keeps the entry even when the push itself is held back by a
      // mute or quiet hours; only the privacy age gate stops it.
      const allowed = this.ageGate
        ? await this.ageGate.isAllowed(userId, {
            clubId: options?.clubId ?? payload?.clubId ?? null,
            teamId: payload?.teamId ?? null,
          })
        : true
      if (allowed) {
        await this.inbox.record([userId], {
          kind: 'template',
          type,
          data: templateData,
          target: payload,
          clubId: options?.clubId ?? payload?.clubId ?? null,
          teamId: payload?.teamId ?? null,
        })
      }
    }
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
    options?: { clubId?: string; category?: 'chat' | 'events' | 'announcements' },
  ) {
    if (!await this.canSendToUser(userId, data, options)) return { acceptedCount: 0 }
    const tokens = await this.prisma.pushToken.findMany({ where: { userId }, select: { token: true } })
    if (tokens.length === 0) return { acceptedCount: 0 }
    return this.sendPush(tokens.map((t) => t.token), title, body, data)
  }

  private async canSendToUser(
    userId: string,
    data?: Record<string, string>,
    options?: { clubId?: string; category?: 'chat' | 'events' | 'announcements' },
  ): Promise<boolean> {
    // Privacy: skip users who fail the age gate for this club (or, with no
    // club context, who have no consented club at all).
    if (this.ageGate) {
      const allowed = await this.ageGate.isAllowed(userId, {
        clubId: options?.clubId ?? data?.clubId ?? null,
        teamId: data?.teamId ?? null,
      })
      if (!allowed) {
        this.logger.debug(`Skipping push to ${userId} — age gate`)
        return false
      }
    }
    // Skip if user is in quiet hours
    if (this.notificationsService && options?.clubId) {
      const inQuiet = await this.notificationsService.isInQuietHours(userId, options.clubId)
      if (inQuiet) {
        this.logger.debug(`Skipping push to ${userId} — in quiet hours`)
        return false
      }
      // Skip if the user muted this category for the club. Per-user sends had
      // no mute check before — only the team fan-out did.
      if (options.category) {
        const muted = await this.notificationsService.isMuted(
          userId,
          options.clubId,
          options.category,
        )
        if (muted) {
          this.logger.debug(`Skipping push to ${userId} — muted ${options.category}`)
          return false
        }
      }
    }
    return true
  }

  /** Called only under the reminder preference's row lock. No in-memory
   * receipt timers: the worker persists the returned state before releasing it. */
  async advanceEventReminder(input: {
    userId: string; saved: unknown; eventDate: Date; title: string; body: string;
    data: Record<string, string>;
  }) {
    const tokens = await this.prisma.pushToken.findMany({
      where: { userId: input.userId }, select: { id: true, token: true }, orderBy: { id: 'asc' }, take: 100,
    })
    const canSend = await this.canSendToUser(input.userId, input.data, { clubId: input.data.clubId, category: 'events' })
    const result = await advanceReminderDelivery({
      saved: input.saved, eventDate: input.eventDate, now: Date.now(), tokens, canSend,
      transport: reminderTransport({ ...input, expiresAt: input.eventDate }),
    })
    if (result.deadTokens.length) {
      // Recheck ownership and registration timestamp: a delayed receipt must
      // not remove a token re-registered or transferred after this attempt.
      try {
        await this.prisma.pushToken.deleteMany({ where: {
          userId: input.userId,
          OR: result.deadTokens.map((token) => ({ id: token.id, updatedAt: { lte: new Date(token.attemptedAt) } })),
        } })
      } catch {
        // Retain successful tickets even if best-effort dead-token cleanup fails.
        this.logger.warn('Reminder token cleanup failed; durable receipt outcomes retained')
      }
    }
    return result
  }

  /**
   * Batch-check quiet hours for multiple users. Returns the set of user IDs
   * currently in their quiet window.
   */
  private async getQuietHoursUserIds(userIds: string[], clubId: string): Promise<Set<string>> {
    const prefs = await this.prisma.notificationPreference.findMany({
      where: {
        userId: { in: userIds },
        clubId,
        quietStart: { not: null },
        quietEnd: { not: null },
      },
      select: { userId: true, quietStart: true, quietEnd: true, quietTimeZone: true },
    })

    if (prefs.length === 0) return new Set()

    const now = new Date()
    const quietIds = new Set<string>()
    for (const p of prefs) {
      if (isQuietAt(p, now)) quietIds.add(p.userId)
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
      channelId: 'default',
    }))

    for (let i = 0; i < messages.length; i += PUSH.BATCH_SIZE) {
      const batch = messages.slice(i, i + PUSH.BATCH_SIZE)
      try {
        const registrations = await this.snapshotRegistrations(batch.map(message => message.to))
        if (await this.isClosedChannel(data)) break
        const response = await fetch(this.EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(batch),
          signal: AbortSignal.timeout(8000),
        })

        if (!response.ok) {
          failure += batch.length
          this.logger.error(`Expo Push API error: ${response.status}`)
          continue
        }

        const result = (await response.json()) as { data: ExpoPushTicket[] }
        const invalidTokens: PushRegistration[] = []
        result.data.forEach((ticket, index) => {
          if (ticket.status === 'ok') {
            success++
          } else {
            failure++
            this.logger.error(`Expo push rejected: ${ticket.details?.error ?? 'unknown'}`)
            if (ticket.details?.error === 'DeviceNotRegistered') {
              const registration = registrations.get(batch[index]?.to)
              if (registration) invalidTokens.push(registration)
            }
          }
        })

        if (invalidTokens.length > 0) {
          await this.pruneRegistrations(invalidTokens)
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
  ): Promise<{ acceptedCount: number }> {
    const messages: ExpoPushMessage[] = pushTokens.map((token) => ({
      to: token,
      title,
      body,
      data,
      sound: 'default' as const,
      channelId: 'default',
    }))

    // Map of ok-ticket id → token, for deferred receipt polling. Expo keys
    // receipts by ticket id; we keep the originating token so a deferred
    // DeviceNotRegistered receipt can prune the right row.
    const ticketTokens = new Map<string, PushRegistration>()
    let acceptedCount = 0

    // Batch into groups of PUSH.BATCH_SIZE
    for (let i = 0; i < messages.length; i += PUSH.BATCH_SIZE) {
      const batch = messages.slice(i, i + PUSH.BATCH_SIZE)

      try {
        const registrations = await this.snapshotRegistrations(batch.map(message => message.to))
        if (await this.isClosedChannel(data)) break
        const response = await fetch(this.EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(batch),
          signal: AbortSignal.timeout(8000),
        })

        if (!response.ok) {
          this.logger.error(`Expo Push API error: ${response.status}`)
          continue
        }

        const result = (await response.json()) as { data: ExpoPushTicket[] }

        // Clean up invalid tokens
        const invalidTokens: PushRegistration[] = []
        result.data.forEach((ticket, index) => {
          const registration = registrations.get(batch[index]?.to)
          if (ticket.status === 'ok') {
            acceptedCount++
            if (registration) ticketTokens.set(ticket.id, registration)
          } else if (ticket.status === 'error') {
            // Never log tokens or message content, but don't silently swallow
            // missing APNs/FCM credentials or sender/project mismatches.
            this.logger.error(`Expo push rejected: ${ticket.details?.error ?? 'unknown'}`)
            if (ticket.details?.error === 'DeviceNotRegistered' && registration) invalidTokens.push(registration)
          }
        })

        if (invalidTokens.length > 0) {
          await this.pruneRegistrations(invalidTokens)
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
    // Provider acceptance is not a device-delivery receipt. Callers must not
    // discard retryable reminders when every push was rejected or suppressed.
    return { acceptedCount }
  }

  /**
   * Schedule a deferred receipt poll for the given ticket→token map. Expo asks
   * callers to wait before fetching receipts, so we defer by RECEIPT_DELAY_MS.
   * Skipped under tests (no real network / timers to leak).
   */
  private scheduleReceiptCheck(ticketTokens: Map<string, PushRegistration>) {
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
  async checkReceipts(ticketTokens: Map<string, PushRegistration>): Promise<void> {
    if (ticketTokens.size === 0) return

    const ticketIds = Array.from(ticketTokens.keys())
    const RECEIPT_BATCH = 1000
    const deadTokens: PushRegistration[] = []

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
          signal: AbortSignal.timeout(8000),
        })

        if (!response.ok) {
          this.logger.error(`Expo getReceipts error: ${response.status}`)
          continue
        }

        const result = (await response.json()) as {
          data?: Record<string, { status: 'ok' | 'error'; details?: { error?: string } }>
        }

        for (const [id, receipt] of Object.entries(result.data ?? {})) {
          if (receipt.status === 'error') {
            this.logger.error(`Expo push delivery failed: ${receipt.details?.error ?? 'unknown'}`)
          }
          if (receipt.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') {
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
        const deleted = await this.pruneRegistrations(deadTokens)
        if (deleted.count > 0) {
          this.logger.log(`Pruned ${deleted.count} push token(s) from DeviceNotRegistered receipts`)
        }
      } catch (err) {
        this.logger.error('Failed to prune tokens from receipts', err)
      }
    }
  }
}
