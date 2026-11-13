import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import {
  MatchLiveTransitionError,
  MatchLiveUnavailableError,
  TeamAccessDeniedError,
  type MatchLiveEventDto,
  type MatchLiveStateDto,
  type MatchLiveStatus,
  type RecordMatchLiveEvent,
  type UpdateMatchLiveState,
} from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { PushService } from '../push/push.service'
import { TeamsService } from '../teams/teams.service'
import { activeTeamAccessWhere } from '../teams/active-team-access'
import { LiveGateway } from './live.gateway'

/** Allowed clock moves. FINISHED is terminal; corrections stay possible via events. */
const TRANSITIONS: Record<MatchLiveStatus, MatchLiveStatus[]> = {
  NOT_STARTED: ['FIRST_HALF'],
  FIRST_HALF: ['HALF_TIME', 'FINISHED'],
  HALF_TIME: ['SECOND_HALF', 'FINISHED'],
  SECOND_HALF: ['FINISHED'],
  FINISHED: [],
}

const HALF_LENGTH = 45
const MAX_MINUTE = 130

type EventRow = {
  id: string
  clubId: string
  teamId: string
  type: string
  opponent: string | null
  homeAway: 'HOME' | 'AWAY' | null
}

type LiveRow = {
  eventId: string
  status: MatchLiveStatus
  goalsFor: number
  goalsAgainst: number
  kickoffAt: Date | null
  halfTimeAt: Date | null
  secondHalfAt: Date | null
  finishedAt: Date | null
}

type LiveEventRow = {
  id: string
  kind: MatchLiveEventDto['kind']
  minute: number
  playerUserId: string | null
  playerName: string | null
  relatedUserId: string | null
  relatedName: string | null
  createdAt: Date
}

/**
 * Coach-recorded live match (screen 14 Live-Spiel): kick-off, half time,
 * second half and the final whistle, plus goals, goals against, cards and
 * substitutions. Every change is broadcast to the `live-event:{eventId}` room
 * and goals / full time are pushed to the team.
 */
@Injectable()
export class MatchLiveService {
  private readonly logger = new Logger(MatchLiveService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly teams: TeamsService,
    private readonly push: PushService,
    private readonly gateway: LiveGateway,
  ) {}

  async getState(clubId: string, eventId: string, userId: string): Promise<MatchLiveStateDto> {
    const event = await this.loadMatch(clubId, eventId)
    await this.teams.assertReadableAccess(userId, event.teamId, { eventId })
    const canRecord = await this.canRecord(userId, event.teamId)
    return this.buildState(event, canRecord)
  }

  /** Read for the socket join: no clubId context, so filter explicitly. */
  async getStateForSocket(eventId: string, userId: string): Promise<MatchLiveStateDto> {
    const event = (await this.prisma.event.findFirst({
      where: { id: eventId },
      select: { id: true, clubId: true, teamId: true, type: true, opponent: true, homeAway: true },
    })) as EventRow | null
    if (!event) throw new NotFoundException('Event not found')
    if (event.type !== 'MATCH') throw new MatchLiveUnavailableError('Event is not a match')
    await this.teams.assertReadableAccess(userId, event.teamId, { eventId })
    return this.buildState(event, await this.canRecord(userId, event.teamId))
  }

  async updateState(
    clubId: string,
    eventId: string,
    userId: string,
    input: UpdateMatchLiveState,
  ): Promise<MatchLiveStateDto> {
    const event = await this.loadMatch(clubId, eventId)
    await this.teams.assertEventManagementAccess(userId, event.teamId)

    const now = new Date()
    const current = await this.loadLive(eventId)
    const from: MatchLiveStatus = current?.status ?? 'NOT_STARTED'
    const to = input.status
    if (!TRANSITIONS[from].includes(to)) throw new MatchLiveTransitionError(from, to)

    const stamp =
      to === 'FIRST_HALF'
        ? { kickoffAt: now }
        : to === 'HALF_TIME'
          ? { halfTimeAt: now }
          : to === 'SECOND_HALF'
            ? { secondHalfAt: now }
            : { finishedAt: now }

    await this.prisma.matchLive.upsert({
      where: { eventId },
      create: { eventId, clubId: event.clubId, teamId: event.teamId, status: to, ...stamp },
      update: { status: to, ...stamp },
    })

    const state = await this.buildState(event, true)
    this.gateway.broadcastMatchState(eventId, { ...state, canRecord: false })
    if (to === 'FINISHED') {
      void this.pushScore(event, state, 'FULL_TIME', userId)
    }
    return state
  }

