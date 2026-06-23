import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { UpsertNotificationPreference, NotificationCategory } from '@anstoss/shared'

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all notification preferences for a user in a club.
   */
  async getPreferences(userId: string, clubId: string) {
    return this.prisma.notificationPreference.findMany({
      where: { userId, clubId },
      orderBy: { createdAt: 'asc' },
    })
  }

  /**
   * Upsert a notification preference for a user/club/team combination.
   */
  async upsertPreference(
    userId: string,
    clubId: string,
    data: UpsertNotificationPreference,
  ) {
    const teamId = data.teamId ?? null

    return this.prisma.notificationPreference.upsert({
      where: {
        userId_clubId_teamId: { userId, clubId, teamId: teamId as string },
      },
      create: {
        userId,
        clubId,
        teamId,
        mutedChat: data.mutedChat ?? false,
        mutedEvents: data.mutedEvents ?? false,
        mutedAnnouncements: data.mutedAnnouncements ?? false,
        quietStart: data.quietStart ?? null,
        quietEnd: data.quietEnd ?? null,
      },
      update: {
        ...(data.mutedChat !== undefined && { mutedChat: data.mutedChat }),
        ...(data.mutedEvents !== undefined && { mutedEvents: data.mutedEvents }),
        ...(data.mutedAnnouncements !== undefined && {
          mutedAnnouncements: data.mutedAnnouncements,
        }),
        ...(data.quietStart !== undefined && { quietStart: data.quietStart }),
        ...(data.quietEnd !== undefined && { quietEnd: data.quietEnd }),
      },
    })
  }

  /**
   * Get user IDs that should be excluded from push for a given team + category.
   * Checks both team-specific and club-wide preferences.
   */
  async getMutedUserIds(
    clubId: string,
    teamId: string,
    category: NotificationCategory,
  ): Promise<Set<string>> {
    const field = categoryToField(category)

    const muted = await this.prisma.notificationPreference.findMany({
      where: {
        clubId,
        OR: [{ teamId }, { teamId: null }],
        [field]: true,
      },
      select: { userId: true },
    })

    return new Set(muted.map((m) => m.userId))
  }

  /**
   * Whether a single user has muted a category for this club (club-wide or for
   * any team in it). Used by per-user sends (sendToUser), which — unlike the
   * team fan-out — had no category-mute check, so muted users still got
   * reply/mention/media pings.
   */
  async isMuted(
    userId: string,
    clubId: string,
    category: NotificationCategory,
  ): Promise<boolean> {
    const field = categoryToField(category)
    const row = await this.prisma.notificationPreference.findFirst({
      where: { userId, clubId, [field]: true },
      select: { userId: true },
    })
    return !!row
  }

  /**
   * Check if a user is in their quiet hours right now.
   */
  async isInQuietHours(userId: string, clubId: string): Promise<boolean> {
    const prefs = await this.prisma.notificationPreference.findMany({
      where: {
        userId,
        clubId,
        quietStart: { not: null },
        quietEnd: { not: null },
      },
      select: { quietStart: true, quietEnd: true },
    })

    if (prefs.length === 0) return false

    const now = new Date()
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

    return prefs.some((p) => {
      const start = p.quietStart!
      const end = p.quietEnd!
      // Handle overnight ranges (e.g., 22:00 → 07:00)
      if (start <= end) {
        return hhmm >= start && hhmm < end
      }
      return hhmm >= start || hhmm < end
    })
  }
}

function categoryToField(
  category: NotificationCategory,
): 'mutedChat' | 'mutedEvents' | 'mutedAnnouncements' {
  switch (category) {
    case 'chat':
      return 'mutedChat'
    case 'events':
      return 'mutedEvents'
    case 'announcements':
      return 'mutedAnnouncements'
  }
}
