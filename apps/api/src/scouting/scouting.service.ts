import { Injectable } from '@nestjs/common'
import { FreeAgentVisibility } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'

export type ScoutingFeedItem = {
  id: string
  userId: string
  name: string
  age: number
  position: 'GK' | 'DEF' | 'MID' | 'ATT'
  foot: 'LEFT' | 'RIGHT' | 'BOTH'
  postcode: string
  distanceKm: number
  history: string
  note: string
  avatarUrl: string | null
  videoUrl: string | null
  contactedByThisClub: boolean
  postedAt: string
}

@Injectable()
export class ScoutingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Surfaces public free-agent profiles to a club's scouting view.
   * Reuses the same data plane as /transfer-list — anything that opted
   * in to PUBLIC visibility AND is on the transfer list lands here.
   *
   * The frontend Scouting type has more fields than FreeAgentProfile
   * actually carries (postcode, distanceKm, age, etc). For now we
   * derive what we can from related records and stub the rest with
   * empty defaults — the empty state on the client is graceful.
   * `contactedByThisClub` is always false in this stub; a follow-up
   * can join against a `ScoutingInterest` table once the schema lands.
   */
  async listFeed(clubId: string): Promise<ScoutingFeedItem[]> {
    void clubId // tenant-aware filtering lands when contactedByThisClub does
    const profiles = await this.prisma.freeAgentProfile.findMany({
      where: {
        isOnTransferList: true,
        visibility: FreeAgentVisibility.PUBLIC,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            dateOfBirth: true,
          },
        },
        experience: {
          orderBy: [{ sortOrder: 'asc' as const }],
          take: 1,
        },
        media: {
          where: { type: 'VIDEO' },
          orderBy: [{ sortOrder: 'asc' as const }],
          take: 1,
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 50,
    })

    return profiles.map((p: any) => {
      const dob: Date | null = p.user.dateOfBirth ?? null
      const age = dob ? Math.floor((Date.now() - dob.getTime()) / 31_557_600_000) : 0
      const firstExp = p.experience?.[0]
      const history = firstExp
        ? `${firstExp.clubName}${firstExp.roleLabel ? ` · ${firstExp.roleLabel}` : ''}`
        : ''

      return {
        id: p.id,
        userId: p.user.id,
        name: p.user.name,
        age,
        // Frontend uses ATT instead of FWD — translate.
        position: (p.position === 'FWD' ? 'ATT' : p.position) ?? 'MID',
        foot: p.preferredFoot ?? 'RIGHT',
        // FreeAgentProfile only stores city, not postcode. Use city as
        // the surfaced label for now.
        postcode: p.city ?? '',
        distanceKm: 0,
        history,
        note: p.bio ?? '',
        avatarUrl: p.user.avatarUrl ?? null,
        videoUrl: p.media?.[0]?.url ?? null,
        contactedByThisClub: false,
        postedAt:
          p.updatedAt instanceof Date
            ? p.updatedAt.toISOString()
            : new Date().toISOString(),
      }
    })
  }

  /**
   * Stub — accepts the call so the frontend's optimistic toggle works
   * end-to-end without a 404. A real persistence path lands when the
   * `ScoutingInterest` model is added.
   */
  async markInterest(
    _clubId: string,
    _userId: string,
    _agentId: string,
    _contacted: boolean,
  ): Promise<void> {
    return
  }
}
