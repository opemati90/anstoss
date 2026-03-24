import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PUSH, TeamAccessStatus } from '@anstoss/shared'

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

  constructor(private readonly prisma: PrismaService) {}

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
  async removeToken(token: string) {
    return this.prisma.pushToken.deleteMany({
      where: { token },
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
  ) {
    const teamMembers = await this.prisma.teamAccess.findMany({
      where: {
        teamId,
        status: TeamAccessStatus.ACTIVE,
      },
      select: { userId: true },
    })

    const userIds = Array.from(
      new Set(
        teamMembers
          .map((m: typeof teamMembers[number]) => m.userId)
          .filter((id: string) => id !== excludeUserId),
      ),
    )

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
  ) {
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