  async recordEvent(
    clubId: string,
    eventId: string,
    userId: string,
    input: RecordMatchLiveEvent,
  ): Promise<MatchLiveStateDto> {
    const event = await this.loadMatch(clubId, eventId)
    await this.teams.assertEventManagementAccess(userId, event.teamId)

    const live = await this.loadLive(eventId)
    if (!live || live.status === 'NOT_STARTED') {
      throw new MatchLiveUnavailableError('Record kick-off before match events')
    }

    const [player, related] = await Promise.all([
      this.resolvePlayer(event.teamId, input.playerUserId, input.playerName),
      this.resolvePlayer(event.teamId, input.relatedUserId, input.relatedName),
    ])
    const minute = input.minute ?? deriveMinute(live, new Date()) ?? 0

    await this.prisma.$transaction(async (tx: any) => {
      await tx.matchLiveEvent.create({
        data: {
          clubId: event.clubId,
          eventId,
          kind: input.kind,
          minute,
          playerUserId: player.userId,
          playerName: player.name,
          relatedUserId: related.userId,
          relatedName: related.name,
          createdById: userId,
        },
      })
      await this.recountScore(tx, eventId)
    })

    const state = await this.buildState(event, true)
    this.gateway.broadcastMatchState(eventId, { ...state, canRecord: false })
    if (input.kind === 'GOAL' || input.kind === 'CONCEDED') {
      void this.pushScore(event, state, 'GOAL', userId)
    }
    return state
  }

