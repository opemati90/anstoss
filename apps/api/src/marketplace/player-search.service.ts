import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import {
  PlayerSearchStatus,
  postalPrefixForRadius,
  type CreatePlayerSearchInput,
  type PlayerSearch,
  type PlayerSearchListQueryInput,
  type PlayerSearchListResponse,
  type UpdatePlayerSearchInput,
} from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { OPEN_TRIAL_STATUSES } from './marketplace.service'
import { assertTeamInScope, resolveTrialScope, teamFilterForScope } from './trial-scope'

/**
 * Gesuche: a club posts "Herren II sucht Torwart"; free agents browse open
 * ones near them and ask for a Probetraining.
 */
@Injectable()
export class PlayerSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async listForClub(clubId: string, userId: string): Promise<PlayerSearch[]> {
    const scope = await resolveTrialScope(this.prisma as any, clubId, userId)
    // Lapsed Gesuche close themselves so the list stays honest.
    await this.prisma.playerSearch.updateMany({
      where: { clubId, status: PlayerSearchStatus.OPEN, expiresAt: { lt: new Date() } },
      data: { status: PlayerSearchStatus.CLOSED },
    })
    const rows = await this.prisma.playerSearch.findMany({
      where: { clubId, ...teamFilterForScope(scope) },
      include: {
        ...playerSearchInclude,
        _count: {
          select: { trialInvites: { where: { status: { in: OPEN_TRIAL_STATUSES } } } },
        },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    })
    return rows.map((row: any) => ({
      ...mapPlayerSearch(row),
      openTrialCount: row._count?.trialInvites ?? 0,
    }))
  }

  async create(
    clubId: string,
    userId: string,
    input: CreatePlayerSearchInput,
  ): Promise<PlayerSearch> {
    const scope = await resolveTrialScope(this.prisma as any, clubId, userId)
    assertTeamInScope(scope, input.teamId, 'Team')
    const team = await this.prisma.team.findFirst({
      where: { id: input.teamId, clubId },
      select: { id: true },
    })
    if (!team) throw new NotFoundException('Team not found')

    const expiresAt = input.expiresAt ? endOfDay(input.expiresAt) : null
    if (expiresAt && expiresAt < new Date()) {
      throw new BadRequestException('The end date must be in the future')
    }

    const created = await this.prisma.playerSearch.create({
      data: {
        clubId,
        teamId: input.teamId,
        positions: Array.from(new Set(input.positions)),
        note: input.note?.trim() || null,
        createdByUserId: userId,
        expiresAt,
      },
      include: playerSearchInclude,
    })
    return { ...mapPlayerSearch(created), openTrialCount: 0 }
  }

  async update(
    clubId: string,
    searchId: string,
    userId: string,
    input: UpdatePlayerSearchInput,
  ): Promise<PlayerSearch> {
    const scope = await resolveTrialScope(this.prisma as any, clubId, userId)
    const existing = await this.prisma.playerSearch.findFirst({
      where: { id: searchId, clubId },
      select: { id: true, teamId: true },
    })
    if (!existing) throw new NotFoundException('Player search not found')
    assertTeamInScope(scope, existing.teamId, 'Player search')

    const updated = await this.prisma.playerSearch.update({
      where: { id: searchId },
      data: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.positions ? { positions: Array.from(new Set(input.positions)) } : {}),
        ...(input.note !== undefined ? { note: input.note?.trim() || null } : {}),
        ...(input.expiresAt !== undefined
          ? { expiresAt: input.expiresAt ? endOfDay(input.expiresAt) : null }
          : {}),
      },
      include: playerSearchInclude,
    })
    return mapPlayerSearch(updated)
  }

  /** Open Gesuche for free agents, newest first, optionally near a PLZ. */
  async listOpen(
    query: PlayerSearchListQueryInput,
    userId: string,
  ): Promise<PlayerSearchListResponse> {
    const now = new Date()
    const prefix = query.postalCode
      ? postalPrefixForRadius(query.postalCode, query.radiusKm ?? 25)
      : null
    const where = {
      status: PlayerSearchStatus.OPEN,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      ...(query.position ? { positions: { has: query.position } } : {}),
      ...(prefix
        ? { club: { directoryEntry: { is: { postalCode: { startsWith: prefix } } } } }
        : {}),
    }

    const [rows, total] = await Promise.all([
      this.prisma.playerSearch.findMany({
        where,
        include: playerSearchInclude,
        orderBy: [{ createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.playerSearch.count({ where }),
    ])

    // Mark Gesuche the caller already has an open trial with (same club
    // counts: a player can only run one trial per club at a time).
    const clubIds = Array.from(new Set(rows.map((row: any) => row.clubId)))
    const myOpen = clubIds.length
      ? await this.prisma.trialInvite.findMany({
          where: {
            clubId: { in: clubIds },
            status: { in: OPEN_TRIAL_STATUSES },
            freeAgentProfile: { userId },
          },
          select: { id: true, clubId: true },
        })
      : []
    const openByClub = new Map(myOpen.map((invite: any) => [invite.clubId, invite.id]))

    return {
      items: rows.map((row: any) => ({
        ...mapPlayerSearch(row),
        myTrialInviteId: openByClub.get(row.clubId) ?? null,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    }
  }
}

const playerSearchInclude = {
  club: {
    select: { id: true, name: true, badgeUrl: true, primaryColor: true, city: true },
  },
  team: {
    select: { id: true, displayName: true, leagueName: true, ageGroup: true },
  },
}

function mapPlayerSearch(row: any): PlayerSearch {
  return {
    id: row.id,
    clubId: row.clubId,
    teamId: row.teamId,
    positions: row.positions ?? [],
    note: row.note ?? null,
    status: row.status,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    club: {
      id: row.club.id,
      name: row.club.name,
      badgeUrl: row.club.badgeUrl ?? null,
      primaryColor: row.club.primaryColor,
      city: row.club.city ?? null,
    },
    team: {
      id: row.team.id,
      displayName: row.team.displayName,
      leagueName: row.team.leagueName ?? null,
      ageGroup: row.team.ageGroup ?? null,
    },
  }
}

/** "gültig bis 30.09." means through the end of that day. */
function endOfDay(date: string): Date {
  return new Date(`${date}T23:59:59.999Z`)
}
