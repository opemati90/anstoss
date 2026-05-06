import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export type StreaksResponse = {
  me: {
    attendanceWeeks: number
    attendanceLongest: number
    motmWeeks: number
    motmLongest: number
    lastActivityAt: string
  }
  leaderboard: Array<{
    userId: string
    name: string
    attendanceWeeks: number
    motmWeeks: number
  }>
}

@Injectable()
export class StreaksService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Stub implementation: returns zero streaks for the caller and the
   * top 10 club members as a baseline leaderboard with zero counts.
   * Real consecutive-week tallies live behind events RSVPs + MOTM
   * winners; that aggregation lands in a follow-up. The shape matches
   * what apps/mobile/app/streaks.tsx expects so the empty-state
   * render works end-to-end.
   */
  async getStreaks(clubId: string, userId: string): Promise<StreaksResponse> {
    const memberships = await this.prisma.membership.findMany({
      where: { clubId },
      select: {
        userId: true,
        user: { select: { id: true, name: true } },
      },
      take: 10,
    })

    return {
      me: {
        attendanceWeeks: 0,
        attendanceLongest: 0,
        motmWeeks: 0,
        motmLongest: 0,
        lastActivityAt: new Date().toISOString(),
      },
      leaderboard: memberships
        .filter((m) => m.userId !== userId)
        .map((m) => ({
          userId: m.user.id,
          name: m.user.name,
          attendanceWeeks: 0,
          motmWeeks: 0,
        })),
    }
  }
}
