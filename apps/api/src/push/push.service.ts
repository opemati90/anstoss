import { Injectable, Logger, Optional, Inject } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PUSH, TeamAccessStatus } from '@anstoss/shared'
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
      const quietUserIds = await this.getQuietHoursUserIds(
        userIds,
        options.clubId,
      )
      if (quietUserIds.size > 0) {
        userIds = userIds.filter((id) => !quietUserIds.has(id))
        this.logger.debug(
          `Filtered ${quietUserIds.size} user(s) in quiet hours`,
        )
      }
    }

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
          if (
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
  }
}