  /** Undo: soft-delete the entry and recount the score. */
  async deleteEvent(
    clubId: string,
    eventId: string,
    liveEventId: string,
    userId: string,
  ): Promise<MatchLiveStateDto> {
    const event = await this.loadMatch(clubId, eventId)
    await this.teams.assertEventManagementAccess(userId, event.teamId)

    await this.prisma.$transaction(async (tx: any) => {
      const result = await tx.matchLiveEvent.updateMany({
        where: { id: liveEventId, eventId, deletedAt: null },
        data: { deletedAt: new Date() },
      })
      if (result.count === 0) throw new NotFoundException('Live event not found')
      await this.recountScore(tx, eventId)
    })

    const state = await this.buildState(event, true)
    this.gateway.broadcastMatchState(eventId, { ...state, canRecord: false })
    return state
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private async loadMatch(clubId: string, eventId: string): Promise<EventRow> {
    const event = (await this.prisma.event.findFirst({
      where: { id: eventId, clubId },
      select: { id: true, clubId: true, teamId: true, type: true, opponent: true, homeAway: true },
    })) as EventRow | null
    if (!event) throw new NotFoundException('Event not found')
    if (event.type !== 'MATCH') throw new MatchLiveUnavailableError('Event is not a match')
    return event
  }

  private async loadLive(eventId: string): Promise<LiveRow | null> {
    return (await this.prisma.matchLive.findFirst({ where: { eventId } })) as LiveRow | null
  }

  private async canRecord(userId: string, teamId: string): Promise<boolean> {
    try {
      await this.teams.assertEventManagementAccess(userId, teamId)
      return true
    } catch (err) {
      if (err instanceof TeamAccessDeniedError) return false
      throw err
    }
  }

  /**
   * A named player must be an active member of the team; a free-text name is
   * kept as typed. The user's display name is snapshotted so the timeline
   * still reads after they leave the team.
   */
  private async resolvePlayer(
    teamId: string,
    userId: string | undefined,
    name: string | undefined,
  ): Promise<{ userId: string | null; name: string | null }> {
    if (!userId) return { userId: null, name: name ?? null }
    const access = await this.prisma.teamAccess.findFirst({
      where: { teamId, userId, ...activeTeamAccessWhere() },
      select: { user: { select: { name: true } } },
    })
    if (!access) throw new MatchLiveUnavailableError('Player is not in this team')
    return { userId, name: (access as { user?: { name?: string | null } }).user?.name ?? null }
  }

  private async recountScore(tx: any, eventId: string) {
    const [goalsFor, goalsAgainst] = await Promise.all([
      tx.matchLiveEvent.count({ where: { eventId, kind: 'GOAL', deletedAt: null } }),
      tx.matchLiveEvent.count({ where: { eventId, kind: 'CONCEDED', deletedAt: null } }),
    ])
    await tx.matchLive.update({ where: { eventId }, data: { goalsFor, goalsAgainst } })
  }

  private async buildState(event: EventRow, canRecord: boolean): Promise<MatchLiveStateDto> {
    const [live, rows] = await Promise.all([
      this.loadLive(event.id),
      this.prisma.matchLiveEvent.findMany({
        where: { eventId: event.id, deletedAt: null },
        orderBy: [{ minute: 'desc' }, { createdAt: 'desc' }],
      }) as Promise<LiveEventRow[]>,
    ])
    const goalsFor = live?.goalsFor ?? 0
    const goalsAgainst = live?.goalsAgainst ?? 0
    const ourSideAway = event.homeAway === 'AWAY'
    return {
      eventId: event.id,
      status: live?.status ?? 'NOT_STARTED',
      goalsFor,
      goalsAgainst,
      scoreHome: ourSideAway ? goalsAgainst : goalsFor,
      scoreAway: ourSideAway ? goalsFor : goalsAgainst,
      homeAway: event.homeAway,
      opponent: event.opponent,
      minute: live ? deriveMinute(live, new Date()) : null,
      kickoffAt: live?.kickoffAt?.toISOString() ?? null,
      secondHalfAt: live?.secondHalfAt?.toISOString() ?? null,
      finishedAt: live?.finishedAt?.toISOString() ?? null,
      events: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        minute: row.minute,
        playerUserId: row.playerUserId,
        playerName: row.playerName,
        relatedUserId: row.relatedUserId,
        relatedName: row.relatedName,
        createdAt: row.createdAt.toISOString(),
      })),
      canRecord,
    }
  }

  private async pushScore(
    event: EventRow,
    state: MatchLiveStateDto,
    type: 'GOAL' | 'FULL_TIME',
    recorderUserId: string,
  ) {
    try {
      const team = await this.prisma.team.findFirst({
        where: { id: event.teamId },
        select: { name: true },
      })
      const ours = team?.name ?? ''
      const theirs = event.opponent ?? ''
      const [home, away] = event.homeAway === 'AWAY' ? [theirs, ours] : [ours, theirs]
      const scoreline = `${home} ${state.scoreHome}:${state.scoreAway} ${away}`.trim()
      await this.push.sendToTeamLocalized(
        event.teamId,
        type,
        { scoreline },
        {
          type: type === 'GOAL' ? 'live_goal' : 'live_full_time',
          eventId: event.id,
          clubId: event.clubId,
          teamId: event.teamId,
          url: `anstoss:///match-live?eventId=${event.id}`,
        },
        recorderUserId,
        { clubId: event.clubId, category: 'events' },
      )
    } catch (err) {
      this.logger.warn(
        `Live ${type} push failed for event ${event.id}: ${err instanceof Error ? err.message : 'unknown error'}`,
      )
    }
  }
}

/**
 * The running minute from the recorded clock. First half counts from
 * kick-off, the second from the restart (starting at 46); half time shows 45,
 * full time 90 or the last stoppage minute reached.
 */
export function deriveMinute(
  live: Pick<LiveRow, 'status' | 'kickoffAt' | 'secondHalfAt' | 'finishedAt'>,
  now: Date,
): number | null {
  const elapsed = (from: Date | null, until: Date) =>
    from ? Math.max(0, Math.floor((until.getTime() - from.getTime()) / 60_000)) + 1 : 0
  switch (live.status) {
    case 'NOT_STARTED':
      return null
    case 'FIRST_HALF':
      return Math.min(MAX_MINUTE, elapsed(live.kickoffAt, now))
    case 'HALF_TIME':
      return HALF_LENGTH
    case 'SECOND_HALF':
      return Math.min(MAX_MINUTE, HALF_LENGTH + elapsed(live.secondHalfAt, now))
    case 'FINISHED':
      if (live.secondHalfAt && live.finishedAt) {
        return Math.min(MAX_MINUTE, Math.max(90, HALF_LENGTH + elapsed(live.secondHalfAt, live.finishedAt)))
      }
      return 90
  }
}
