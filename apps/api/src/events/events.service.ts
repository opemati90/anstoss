import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  HttpException,
} from '@nestjs/common'
import { Prisma, TeamRole } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type {
  EventDetail,
  EventFeedItem,
  EventLineup,
  EventSquad,
  EventReadiness,
  EventReadinessNudge,
  EventReadinessSignal,
} from '@anstoss/shared'
import {
  MAX_SERIES_OCCURRENCES,
  MAX_SERIES_WEEKDAYS,
  type SaveEventLineupInput,
} from '@anstoss/shared'
import {
  buildClubPermissionMap,
  ClubCapability,
  rsvpStatusSchema,
  TeamAccessDeniedError,
} from '@anstoss/shared'

const RsvpStatus = rsvpStatusSchema.enum
import { TeamsService } from '../teams/teams.service'
import { activeTeamAccessWhere } from '../teams/active-team-access'
import { countSquadExclusionsByTeam, loanedOutByTeam, SQUAD_ACCESS_COUNT_WHERE } from '../teams/squad-count'
import { ContributionsService } from '../contributions/contributions.service'
import { PushService } from '../push/push.service'
import { formatPush } from '../push/push.templates'
import { ChatService } from '../chat/chat.service'
import { EventsGateway } from './events.gateway'
import {
  eventTitleFor,
  formatEventDateFor,
  resolveEventLocale,
  resolveStoredTitle,
  rsvpReminderCopy,
  squadNominatedCopy,
  type EventLocale,
} from './event-copy'

const RSVP_REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000
const SERIES_TIME_ZONE = 'Europe/Berlin'
const MAX_SERIES_DURATION_MS = 366 * 24 * 60 * 60 * 1000

type EventTypeValue = EventFeedItem['type']
type RsvpStatusValue = NonNullable<EventFeedItem['myRsvp']>
type UpcomingEventFilters = {
  type?: EventTypeValue
  dateFrom?: string
  dateTo?: string
  scope?: 'upcoming' | 'past'
  mine?: boolean
  limit?: number
}

const upcomingEventInclude = {
  _count: {
    select: { rsvps: true, checkIns: true },
  },
  rsvps: {
    select: {
      userId: true,
      status: true,
      reason: true,
      nominated: true,
      updatedAt: true,
    },
  },
  team: {
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          // Kader revamp: same squad rule as roster-ops squadCount; the
          // inactive / ended-loan rows are subtracted by withSquadCounts.
          access: { where: SQUAD_ACCESS_COUNT_WHERE },
        },
      },
    },
  },
} satisfies Prisma.EventInclude

const upcomingEventIncludeWithTeam = {
  _count: {
    select: { rsvps: true, checkIns: true },
  },
  rsvps: {
    select: {
      userId: true,
      status: true,
      reason: true,
      nominated: true,
      updatedAt: true,
    },
  },
  team: {
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          // Kader revamp: same squad rule as roster-ops squadCount; the
          // inactive / ended-loan rows are subtracted by withSquadCounts.
          access: { where: SQUAD_ACCESS_COUNT_WHERE },
        },
      },
    },
  },
} satisfies Prisma.EventInclude

type UpcomingEventRecord = Prisma.EventGetPayload<{
  include: typeof upcomingEventInclude
}>

type UpcomingEventRecordWithTeam = Prisma.EventGetPayload<{
  include: typeof upcomingEventIncludeWithTeam
}>

type EventReadinessRecord = {
  type: EventTypeValue
  date: Date
  lastRsvpReminderAt?: Date | null
  _count: {
    rsvps?: number
    checkIns?: number
  }
  rsvps: Array<{
    status: RsvpStatusValue
    reason?: string | null
  }>
  team?: {
    _count?: {
      access?: number | null
    }
  } | null
}

/**
 * Events older than this many days are moved to the archive and hidden from
 * the Past tab. Keeps the list focused on the recent window only.
 */
const EVENT_ARCHIVE_RETENTION_DAYS = 3

/**
 * Team chat system notices are one post for everyone, in the club's language
 * (German). Pushes are rendered per recipient instead (see event-copy.ts).
 */
const CHAT_NOTICE_LOCALE: EventLocale = 'de'

/** Short German date for the team chat notice, e.g. "Sa., 14.09.". */
function formatEventDate(date: Date): string {
  return formatEventDateFor(date, CHAT_NOTICE_LOCALE)
}

/** Interactive transactions that write a whole series get more than Prisma's 5 s default. */
const SERIES_TRANSACTION_OPTIONS = { timeout: 20_000, maxWait: 10_000 }

/** Title + autoTitle to store, or a 400 when a title is required and missing. */
function storedTitleOrThrow(input: { type: string; title?: string | null; opponent?: string | null }) {
  const resolved = resolveStoredTitle(input)
  if (!resolved) throw new BadRequestException('Title must be at least 2 characters')
  return resolved
}

type TitledEventRecord = {
  title: string
  type: string
  opponent?: string | null
  homeAway?: string | null
  autoTitle?: boolean | null
}

function getZonedParts(date: Date, timeZone = SERIES_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value)

  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  }
}

function getTimeZoneOffsetMs(date: Date, timeZone = SERIES_TIME_ZONE) {
  const parts = getZonedParts(date, timeZone)
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
  return asUtc - date.getTime()
}

function zonedWallTimeToUtc(
  parts: ReturnType<typeof getZonedParts>,
  timeZone = SERIES_TIME_ZONE,
) {
  const wallAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
  let utc = wallAsUtc - getTimeZoneOffsetMs(new Date(wallAsUtc), timeZone)
  const correctedOffset = getTimeZoneOffsetMs(new Date(utc), timeZone)
  utc = wallAsUtc - correctedOffset
  return new Date(utc)
}

function addWeeksPreservingWallTime(
  start: Date,
  weeksFromStart: number,
  timeZone = SERIES_TIME_ZONE,
) {
  const startParts = getZonedParts(start, timeZone)
  const targetWall = new Date(
    Date.UTC(
      startParts.year,
      startParts.month - 1,
      startParts.day + weeksFromStart * 7,
      startParts.hour,
      startParts.minute,
      startParts.second,
    ),
  )
  return zonedWallTimeToUtc(getZonedParts(targetWall, 'UTC'), timeZone)
}

function getWallTimeMs(date: Date, timeZone = SERIES_TIME_ZONE) {
  const parts = getZonedParts(date, timeZone)
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
}

function shiftByZonedWallDelta(
  date: Date,
  from: Date,
  to: Date,
  timeZone = SERIES_TIME_ZONE,
) {
  const deltaMs = getWallTimeMs(to, timeZone) - getWallTimeMs(from, timeZone)
  const shiftedWall = new Date(getWallTimeMs(date, timeZone) + deltaMs)
  return zonedWallTimeToUtc(getZonedParts(shiftedWall, 'UTC'), timeZone)
}

/**
 * Occurrence dates of a series, at the first date's Berlin wall time.
 *
 * `weekdays` (0 = Sunday … 6 = Saturday) turns a single-day rule into a
 * several-days-a-week one (Di + Do): every `intervalWeeks`-th Monday-based
 * week from the first date's week contributes one occurrence per weekday,
 * keeping those on or after the first date and on or before `until`. An
 * empty list is the original behaviour: the first date's weekday only.
 */
function buildSeriesDates(
  first: Date,
  until: Date,
  intervalWeeks: 1 | 2,
  weekdays: number[] = [],
) {
  if (until.getTime() < first.getTime()) {
    throw new BadRequestException('Repeat end must be on or after the first date')
  }
  if (until.getTime() - first.getTime() > MAX_SERIES_DURATION_MS) {
    throw new BadRequestException('Repeat end must be within a year')
  }

  const days = normalizeWeekdays(weekdays)
  if (days.length > MAX_SERIES_WEEKDAYS) {
    throw new BadRequestException(`A series has at most ${MAX_SERIES_WEEKDAYS} training days a week`)
  }
  const maxOccurrences = MAX_SERIES_OCCURRENCES * Math.max(1, days.length)
  const dates: Date[] = []

  if (days.length === 0) {
    for (let index = 0; ; index += 1) {
      const date = addWeeksPreservingWallTime(first, index * intervalWeeks)
      if (date.getTime() > until.getTime()) break
      if (dates.length >= maxOccurrences) {
        throw new BadRequestException(
          `Recurring events are limited to ${MAX_SERIES_OCCURRENCES} occurrences`,
        )
      }
      dates.push(date)
    }
  } else {
    const start = getZonedParts(first)
    const firstDow = new Date(Date.UTC(start.year, start.month - 1, start.day)).getUTCDay()
    const mondayDay = start.day - ((firstDow + 6) % 7)
    for (let week = 0; ; week += intervalWeeks) {
      // Monday 00:00 of this week (as UTC wall, minus a safety margin for the
      // Berlin offset) already past the end: nothing later can fit.
      const weekStartWall = Date.UTC(start.year, start.month - 1, mondayDay + week * 7)
      if (weekStartWall - 3 * 60 * 60 * 1000 > until.getTime()) break
      for (const day of days) {
        const wall = new Date(
          Date.UTC(
            start.year,
            start.month - 1,
            mondayDay + week * 7 + ((day + 6) % 7),
            start.hour,
            start.minute,
            start.second,
          ),
        )
        const date = zonedWallTimeToUtc(getZonedParts(wall, 'UTC'))
        if (date.getTime() < first.getTime() || date.getTime() > until.getTime()) continue
        if (dates.length >= maxOccurrences) {
          throw new BadRequestException(`Recurring events are limited to ${MAX_SERIES_OCCURRENCES} weeks`)
        }
        dates.push(date)
      }
    }
  }

  if (dates.length === 0) {
    throw new BadRequestException('Repeat end must be on or after the first date')
  }

  return dates
}

/** Dedupe and order weekdays Monday-first (German week). */
function normalizeWeekdays(weekdays: number[] | undefined | null): number[] {
  return Array.from(
    new Set((weekdays ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)),
  ).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
}

/** Day of the week (0 = Sunday) of a date in Europe/Berlin. */
function berlinWeekday(date: Date): number {
  const parts = getZonedParts(date)
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()
}

type HomeAwayValue = 'HOME' | 'AWAY'

/** Matchday logistics accepted on create / series / update. `null` clears. */
type EventLogisticsInput = {
  meetingAt?: Date | null
  meetingPoint?: string | null
  opponent?: string | null
  homeAway?: HomeAwayValue | null
  carpoolEnabled?: boolean
  durationMin?: number | null
}

function normalizeLineupPlayer(player: SaveEventLineupInput['starters'][number]) {
  return {
    userId: player.userId ?? null,
    number: player.number ?? null,
    name: player.name,
    position: player.position ?? null,
    slotId: player.slotId ?? null,
  }
}

/** Serialize a Prisma date (or a string already) to ISO; null when absent. */
function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : value
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/** Prisma data for the logistics fields that were actually sent (meetingAt aside). */
function logisticsData(data: EventLogisticsInput) {
  return {
    ...(data.meetingPoint !== undefined && { meetingPoint: trimOrNull(data.meetingPoint) }),
    ...(data.opponent !== undefined && { opponent: trimOrNull(data.opponent) }),
    ...(data.homeAway !== undefined && { homeAway: data.homeAway }),
    ...(data.carpoolEnabled !== undefined && { carpoolEnabled: data.carpoolEnabled }),
    ...(data.durationMin !== undefined && { durationMin: data.durationMin }),
  }
}

/** Parse stored Event.lineup / overlay lineup JSON into the shared shape. */
function readLineup(raw: unknown, fallbackFormation?: string | null): EventLineup | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  const formation =
    (typeof value.formation === 'string' ? value.formation : fallbackFormation) ?? null
  if (!formation || !Array.isArray(value.starters)) return null
  const toPlayer = (p: unknown) => {
    const row = (p ?? {}) as Record<string, unknown>
    return {
      userId: typeof row.userId === 'string' ? row.userId : null,
      number: typeof row.number === 'number' ? row.number : null,
      name: typeof row.name === 'string' ? row.name : '',
      position: typeof row.position === 'string' ? row.position : null,
      slotId: typeof row.slotId === 'string' ? row.slotId : null,
    }
  }
  return {
    formation,
    starters: value.starters.map(toPlayer).filter((p) => p.name),
    bench: Array.isArray(value.bench) ? value.bench.map(toPlayer).filter((p) => p.name) : [],
  }
}

function assertRouteClubMatchesTeam(routeClubId: string | undefined, teamClubId: string) {
  if (routeClubId && routeClubId !== teamClubId) {
    throw new BadRequestException('Team does not belong to this club')
  }
}

@Injectable()
export class EventsService {
  private readonly pushLogger = new Logger(EventsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly teamsService: TeamsService,
    private readonly contributionsService: ContributionsService,
    private readonly pushService: PushService,
    private readonly eventsGateway: EventsGateway,
    private readonly chatService: ChatService,
  ) {}

  async create(data: {
    title?: string | null
    type: EventTypeValue
    date: Date
    location?: string
    notes?: string
    teamId: string
    createdById: string
    clubId?: string
  } & EventLogisticsInput) {
    const access = await this.teamsService.assertEventManagementAccess(
      data.createdById,
      data.teamId,
    )

    const clubId = access.team.clubId
    assertRouteClubMatchesTeam(data.clubId, clubId)
    const stored = storedTitleOrThrow(data)

    const event = await this.prisma.event.create({
      data: {
        title: stored.title,
        autoTitle: stored.autoTitle,
        type: data.type,
        date: data.date,
        location: data.location,
        notes: data.notes,
        teamId: data.teamId,
        createdById: data.createdById,
        clubId,
        ...logisticsData(data),
        ...(data.meetingAt !== undefined && { meetingAt: data.meetingAt }),
      },
    })

    // Realtime: push the new event to the team room so connected clients
    // can surface it without a refetch. Never let an emit failure fail
    // event creation.
    this.eventsGateway.emitEventUpsert(event.teamId, event.id)

    // Notify the team that a new event was created (creator excluded).
    // Fire-and-forget: a push failure must never fail event creation.
    void this.notifyEventCreated(event, clubId).catch((err) => {
      this.pushLogger.warn(
        `EVENT_CREATED push failed for event ${event.id}: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      )
    })

    return event
  }

  /**
   * Create a recurring event: the first occurrence plus every later one up to
   * `until`, each a real Event row that shares a series id. Notifications go
   * out once, for the series, not once per occurrence.
   */
  async createSeries(data: {
    title?: string | null
    type: EventTypeValue
    date: Date
    location?: string
    notes?: string
    teamId: string
    createdById: string
    clubId?: string
    intervalWeeks: 1 | 2
    until: Date
    /** 0 = Sunday … 6 = Saturday; empty = weekday of `date`. */
    weekdays?: number[]
  } & EventLogisticsInput) {
    const access = await this.teamsService.assertEventManagementAccess(
      data.createdById,
      data.teamId,
    )
    const clubId = access.team.clubId
    assertRouteClubMatchesTeam(data.clubId, clubId)

    const weekdays = normalizeWeekdays(data.weekdays)
    const dates = buildSeriesDates(data.date, data.until, data.intervalWeeks, weekdays)
    // Treffpunkt is stored as an offset so every occurrence meets the same
    // number of minutes before its own start.
    const meetingOffsetMin = data.meetingAt
      ? Math.max(0, Math.round((data.date.getTime() - data.meetingAt.getTime()) / 60000))
      : null
    const logistics = logisticsData(data)
    const stored = storedTitleOrThrow(data)

    // One createMany for every occurrence (up to 53 × 4 rows) and an explicit
    // timeout: a season of Di + Do used to be ~80 sequential inserts inside
    // Prisma's 5 s interactive-transaction default.
    const { series, events } = await this.prisma.$transaction(async (tx) => {
      const series = await tx.eventSeries.create({
        data: {
          clubId,
          teamId: data.teamId,
          createdById: data.createdById,
          title: stored.title,
          type: data.type,
          intervalWeeks: data.intervalWeeks,
          weekdays,
          meetingOffsetMin,
          durationMin: data.durationMin ?? null,
          startsAt: data.date,
          until: data.until,
          location: data.location ?? null,
          notes: data.notes ?? null,
        },
      })

      await tx.event.createMany({
        data: dates.map((date) => ({
          title: stored.title,
          autoTitle: stored.autoTitle,
          type: data.type,
          date,
          location: data.location,
          notes: data.notes,
          teamId: data.teamId,
          createdById: data.createdById,
          clubId,
          seriesId: series.id,
          ...logistics,
          ...(meetingOffsetMin !== null && {
            meetingAt: new Date(date.getTime() - meetingOffsetMin * 60000),
          }),
        })),
      })
      const events = await tx.event.findMany({
        where: { seriesId: series.id, clubId },
        orderBy: { date: 'asc' },
      })

      return { series, events }
    }, SERIES_TRANSACTION_OPTIONS)

    const first = events[0]
    this.eventsGateway.emitEventUpsert(first.teamId, first.id)
    void this.notifyEventCreated(first, clubId).catch((err) => {
      this.pushLogger.warn(
        `EVENT_CREATED push failed for series ${series.id}: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      )
    })
    void this.chatService.postSystemNotice({
      teamId: first.teamId,
      clubId,
      actorId: data.createdById,
      content: `${eventTitleFor(first, CHAT_NOTICE_LOCALE)}: ${formatEventDate(first.date)} · ×${events.length}`,
    }).catch((err) => {
      this.pushLogger.warn(
        `EVENT_CREATED chat notice failed for series ${series.id}: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      )
    })

    return { series, events }
  }

  private async notifyEventCreated(
    event: TitledEventRecord & {
      id: string
      type: EventTypeValue
      date: Date
      teamId: string
      createdById: string
    },
    clubId: string,
  ) {
    const team = await this.prisma.team.findUnique({
      where: { id: event.teamId },
      select: { name: true },
    })
    await this.sendTeamEventPush('EVENT_CREATED', event, {
      teamName: team?.name ?? '',
      clubId,
      excludeUserId: event.createdById,
      pushType: 'event_created',
    })
  }

  /**
   * EVENT_CREATED / EVENT_UPDATED / EVENT_CANCELLED to the team. Rendered per
   * reader language, so a derived title ("Heimspiel gegen X") and the date
   * read naturally in each language.
   */
  private sendTeamEventPush(
    type: 'EVENT_CREATED' | 'EVENT_UPDATED' | 'EVENT_CANCELLED',
    event: TitledEventRecord & {
      id: string
      teamId: string
      date: Date
      cancelReason?: string | null
    },
    ctx: { teamName: string; clubId: string; excludeUserId?: string; pushType: string },
  ) {
    return this.pushService.sendToTeamRendered(
      event.teamId,
      (locale) => {
        const eventLocale = resolveEventLocale(locale)
        const base = {
          teamName: ctx.teamName,
          eventTitle: eventTitleFor(event, eventLocale),
          date: formatEventDateFor(event.date, eventLocale),
        }
        if (type === 'EVENT_CREATED') {
          return formatPush(type, { ...base, eventType: event.type.toLowerCase() }, locale)
        }
        if (type === 'EVENT_CANCELLED') {
          return formatPush(type, { ...base, reason: event.cancelReason ?? '' }, locale)
        }
        return formatPush(type, base, locale)
      },
      {
        type: ctx.pushType,
        eventId: event.id,
        clubId: ctx.clubId,
        url: `anstoss:///event-detail?eventId=${event.id}`,
      },
      ctx.excludeUserId,
      { clubId: ctx.clubId, category: 'events', inboxType: type },
    )
  }

  /**
   * List upcoming events for a team with RSVP counts.
   * Uses _count aggregation — no N+1.
   */
  async listUpcoming(
    teamId: string,
    userId: string,
    filters?: UpcomingEventFilters,
  ): Promise<EventFeedItem[]> {
    // H1: a Probetraining player only sees their trial sessions.
    const readable = await this.teamsService.assertReadableAccess(userId, teamId, { trialFeed: true })
    await this.archiveExpiredEvents(teamId)
    const includeReadiness = await this.canViewReadiness(userId, teamId)

    const scope = filters?.scope ?? 'upcoming'
    const now = new Date()
    const dateFilter: Record<string, Date> = scope === 'past' ? { lt: now } : { gte: now }

    if (filters?.dateFrom) {
      dateFilter.gte = parseDateBoundary(filters.dateFrom, 'start')
    }

    if (filters?.dateTo) {
      dateFilter.lte = parseDateBoundary(filters.dateTo, 'end')
    }

    const where: Prisma.EventWhereInput = {
      teamId,
      date: dateFilter,
      // Cancelled events stay visible in the upcoming feed until their date
      // passes so the squad sees the change where they look for the
      // schedule; they drop out of the past feed, which is attendance
      // history.
      ...(scope === 'past' ? { cancelledAt: null } : {}),
      archivedAt: null,
      ...(readable.trialEventIds ? { id: { in: readable.trialEventIds } } : {}),
    }

    if (filters?.type) {
      where.type = filters.type
    }

    // mine=true scopes the feed to teams the caller is actually rostered
    // on (or has a guardian link to a rostered child). Players/parents
    // call this to avoid leaking events from teams they merely have
    // visibility on; coaches/admins omit the flag to see the full team
    // feed including events where they aren't personally listed.
    if (filters?.mine) {
      const [selfAccess, guardianRows] = await Promise.all([
        this.prisma.teamAccess.findFirst({
          where: { userId, teamId, ...activeTeamAccessWhere() },
          select: { id: true },
        }),
        this.prisma.guardianRelationship.findMany({
          where: {
            parentUserId: userId,
            playerUserId: { not: null },
            player: {
              teamAccess: {
                some: { teamId, ...activeTeamAccessWhere() },
              },
            },
          },
          select: { id: true },
        }),
      ])
      const isRostered = Boolean(selfAccess) || guardianRows.length > 0
      if (!isRostered) {
        return []
      }
    }

    const events = await this.withSquadCounts(
      await this.prisma.event.findMany({
        where,
        include: upcomingEventInclude,
        orderBy: { date: scope === 'past' ? 'desc' : 'asc' },
        ...(filters?.limit ? { take: filters.limit } : {}),
      }),
    )
    const squad = await this.loadSquadResponders(events)

    return events.map((event: UpcomingEventRecord) =>
      this.mapEventRecord(event, userId, includeReadiness, squad),
    )
  }

  /**
   * List upcoming events for ALL teams the user is active on in a club.
   * Used by the PlayerHome "Your week" list when mine=1 and no teamId is
   * specified. Returns up to 4 events sorted chronologically, with team
   * metadata attached for the multi-team badge chip.
   */
  async listUpcomingAllTeams(
    clubId: string,
    userId: string,
    filters?: UpcomingEventFilters,
  ): Promise<EventFeedItem[]> {
    // Collect all team IDs the user is actively rostered on for this club
    const userTeamRows = await this.prisma.teamAccess.findMany({
      where: { userId, clubId, ...activeTeamAccessWhere() },
      select: { teamId: true, phase: true },
    })
    // H1 (Wechselbörse review): on a team the caller only holds TRIAL access
    // to, the feed is limited to the trial sessions the read check allows.
    const fullTeamIds = new Set(
      userTeamRows.filter((r: { phase: string }) => r.phase !== 'TRIAL').map((r) => r.teamId),
    )
    const trialEventIds: string[] = []
    const trialTeamIds: string[] = []
    const readableTeamIds: string[] = []
    for (const teamId of new Set(userTeamRows.map((r: { teamId: string }) => r.teamId))) {
      if (fullTeamIds.has(teamId)) {
        readableTeamIds.push(teamId)
        continue
      }
      const readable = await this.teamsService
        .assertReadableAccess(userId, teamId, { trialFeed: true })
        .catch(() => null)
      if (!readable) continue
      if (readable.trialEventIds) {
        trialEventIds.push(...readable.trialEventIds)
        trialTeamIds.push(teamId)
      } else {
        readableTeamIds.push(teamId)
      }
    }
    const userTeamIds = [...readableTeamIds, ...trialTeamIds]

    if (userTeamIds.length === 0) {
      return []
    }

    // Archive expired events across all user teams in parallel
    await Promise.all(userTeamIds.map((tid: string) => this.archiveExpiredEvents(tid)))

    const scope = filters?.scope ?? 'upcoming'
    const now = new Date()
    const dateFilter: Record<string, Date> = scope === 'past' ? { lt: now } : { gte: now }

    if (filters?.dateFrom) {
      dateFilter.gte = parseDateBoundary(filters.dateFrom, 'start')
    }
    if (filters?.dateTo) {
      dateFilter.lte = parseDateBoundary(filters.dateTo, 'end')
    }

    const where: Prisma.EventWhereInput = {
      clubId,
      teamId: { in: userTeamIds },
      ...(trialTeamIds.length > 0
        ? { OR: [{ teamId: { in: readableTeamIds } }, { id: { in: trialEventIds } }] }
        : {}),
      date: dateFilter,
      // Upcoming-only feed: cancelled events stay until their date passes.
      archivedAt: null,
    }

    if (filters?.type) {
      where.type = filters.type
    }

    const limit = filters?.limit ?? 4
    const events = await this.withSquadCounts(
      await this.prisma.event.findMany({
        where,
        include: upcomingEventIncludeWithTeam,
        orderBy: { date: scope === 'past' ? 'desc' : 'asc' },
        take: limit,
      }),
    )

    const readinessTeamIds = await this.getReadinessTeamIds(userId, userTeamIds)
    const squad = await this.loadSquadResponders(events)

    return events.map((event: UpcomingEventRecordWithTeam) => ({
      ...this.mapEventRecord(event, userId, readinessTeamIds.has(event.teamId), squad),
      team: event.team ? { id: event.team.id, name: event.team.name } : null,
    }))
  }

  async listUpcomingManagedClub(
    clubId: string,
    userId: string,
    filters?: UpcomingEventFilters,
  ): Promise<EventFeedItem[]> {
    await this.assertClubEventAccess(clubId, userId)
    await this.archiveExpiredClubEvents(clubId)

    const scope = filters?.scope ?? 'upcoming'
    const now = new Date()
    const dateFilter: Record<string, Date> = scope === 'past' ? { lt: now } : { gte: now }

    if (filters?.dateFrom) {
      dateFilter.gte = parseDateBoundary(filters.dateFrom, 'start')
    }
    if (filters?.dateTo) {
      dateFilter.lte = parseDateBoundary(filters.dateTo, 'end')
    }

    const where: Prisma.EventWhereInput = {
      clubId,
      date: dateFilter,
      // Upcoming-only feed: cancelled events stay until their date passes.
      archivedAt: null,
    }

    if (filters?.type) {
      where.type = filters.type
    }

    const events = await this.withSquadCounts(
      await this.prisma.event.findMany({
        where,
        include: upcomingEventIncludeWithTeam,
        orderBy: { date: scope === 'past' ? 'desc' : 'asc' },
        take: filters?.limit ?? 4,
      }),
    )

    const squad = await this.loadSquadResponders(events)

    return events.map((event: UpcomingEventRecordWithTeam) => ({
      ...this.mapEventRecord(event, userId, true, squad),
      team: event.team ? { id: event.team.id, name: event.team.name } : null,
    }))
  }

  /**
   * Kader revamp: `team._count.access` counts SQUAD_ACCESS_COUNT_WHERE rows;
   * subtract players who are INACTIVE in that team or whose loan has ended so
   * squadSize matches roster-ops squadCount. Batched across teams.
   */
  private async withSquadCounts<
    T extends { teamId: string; team?: { _count?: { access?: number | null } } | null },
  >(events: T[]): Promise<T[]> {
    if (events.length === 0) return events
    const exclusions = await countSquadExclusionsByTeam(
      this.prisma,
      events.map((event) => event.teamId),
    )
    if (exclusions.size === 0) return events
    for (const event of events) {
      const counted = event.team?._count?.access
      const excluded = exclusions.get(event.teamId) ?? 0
      if (event.team?._count && typeof counted === 'number' && excluded > 0) {
        event.team._count.access = Math.max(0, counted - excluded)
      }
    }
    return events
  }

  /**
   * Which of the people who replied are squad members (role PLAYER, phase
   * FULL, active, loan running, not INACTIVE): the same rule as squadSize.
   * Coaches, trialists and inactive players may answer, but their answers do
   * not count towards Zusagen / Offen, so "Erinnerung an N" matches the list
   * of who is still open. Two batched queries for the whole feed.
   */
  private async loadSquadResponders(
    events: Array<{ teamId: string; rsvps: Array<{ userId: string }> }>,
  ): Promise<Map<string, Set<string>>> {
    const squad = new Map<string, Set<string>>()
    const teamIds = Array.from(new Set(events.map((event) => event.teamId)))
    const userIds = Array.from(
      new Set(events.flatMap((event) => event.rsvps.map((rsvp) => rsvp.userId))),
    )
    if (teamIds.length === 0 || userIds.length === 0) return squad
    // Kader fix L5 (team agent): players loaned out of a team do not count
    // for it while the loan runs, as in squadSize.
    const [access, inactive, loanedOut] = await Promise.all([
      this.prisma.teamAccess.findMany({
        where: {
          teamId: { in: teamIds },
          userId: { in: userIds },
          ...SQUAD_ACCESS_COUNT_WHERE,
          ...activeTeamAccessWhere(),
        },
        select: { teamId: true, userId: true },
      }),
      this.prisma.teamMember.findMany({
        where: { teamId: { in: teamIds }, userId: { in: userIds }, operationalStatus: 'INACTIVE' },
        select: { teamId: true, userId: true },
      }),
      loanedOutByTeam(this.prisma, teamIds),
    ])
    const inactiveKeys = new Set(
      (inactive ?? []).map((row: { teamId: string; userId: string }) => `${row.teamId}:${row.userId}`),
    )
    for (const row of (access ?? []) as Array<{ teamId: string; userId: string }>) {
      if (inactiveKeys.has(`${row.teamId}:${row.userId}`)) continue
      if (loanedOut.get(row.teamId)?.has(row.userId)) continue
      const set = squad.get(row.teamId) ?? new Set<string>()
      set.add(row.userId)
      squad.set(row.teamId, set)
    }
    return squad
  }

  /**
   * Shared mapper from Prisma event record → EventFeedItem shape. Counts use
   * only squad members' replies (see loadSquadResponders).
   */
  private mapEventRecord(
    event: UpcomingEventRecord | UpcomingEventRecordWithTeam,
    userId: string,
    includeReadiness: boolean,
    squad: Map<string, Set<string>>,
  ): EventFeedItem {
    const mine = event.rsvps.find(
      (rsvp: (typeof event.rsvps)[number]) => rsvp.userId === userId,
    )
    const squadIds = squad.get(event.teamId)
    const squadRsvps = event.rsvps.filter((rsvp) => squadIds?.has(rsvp.userId) ?? false)
    const published = Boolean(event.squadPublishedAt)
    const item: EventFeedItem = {
      id: event.id,
      teamId: event.teamId,
      clubId: event.clubId,
      title: event.title,
      type: event.type,
      date: event.date.toISOString(),
      location: event.location ?? null,
      notes: event.notes ?? null,
      createdById: event.createdById,
      createdAt: event.createdAt.toISOString(),
      archivedAt: event.archivedAt?.toISOString() ?? null,
      cancelledAt: event.cancelledAt?.toISOString() ?? null,
      cancelReason: event.cancelReason ?? null,
      autoTitle: event.autoTitle ?? false,
      responseCount: squadRsvps.length,
      checkInCount: event._count.checkIns ?? 0,
      squadSize: event.team?._count?.access ?? 0,
      yesCount: squadRsvps.filter((rsvp) => rsvp.status === RsvpStatus.YES).length,
      maybeCount: squadRsvps.filter((rsvp) => rsvp.status === RsvpStatus.MAYBE).length,
      noCount: squadRsvps.filter((rsvp) => rsvp.status === RsvpStatus.NO).length,
      myRsvp: mine?.status ?? null,
      rescheduledAt: event.rescheduledAt?.toISOString() ?? null,
      seriesId: event.seriesId ?? null,
      meetingAt: event.meetingAt?.toISOString() ?? null,
      meetingPoint: event.meetingPoint ?? null,
      opponent: event.opponent ?? null,
      homeAway: event.homeAway ?? null,
      fixtureId: event.fixtureId ?? null,
      squadPublishedAt: event.squadPublishedAt?.toISOString() ?? null,
      carpoolEnabled: event.carpoolEnabled ?? false,
      durationMin: event.durationMin ?? null,
      // The Kader is the coach's draft until it is published.
      myNominated: Boolean(mine?.nominated && (published || includeReadiness)),
      myRsvpStale: Boolean(
        mine &&
          event.rescheduledAt &&
          mine.updatedAt &&
          new Date(mine.updatedAt).getTime() < event.rescheduledAt.getTime(),
      ),
    }

    if (includeReadiness) {
      item.readiness = buildEventReadiness({
        ...event,
        rsvps: squadRsvps,
        _count: { ...event._count, rsvps: squadRsvps.length },
      })
    }

    return item
  }

  private async getReadinessTeamIds(userId: string, teamIds: string[]): Promise<Set<string>> {
    const uniqueTeamIds = Array.from(new Set(teamIds))
    const decisions = await Promise.all(
      uniqueTeamIds.map(async (teamId) => ({
        teamId,
        canView: await this.canViewReadiness(userId, teamId),
      })),
    )
    return new Set(
      decisions.filter((decision) => decision.canView).map((decision) => decision.teamId),
    )
  }

  private async canViewReadiness(userId: string, teamId: string): Promise<boolean> {
    try {
      await this.teamsService.assertEventManagementAccess(userId, teamId)
      return true
    } catch (err) {
      if (err instanceof TeamAccessDeniedError) {
        return false
      }
      throw err
    }
  }

  private async assertClubEventAccess(clubId: string, userId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_clubId: { userId, clubId } },
      select: { role: true, operationalRoles: true },
    })

    if (!membership) {
      throw new TeamAccessDeniedError('You are not a member of this club.')
    }

    const permissions = buildClubPermissionMap({
      membershipRole: membership.role as any,
      operationalRoles: membership.operationalRoles as any,
    })

    if (!permissions[ClubCapability.EVENTS]) {
      throw new TeamAccessDeniedError('You do not manage events for this club.')
    }

    return membership
  }

  async findById(clubId: string, id: string, userId: string): Promise<EventDetail> {
    const event = await this.prisma.event.findFirst({
      where: { id, clubId },
      include: {
        _count: {
          select: { rsvps: true, checkIns: true, carpoolRides: true },
        },
        series: { select: { id: true, intervalWeeks: true, until: true, weekdays: true } },
        rsvps: {
          include: {
            user: {
              select: { id: true, name: true, avatarUrl: true },
            },
          },
        },
        team: {
          select: {
            id: true,
            name: true,
            _count: {
              select: {
                access: { where: SQUAD_ACCESS_COUNT_WHERE },
              },
            },
          },
        },
        fixture: {
          select: { overlay: { select: { lineup: true, lineupFormation: true } } },
        },
        reminderPreferences: {
          where: { userId },
          select: { id: true },
        },
        checkIns: {
          where: { userId },
          select: { checkedInAt: true },
        },
      },
    })

    if (!event) {
      throw new NotFoundException('Event not found')
    }

    await this.teamsService.assertReadableAccess(userId, event.teamId, { eventId: event.id })
    await this.withSquadCounts([event])
    const includeReadiness = await this.canViewReadiness(userId, event.teamId)

    const [members, children, playerAccess] = await Promise.all([
      this.loadTeamPlayers(event.teamId),
      this.loadGuardedChildren(userId, event.teamId),
      // Any player row counts for answering (trialists too), not only the
      // squad: a Spielertrainer or a trialist answers for themselves.
      this.prisma.teamAccess.findFirst({
        where: { userId, teamId: event.teamId, role: TeamRole.PLAYER, ...activeTeamAccessWhere() },
        select: { id: true },
      }),
    ])
    const childIds = new Set(children.map((child) => child.userId))
    const memberIds = new Set(members.map((member) => member.userId))
    const squadRsvps = event.rsvps.filter((rsvp) => memberIds.has(rsvp.userId))
    // The Kader is the coach's draft until it is published; nobody who said
    // Absage or left the team is in it (H1).
    const showSquad = includeReadiness || Boolean(event.squadPublishedAt)
    const isNominated = (rsvp: { userId: string; status: string; nominated: boolean }) =>
      showSquad && rsvp.nominated && rsvp.status !== RsvpStatus.NO && memberIds.has(rsvp.userId)

    const mine = event.rsvps.find((rsvp) => rsvp.userId === userId)
    const myRsvp = mine?.status ?? null

    const myCheckInAt = event.checkIns[0]?.checkedInAt?.toISOString() ?? null
    const teamMemberCount = includeReadiness ? (event.team?._count?.access ?? null) : undefined
    // Why someone can't come is private: managers, the player and their
    // guardians see it; teammates only see the answer.
    const rsvps = event.rsvps.map((rsvp) => {
      const canSeeReason = includeReadiness || rsvp.userId === userId || childIds.has(rsvp.userId)
      return {
        id: rsvp.id,
        userId: rsvp.userId,
        status: rsvp.status,
        reason: canSeeReason ? rsvp.reason : undefined,
        note: canSeeReason ? rsvp.note : undefined,
        nominated: isNominated(rsvp),
        updatedAt: toIso(rsvp.updatedAt),
        user: rsvp.user,
      }
    })

    const childRows = children.map((child) => {
      const reply = event.rsvps.find((rsvp) => rsvp.userId === child.userId)
      return {
        userId: child.userId,
        name: child.name,
        teamName: event.team?.name ?? null,
        rsvp: reply?.status ?? null,
        reason: reply?.reason ?? null,
        note: reply?.note ?? null,
        nominated: reply ? isNominated(reply) : false,
      }
    })

    const lineup = showSquad
      ? (readLineup(event.lineup) ??
        (event.fixture?.overlay
          ? readLineup(event.fixture.overlay.lineup, event.fixture.overlay.lineupFormation)
          : null))
      : null

    const {
      _count,
      checkIns: _checkIns,
      reminderPreferences,
      fixture: _fixture,
      lineup: _rawLineup,
      importedFields: _importedFields,
      ...base
    } = event

    return {
      ...(base as unknown as Omit<EventDetail, 'date'>),
      date: toIso(event.date),
      createdAt: toIso(event.createdAt),
      meetingAt: toIso(event.meetingAt),
      squadPublishedAt: toIso(event.squadPublishedAt),
      cancelledAt: toIso(event.cancelledAt),
      rescheduledAt: toIso(event.rescheduledAt),
      archivedAt: toIso(event.archivedAt),
      series: event.series
        ? {
            id: event.series.id,
            intervalWeeks: event.series.intervalWeeks,
            until: toIso(event.series.until),
            weekdays: event.series.weekdays ?? [],
          }
        : null,
      rsvps,
      team: event.team ? { id: event.team.id, name: event.team.name } : null,
      myRsvp,
      myRsvpReason: mine?.reason ?? null,
      myRsvpNote: mine?.note ?? null,
      myNominated: mine ? isNominated(mine) : false,
      myRsvpStale: Boolean(
        mine &&
          event.rescheduledAt &&
          mine.updatedAt &&
          new Date(mine.updatedAt).getTime() < new Date(event.rescheduledAt).getTime(),
      ),
      myCheckInAt,
      reminderEnabled: (reminderPreferences?.length ?? 0) > 0,
      lastRsvpReminderAt: toIso(event.lastRsvpReminderAt),
      teamMemberCount,
      readiness: includeReadiness
        ? buildEventReadiness({
            ...event,
            rsvps: squadRsvps,
            _count: { ...event._count, rsvps: squadRsvps.length },
          })
        : undefined,
      members,
      children: childRows,
      viewer: {
        canManage: includeReadiness,
        isPlayer: Boolean(playerAccess) || memberIds.has(userId),
        isGuardian: children.length > 0,
      },
      lineup,
      carpoolRideCount: _count?.carpoolRides ?? 0,
    } as EventDetail
  }

  /**
   * The team's squad (same rule as squadSize: role PLAYER, phase FULL, active,
   * loan running, not INACTIVE), with jersey number and position when known.
   * These are the people Offen / Zusagen / the Kader are counted against.
   */
  private async loadTeamPlayers(teamId: string) {
    // Kader fix L5 (team agent): skip players loaned out of this team.
    const [access, profiles, loanedOut] = await Promise.all([
      this.prisma.teamAccess.findMany({
        where: { teamId, ...SQUAD_ACCESS_COUNT_WHERE, ...activeTeamAccessWhere() },
        select: {
          userId: true,
          user: { select: { id: true, name: true, avatarUrl: true } },
        },
      }),
      this.prisma.teamMember.findMany({
        where: { teamId },
        select: { userId: true, jerseyNumber: true, position: true, operationalStatus: true },
      }),
      loanedOutByTeam(this.prisma, [teamId]).then((byTeam) => byTeam.get(teamId)),
    ])
    const profileByUser = new Map(
      (profiles ?? []).map(
        (profile: {
          userId: string
          jerseyNumber: number | null
          position: string | null
          operationalStatus?: string | null
        }) => [profile.userId, profile],
      ),
    )
    const seen = new Set<string>()
    const members: Array<{
      userId: string
      name: string
      avatarUrl: string | null
      jerseyNumber: number | null
      position: string | null
    }> = []
    for (const row of access ?? []) {
      if (!row?.user || seen.has(row.userId)) continue
      seen.add(row.userId)
      const profile = profileByUser.get(row.userId)
      if (profile?.operationalStatus === 'INACTIVE') continue
      if (loanedOut?.has(row.userId)) continue
      members.push({
        userId: row.userId,
        name: row.user.name ?? '',
        avatarUrl: row.user.avatarUrl ?? null,
        jerseyNumber: profile?.jerseyNumber ?? null,
        position: profile?.position ?? null,
      })
    }
    return members.sort((a, b) => a.name.localeCompare(b.name, 'de'))
  }

  /** Children the user guards who are active on the team. */
  private async loadGuardedChildren(userId: string, teamId: string) {
    const rows = await this.prisma.guardianRelationship.findMany({
      where: {
        parentUserId: userId,
        playerUserId: { not: null },
        player: { teamAccess: { some: { teamId, ...activeTeamAccessWhere() } } },
      },
      select: { playerUserId: true, childName: true, player: { select: { name: true } } },
    })
    const seen = new Set<string>()
    const children: Array<{ userId: string; name: string }> = []
    for (const row of rows ?? []) {
      if (!row.playerUserId || seen.has(row.playerUserId)) continue
      seen.add(row.playerUserId)
      children.push({ userId: row.playerUserId, name: row.player?.name || row.childName || '' })
    }
    return children
  }

  async upsertRsvp(
    eventId: string,
    userId: string,
    status: RsvpStatusValue,
    reason?: string,
    note?: string,
    childUserId?: string,
  ): Promise<{ eventId: string; userId: string; status: string }> {
    // A parent naming the child goes straight through the guardian check.
    if (childUserId && childUserId !== userId) {
      return this.upsertRsvpProxy(eventId, userId, childUserId, status, reason, note)
    }

    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    })

    if (!event) {
      throw new NotFoundException('Event not found')
    }

    await this.teamsService.assertReadableAccess(userId, event.teamId, { eventId: event.id })

    if (event.cancelledAt) {
      throw new BadRequestException('Cannot RSVP to a cancelled event')
    }

    // Parent auto-proxy: a caller who is not on this team but guards a
    // child who is answers for that child. With two or more children on the
    // same team the answer would be ambiguous, so the client must name the
    // child (childUserId) instead of the first match silently winning.
    const callerOnTeam = await this.prisma.teamAccess.findFirst({
      where: { userId, teamId: event.teamId, ...activeTeamAccessWhere() },
      select: { id: true },
    })
    if (!callerOnTeam) {
      const guardianMatches = await this.prisma.guardianRelationship.findMany({
        where: {
          parentUserId: userId,
          playerUserId: { not: null },
          player: {
            teamAccess: { some: { teamId: event.teamId, ...activeTeamAccessWhere() } },
          },
        },
        select: { playerUserId: true },
      })
      const childIds = Array.from(
        new Set(
          (guardianMatches ?? [])
            .map((match: { playerUserId: string | null }) => match.playerUserId)
            .filter((id: string | null): id is string => Boolean(id)),
        ),
      )
      if (childIds.length > 1) {
        throw new BadRequestException('childUserId is required')
      }
      if (childIds.length === 1) {
        return this.upsertRsvpProxy(eventId, userId, childIds[0], status, reason, note)
      }
    }

    // Pay-to-play: a player who's overdue on dues can't commit YES to
    // the next match. Block ONLY the YES path — MAYBE/NO let them
    // mark availability without playing. Treasurer/admin RSVP-as-proxy
    // via upsertRsvpProxy bypasses this on purpose (they're already
    // making the call on behalf of the player).
    if (status === RsvpStatus.YES) {
      const overdue = await this.contributionsService.getOverdueContributionsForUser(
        event.clubId,
        userId,
        event.date,
      )
      if (overdue.length > 0) {
        const planNames = overdue.map((o) => o.planName).join(', ')
        throw new ForbiddenException(
          `You have unpaid contributions: ${planNames}. Pay your dues in the Contributions tab to commit to this match.`,
        )
      }
    }

    const storedReason = status === 'NO' ? (reason ?? null) : null
    const storedNote = note?.trim() ? note.trim().slice(0, 200) : null
    // H1: an Absage takes the player out of the Kader. The coach keeps a
    // marker (squadDroppedAt) so the Kader tab can say who dropped out,
    // instead of a published Kader that still counts them in.
    if (status === RsvpStatus.NO) {
      await this.prisma.rsvp.updateMany({
        where: { eventId, userId, nominated: true },
        data: { nominated: false, squadDroppedAt: new Date() },
      })
    }
    const rsvp = await this.prisma.rsvp.upsert({
      where: {
        eventId_userId: { eventId, userId },
      },
      update: {
        status,
        reason: storedReason,
        note: storedNote,
        ...(status !== RsvpStatus.NO && { squadDroppedAt: null }),
      },
      create: {
        eventId,
        userId,
        status,
        reason: storedReason,
        note: storedNote,
      },
    })

    // Auto-create reminder when user RSVPs YES and event is >1hr away
    if (status === RsvpStatus.YES) {
      const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000)
      if (event.date > oneHourFromNow) {
        const remindAt = new Date(event.date.getTime() - 60 * 60 * 1000)
        await this.prisma.eventReminderPreference.upsert({
          where: { eventId_userId: { eventId, userId } },
          update: {},
          create: { eventId, userId, remindAt },
        })
      }
    }

    // Realtime: broadcast fresh RSVP counts to the team room.
    void this.eventsGateway.emitRsvpUpdate(event.teamId, eventId)

    // Notify the organizer that a player replied (fix: RSVP_UPDATE was
    // defined but never triggered). Skip when the responder IS the
    // organizer — no point pinging someone about their own reply.
    // Fire-and-forget; prefs + quiet hours are honored by
    // sendToUserLocalized → sendToUser.
    if (event.createdById && event.createdById !== userId) {
      void this.notifyRsvpUpdate(event, userId, status).catch((err) => {
        this.pushLogger.warn(
          `RSVP_UPDATE push failed for event ${eventId}: ${
            err instanceof Error ? err.message : 'unknown error'
          }`,
        )
      })
    }

    return rsvp
  }

  private async notifyRsvpUpdate(
    event: { id: string; title: string; teamId: string; clubId: string; createdById: string },
    responderUserId: string,
    status: RsvpStatusValue,
  ) {
    const responder = await this.prisma.user.findUnique({
      where: { id: responderUserId },
      select: { name: true },
    })
    await this.pushService.sendToUserLocalized(
      event.createdById,
      'RSVP_UPDATE',
      {
        userName: responder?.name ?? '',
        status,
        eventTitle: event.title,
      },
      {
        type: 'event_rsvp',
        eventId: event.id,
        clubId: event.clubId,
        url: `anstoss:///event-detail?eventId=${event.id}`,
      },
      // category so an organizer who muted events doesn't get RSVP pings
      // (matches notifyEventCreated; without it the events mute was bypassed).
      { clubId: event.clubId, category: 'events' },
    )
  }

  async toggleReminder(eventId: string, userId: string, enabled: boolean) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    })

    if (!event) {
      throw new NotFoundException('Event not found')
    }

    await this.teamsService.assertReadableAccess(userId, event.teamId, { eventId: event.id })

    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000)
    if (event.date <= oneHourFromNow) {
      throw new BadRequestException('Cannot set reminder for events less than 1 hour away')
    }

    if (enabled) {
      const remindAt = new Date(event.date.getTime() - 60 * 60 * 1000)
      await this.prisma.eventReminderPreference.upsert({
        where: { eventId_userId: { eventId, userId } },
        update: { remindAt, sent: false },
        create: { eventId, userId, remindAt },
      })
    } else {
      await this.prisma.eventReminderPreference.deleteMany({
        where: { eventId, userId },
      })
    }

    return { reminderEnabled: enabled }
  }

  /**
   * Parent RSVP proxy — a parent can RSVP on behalf of their child.
   * Verifies GuardianRelationship exists between parentUserId and childUserId.
   */
  async upsertRsvpProxy(
    eventId: string,
    parentUserId: string,
    childUserId: string,
    status: RsvpStatusValue,
    reason?: string,
    note?: string,
  ): Promise<{ eventId: string; userId: string; status: string }> {
    const relationship = await this.prisma.guardianRelationship.findFirst({
      where: {
        parentUserId,
        playerUserId: childUserId,
      },
    })
    if (!relationship) {
      throw new ForbiddenException('No guardian relationship with this player')
    }

    return this.upsertRsvp(eventId, childUserId, status, reason, note)
  }

  async getRsvpSummary(eventId: string, userId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { teamId: true },
    })

    if (!event) {
      throw new NotFoundException('Event not found')
    }

    await this.teamsService.assertReadableAccess(userId, event.teamId)

    const counts = await this.prisma.rsvp.groupBy({
      by: ['status'],
      where: { eventId },
      _count: { status: true },
    })

    return {
      yes:
        counts.find((c: (typeof counts)[number]) => c.status === RsvpStatus.YES)?._count.status ||
        0,
      maybe:
        counts.find((c: (typeof counts)[number]) => c.status === RsvpStatus.MAYBE)?._count.status ||
        0,
      no:
        counts.find((c: (typeof counts)[number]) => c.status === RsvpStatus.NO)?._count.status || 0,
    }
  }

  async update(
    eventId: string,
    userId: string,
    data: {
      /** `null` goes back to the derived title (Training / "Heimspiel gegen X"). */
      title?: string | null
      type?: EventTypeValue
      date?: Date
      /** `null` (or an empty string) clears the place / notes. */
      location?: string | null
      notes?: string | null
    } & EventLogisticsInput,
    scope: 'this' | 'following' = 'this',
    expectedClubId?: string,
  ) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    })

    if (!event) {
      throw new NotFoundException('Event not found')
    }
    if (expectedClubId && event.clubId !== expectedClubId) {
      throw new NotFoundException('Event not found')
    }

    // Any event manager (OWNER/ADMIN/COACH on this team) may edit, not only
    // the creator. A club has more than one coach, and the person who made
    // the entry is not always the one who has to move it.
    await this.teamsService.assertEventManagementAccess(userId, event.teamId)

    if (event.cancelledAt) {
      throw new BadRequestException('Cannot update a cancelled event')
    }

    const dateMoves =
      data.date !== undefined && data.date.getTime() !== event.date.getTime()
    const newDate = data.date ?? event.date
    // A past event stays editable (notes, place, the real kickoff), but an
    // upcoming one is never moved into the past by a slip of the picker.
    if (dateMoves && newDate.getTime() < Date.now() && event.date.getTime() >= Date.now()) {
      throw new BadRequestException('Event date must be in the future')
    }
    // L8: the Treffpunkt is before the start, checked against the start the
    // event will have after this edit (the stored one when the date stays).
    if (data.meetingAt && data.meetingAt.getTime() > newDate.getTime()) {
      throw new BadRequestException('Meeting time must be before the start')
    }

    await this.archiveExpiredEvents(event.teamId)

    // Treffpunkt travels with the start: an explicit meetingAt sets the offset
    // (null clears it); a moved date keeps the existing offset.
    const meetingOffsetMs: number | null | undefined =
      data.meetingAt !== undefined
        ? data.meetingAt
          ? Math.max(0, newDate.getTime() - data.meetingAt.getTime())
          : null
        : undefined
    const meetingFor = (
      rowOldDate: Date,
      rowNewDate: Date,
      rowMeetingAt: Date | null | undefined,
    ): { meetingAt?: Date | null } => {
      if (meetingOffsetMs !== undefined) {
        return {
          meetingAt: meetingOffsetMs === null ? null : new Date(rowNewDate.getTime() - meetingOffsetMs),
        }
      }
      if (rowMeetingAt && rowOldDate.getTime() !== rowNewDate.getTime()) {
        return {
          meetingAt: new Date(rowNewDate.getTime() - (rowOldDate.getTime() - rowMeetingAt.getTime())),
        }
      }
      return {}
    }

    // Titles: a derived title follows type and opponent; a typed one stays.
    const titleTouched =
      data.title !== undefined || data.type !== undefined || data.opponent !== undefined
    const titleData = titleTouched
      ? storedTitleOrThrow({
          type: data.type ?? event.type,
          title: data.title !== undefined ? data.title : event.autoTitle ? null : event.title,
          opponent: data.opponent !== undefined ? data.opponent : event.opponent,
        })
      : null

    const logistics = logisticsData(data)
    const sharedData = {
      ...(titleData && { title: titleData.title, autoTitle: titleData.autoTitle }),
      ...(data.type !== undefined && { type: data.type }),
      ...(data.location !== undefined && { location: trimOrNull(data.location) }),
      ...(data.notes !== undefined && { notes: trimOrNull(data.notes) }),
      ...logistics,
    }

    const { updated, followingCount } = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.event.update({
        where: { id: eventId },
        data: {
          ...sharedData,
          ...(data.date !== undefined && { date: data.date }),
          // A moved date re-opens the question: answers given before it are
          // kept but flagged, so nobody is counted in for a time they never saw.
          ...(dateMoves && { rescheduledAt: new Date() }),
          ...(data.meetingAt !== undefined
            ? { meetingAt: data.meetingAt }
            : meetingFor(event.date, newDate, event.meetingAt)),
        },
      })

      // "This and following": the same edit lands on every later occurrence
      // that is still on. A new time applies to the whole series; a new
      // weekday only to the occurrences on the old weekday (moving Tuesday to
      // Wednesday leaves Thursday alone), and the series rule learns it.
      let followingCount = 0
      if (scope === 'following' && event.seriesId) {
        const series = await tx.eventSeries.findUnique({
          where: { id: event.seriesId },
          select: { startsAt: true, until: true, weekdays: true },
        })
        const oldWeekday = berlinWeekday(event.date)
        const newWeekday = berlinWeekday(newDate)
        const weekdayMoves = dateMoves && oldWeekday !== newWeekday
        const earlierCount = dateMoves
          ? await tx.event.count({
              where: {
                seriesId: event.seriesId,
                id: { not: eventId },
                date: { lt: event.date },
              },
            })
          : 1
        const later = await tx.event.findMany({
          where: {
            seriesId: event.seriesId,
            id: { not: eventId },
            date: { gt: event.date },
            cancelledAt: null,
          },
          select: { id: true, date: true, meetingAt: true },
        })

        let lastDate = newDate
        if (!dateMoves && meetingOffsetMs === undefined) {
          // Nothing per-row (no new dates, no new meeting offsets): one write.
          if (later.length > 0 && Object.keys(sharedData).length > 0) {
            await tx.event.updateMany({
              where: { id: { in: later.map((row) => row.id) } },
              data: sharedData,
            })
          }
        } else {
          for (const row of later) {
            const shifts =
              dateMoves && (!weekdayMoves || berlinWeekday(row.date) === oldWeekday)
            const rowNewDate = shifts ? shiftByZonedWallDelta(row.date, event.date, newDate) : row.date
            if (rowNewDate.getTime() > lastDate.getTime()) lastDate = rowNewDate
            await tx.event.update({
              where: { id: row.id },
              data: {
                ...sharedData,
                ...meetingFor(row.date, rowNewDate, row.meetingAt),
                ...(shifts && { date: rowNewDate, rescheduledAt: new Date() }),
              },
            })
          }
        }
        followingCount = later.length

        const weekdays = series?.weekdays ?? []
        const nextWeekdays =
          weekdayMoves && weekdays.length > 0
            ? normalizeWeekdays(weekdays.map((day) => (day === oldWeekday ? newWeekday : day)))
            : null
        await tx.eventSeries.update({
          where: { id: event.seriesId },
          data: {
            ...(titleData && { title: titleData.title }),
            ...(data.type !== undefined && { type: data.type }),
            ...(data.location !== undefined && { location: trimOrNull(data.location) }),
            ...(data.notes !== undefined && { notes: trimOrNull(data.notes) }),
            ...(data.durationMin !== undefined && { durationMin: data.durationMin }),
            ...(meetingOffsetMs !== undefined && {
              meetingOffsetMin: meetingOffsetMs === null ? null : Math.round(meetingOffsetMs / 60000),
            }),
            ...(nextWeekdays && { weekdays: nextWeekdays }),
            ...(dateMoves &&
              data.date &&
              series && {
                ...(earlierCount === 0 && { startsAt: data.date }),
                until: weekdayMoves
                  ? new Date(Math.max(series.until.getTime(), lastDate.getTime()))
                  : shiftByZonedWallDelta(series.until, event.date, data.date),
              }),
          },
        })
      }

      return { updated, followingCount }
    }, SERIES_TRANSACTION_OPTIONS)

    // Realtime: broadcast the change so subscribed clients refresh the event.
    this.eventsGateway.emitEventUpsert(updated.teamId, updated.id)

    // A change of when or where is a change the squad has to act on. Title
    // and notes edits are cosmetic and stay quiet.
    const locationChanged =
      data.location !== undefined && trimOrNull(data.location) !== (event.location ?? null)
    // A new Treffpunkt time or place is just as actionable as a new kickoff.
    const meetingChanged =
      (data.meetingAt !== undefined &&
        (data.meetingAt?.getTime() ?? null) !== (event.meetingAt?.getTime() ?? null)) ||
      (data.meetingPoint !== undefined &&
        trimOrNull(data.meetingPoint) !== (event.meetingPoint ?? null))
    if (dateMoves || locationChanged || meetingChanged) {
      const clubId = updated.clubId
      const teamName = await this.teamNameFor(updated.teamId)
      const date = formatEventDate(updated.date)
      this.sendTeamEventPush('EVENT_UPDATED', updated, {
        teamName,
        clubId,
        excludeUserId: userId,
        pushType: 'event_updated',
      }).catch((error: unknown) => {
        this.pushLogger.warn(
          `EVENT_UPDATED push failed for event ${updated.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      })
      void this.chatService.postSystemNotice({
        teamId: updated.teamId,
        clubId,
        actorId: userId,
        content: `${eventTitleFor(updated, CHAT_NOTICE_LOCALE)}: ${date}${
          updated.location ? ` · ${updated.location}` : ''
        }${followingCount > 0 ? ` (+${followingCount})` : ''}`,
      }).catch((error: unknown) => {
        this.pushLogger.warn(
          `EVENT_UPDATED chat notice failed for event ${updated.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      })
    }

    return updated
  }

  async cancel(
    eventId: string,
    userId: string,
    reason?: string,
    scope: 'this' | 'following' = 'this',
    expectedClubId?: string,
  ) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    })

    if (!event) {
      throw new NotFoundException('Event not found')
    }
    if (expectedClubId && event.clubId !== expectedClubId) {
      throw new NotFoundException('Event not found')
    }

    await this.teamsService.assertEventManagementAccess(userId, event.teamId)

    if (event.cancelledAt) {
      throw new BadRequestException('Event is already cancelled')
    }

    await this.archiveExpiredEvents(event.teamId)

    const cancelReason = reason?.trim() || null
    const cancelledAt = new Date()
    const { cancelled, followingCount } = await this.prisma.$transaction(async (tx) => {
      // Soft-delete: mark as cancelled rather than hard delete. The row stays
      // in upcoming feeds until its date passes so the squad sees the change
      // in the schedule, not only in a push they may have swiped away.
      const cancelled = await tx.event.update({
        where: { id: eventId },
        data: { cancelledAt, cancelReason },
      })

      // "This and following" cancels the rest of the series in one go, with one
      // notification for the lot rather than one per occurrence.
      let followingCount = 0
      if (scope === 'following' && event.seriesId) {
        const result = await tx.event.updateMany({
          where: {
            seriesId: event.seriesId,
            id: { not: eventId },
            date: { gt: event.date },
            cancelledAt: null,
          },
          data: { cancelledAt, cancelReason },
        })
        followingCount = result.count
        await tx.eventSeries.update({
          where: { id: event.seriesId },
          data: { until: event.date },
        })
      }

      return { cancelled, followingCount }
    })

    this.eventsGateway.emitEventUpsert(cancelled.teamId, cancelled.id)

    const clubId = cancelled.clubId
    const teamName = await this.teamNameFor(cancelled.teamId)
    const date = formatEventDate(cancelled.date)
    this.sendTeamEventPush('EVENT_CANCELLED', cancelled, {
      teamName,
      clubId,
      excludeUserId: userId,
      pushType: 'event_cancelled',
    }).catch((error: unknown) => {
        this.pushLogger.warn(
          `EVENT_CANCELLED push failed for event ${cancelled.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      })
    void this.chatService.postSystemNotice({
      teamId: cancelled.teamId,
      clubId,
      actorId: userId,
      content: `${eventTitleFor(cancelled, CHAT_NOTICE_LOCALE)} (${date}${followingCount > 0 ? ` +${followingCount}` : ''})${
        cancelled.cancelReason ? `: ${cancelled.cancelReason}` : ''
      }`,
    }).catch((error: unknown) => {
      this.pushLogger.warn(
        `EVENT_CANCELLED chat notice failed for event ${cancelled.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    })

    return cancelled
  }

  // ─── Kader ───────────────────────────────────────────────────────────────

  private async findEventInClub(clubId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({ where: { id: eventId, clubId } })
    if (!event) throw new NotFoundException('Event not found')
    return event
  }

  private async buildSquad(event: {
    id: string
    teamId: string
    squadPublishedAt: Date | null
  }): Promise<EventSquad> {
    const [members, rsvps] = await Promise.all([
      this.loadTeamPlayers(event.teamId),
      this.prisma.rsvp.findMany({
        where: { eventId: event.id },
        select: {
          userId: true,
          status: true,
          reason: true,
          nominated: true,
          squadDroppedAt: true,
          user: { select: { name: true } },
        },
      }),
    ])
    type SquadReply = {
      userId: string
      status: RsvpStatusValue
      reason: string | null
      nominated: boolean
      squadDroppedAt?: Date | null
      user?: { name: string | null } | null
    }
    const replies = (rsvps ?? []) as SquadReply[]
    const replyByUser = new Map(replies.map((rsvp) => [rsvp.userId, rsvp]))
    const memberIds = new Set(members.map((member) => member.userId))
    // Only players who said yes or maybe can be put in the Kader: nominating
    // someone who never answered would count them in for a date they never saw.
    const candidates = members
      .map((member) => {
        const reply = replyByUser.get(member.userId)
        return { ...member, rsvp: reply?.status ?? null, reason: reply?.reason ?? null }
      })
      .filter((member) => member.rsvp === RsvpStatus.YES || member.rsvp === RsvpStatus.MAYBE)
    const candidateIds = new Set(candidates.map((candidate) => candidate.userId))
    const nameOf = (reply: SquadReply) =>
      members.find((member) => member.userId === reply.userId)?.name ?? reply.user?.name ?? ''
    // H1: someone who was nominated and then said Absage or left the team is
    // no longer in nominatedUserIds (a Kader the coach can always save) and is
    // named here instead, so the coach knows who to replace.
    const dropouts = replies
      .filter((reply) => reply.squadDroppedAt || (reply.nominated && !candidateIds.has(reply.userId)))
      .filter((reply) => !candidateIds.has(reply.userId))
      .map((reply) => ({
        userId: reply.userId,
        name: nameOf(reply),
        cause: memberIds.has(reply.userId) ? ('declined' as const) : ('left' as const),
        reason: memberIds.has(reply.userId) ? reply.reason : null,
        at: reply.squadDroppedAt ? reply.squadDroppedAt.toISOString() : null,
      }))
    return {
      eventId: event.id,
      publishedAt: event.squadPublishedAt?.toISOString() ?? null,
      nominatedUserIds: replies
        .filter((reply) => reply.nominated && candidateIds.has(reply.userId))
        .map((reply) => reply.userId),
      candidates,
      dropouts,
    }
  }

  async getSquad(clubId: string, eventId: string, userId: string): Promise<EventSquad> {
    const event = await this.findEventInClub(clubId, eventId)
    await this.teamsService.assertEventManagementAccess(userId, event.teamId)
    return this.buildSquad(event)
  }

  /**
   * Set the Kader. `publish` stamps squadPublishedAt and tells the players
   * who are newly in it (and their guardians); re-publishing after a change
   * only pings the ones who were added. Ids that stopped being candidates
   * while the coach had the screen open (an Absage, a player who left) are
   * dropped rather than failing the whole save.
   */
  async updateSquad(
    clubId: string,
    eventId: string,
    userId: string,
    input: { userIds: string[]; publish?: boolean },
  ): Promise<EventSquad> {
    const event = await this.findEventInClub(clubId, eventId)
    await this.teamsService.assertEventManagementAccess(userId, event.teamId)
    if (event.cancelledAt) throw new BadRequestException('Event is cancelled')

    const current = await this.buildSquad(event)
    const candidateIds = new Set(current.candidates.map((candidate) => candidate.userId))
    const userIds = Array.from(new Set(input.userIds)).filter((id) => candidateIds.has(id))

    const wasNominated = new Set(current.nominatedUserIds)
    const firstPublish = !event.squadPublishedAt
    const publishedAt = input.publish ? new Date() : event.squadPublishedAt

    await this.prisma.$transaction(async (tx) => {
      await tx.rsvp.updateMany({
        where: { eventId, userId: { in: userIds } },
        data: { nominated: true, squadDroppedAt: null },
      })
      await tx.rsvp.updateMany({
        where: { eventId, userId: { notIn: userIds }, nominated: true },
        data: { nominated: false },
      })
      // Saving the Kader is the coach's answer to the drop-out notice.
      await tx.rsvp.updateMany({
        where: { eventId, squadDroppedAt: { not: null } },
        data: { squadDroppedAt: null },
      })
      if (input.publish) {
        await tx.event.update({
          where: { id: eventId },
          data: { squadPublishedAt: publishedAt },
        })
      }
    })

    this.eventsGateway.emitEventUpsert(event.teamId, event.id)

    if (input.publish) {
      const recipients = firstPublish ? userIds : userIds.filter((id) => !wasNominated.has(id))
      if (recipients.length > 0) {
        void this.notifySquadNominated(event, recipients).catch((err) => {
          this.pushLogger.warn(
            `SQUAD_NOMINATED push failed for event ${event.id}: ${
              err instanceof Error ? err.message : 'unknown error'
            }`,
          )
        })
      }
    }

    return this.buildSquad({ ...event, squadPublishedAt: publishedAt ?? null })
  }

  /** preferredLanguage → event locale for each user (German when unset). */
  private async loadEventLocales(userIds: string[]): Promise<Map<string, EventLocale>> {
    const unique = Array.from(new Set(userIds))
    if (unique.length === 0) return new Map()
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, preferredLanguage: true },
    })
    return new Map(
      (users ?? []).map((user: { id: string; preferredLanguage: string | null }) => [
        user.id,
        resolveEventLocale(user.preferredLanguage),
      ]),
    )
  }

  /**
   * SQUAD_NOMINATED: the player reads "Du bist im Kader …"; each guardian
   * reads "Mia ist im Kader …". Title and date in the recipient's language.
   */
  private async notifySquadNominated(
    event: TitledEventRecord & { id: string; date: Date; clubId: string },
    playerIds: string[],
  ) {
    const guardians = (await this.prisma.guardianRelationship.findMany({
      where: { playerUserId: { in: playerIds } },
      select: {
        parentUserId: true,
        playerUserId: true,
        childName: true,
        player: { select: { name: true } },
      },
    })) as Array<{
      parentUserId: string
      playerUserId: string | null
      childName: string | null
      player?: { name: string | null } | null
    }>
    const locales = await this.loadEventLocales([
      ...playerIds,
      ...(guardians ?? []).map((row) => row.parentUserId),
    ])
    const payload = {
      type: 'event_squad',
      eventId: event.id,
      clubId: event.clubId,
      url: `anstoss:///event-detail?eventId=${event.id}`,
    }
    const send = (recipient: string, childName: string | null) => {
      const locale = locales.get(recipient) ?? 'de'
      const copy = squadNominatedCopy(locale, {
        eventTitle: eventTitleFor(event, locale),
        date: formatEventDateFor(event.date, locale),
        childName,
      })
      return this.pushService.sendToUser(recipient, copy.title, copy.body, payload, {
        clubId: event.clubId,
        category: 'events',
      })
    }
    const sent = new Set<string>()
    const jobs: Array<Promise<unknown>> = []
    for (const playerId of playerIds) {
      sent.add(playerId)
      jobs.push(send(playerId, null))
    }
    for (const row of guardians ?? []) {
      const key = `${row.parentUserId}:${row.playerUserId}`
      // A parent who is also the nominated player already got their own push.
      if (sent.has(key) || row.parentUserId === row.playerUserId) continue
      sent.add(key)
      const childName = firstName(row.player?.name || row.childName || '')
      jobs.push(send(row.parentUserId, childName || null))
    }
    await Promise.all(jobs)
  }

  // ─── Aufstellung ─────────────────────────────────────────────────────────

  async getLineup(clubId: string, eventId: string, userId: string): Promise<EventLineup | null> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, clubId },
      include: { fixture: { select: { overlay: { select: { lineup: true, lineupFormation: true } } } } },
    })
    if (!event) throw new NotFoundException('Event not found')
    await this.teamsService.assertReadableAccess(userId, event.teamId)
    // L2: the Aufstellung is the coach's draft until the Kader is published.
    if (!event.squadPublishedAt && !(await this.canViewReadiness(userId, event.teamId))) {
      return null
    }
    return (
      readLineup(event.lineup) ??
      (event.fixture?.overlay
        ? readLineup(event.fixture.overlay.lineup, event.fixture.overlay.lineupFormation)
        : null)
    )
  }

  /**
   * Save the Aufstellung on the event, so manual matches can have one too.
   * A match linked to a fussball.de fixture also mirrors it into the fixture
   * overlay, which the match screen's lineup tab reads.
   */
  async saveLineup(
    clubId: string,
    eventId: string,
    userId: string,
    input: SaveEventLineupInput,
  ): Promise<EventLineup> {
    const event = await this.findEventInClub(clubId, eventId)
    await this.teamsService.assertEventManagementAccess(userId, event.teamId)

    const lineup: EventLineup = {
      formation: input.formation,
      starters: input.starters.map(normalizeLineupPlayer),
      bench: (input.bench ?? []).map(normalizeLineupPlayer),
    }

    await this.prisma.event.update({
      where: { id: eventId },
      data: { lineup: lineup as unknown as Prisma.InputJsonValue },
    })

    if (event.fixtureId) {
      const fixtureLineup = {
        formation: lineup.formation,
        starters: lineup.starters.map(({ number, name, position }) => ({ number, name, position })),
        bench: lineup.bench.map(({ number, name, position }) => ({ number, name, position })),
      } as unknown as Prisma.InputJsonValue
      await this.prisma.fixtureOverlay.upsert({
        where: { fixtureId: event.fixtureId },
        update: { lineupFormation: lineup.formation, lineup: fixtureLineup },
        create: {
          clubId: event.clubId,
          fixtureId: event.fixtureId,
          lineupFormation: lineup.formation,
          lineup: fixtureLineup,
          fieldLocks: [],
        },
      })
    }

    this.eventsGateway.emitEventUpsert(event.teamId, event.id)
    return lineup
  }

  private async teamNameFor(teamId: string): Promise<string> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { name: true },
    })
    return team?.name ?? ''
  }

  async remindRsvp(
    clubId: string,
    eventId: string,
    requestingUserId: string,
  ): Promise<{ sent: number; nextAvailableAt: string }> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId, clubId },
      include: {
        team: {
          include: {
            access: {
              // The squad (same rule as the Offen count), so the number the
              // coach saw is the number of people who get the reminder.
              where: {
                ...SQUAD_ACCESS_COUNT_WHERE,
                ...activeTeamAccessWhere(),
              },
              include: { user: true },
            },
          },
        },
      },
    })
    if (!event) throw new NotFoundException('Event not found')
    if (event.cancelledAt) throw new BadRequestException('Event is cancelled')
    if (new Date(event.date) < new Date()) throw new BadRequestException('Event is in the past')

    // Auth: only event managers (OWNER/ADMIN/COACH) may send reminders
    await this.teamsService.assertEventManagementAccess(requestingUserId, event.teamId)

    // Find members with no RSVP for this event
    const existingRsvps = await this.prisma.rsvp.findMany({
      where: { eventId },
      select: { userId: true },
    })
    const respondedUserIds = new Set(existingRsvps.map((r: { userId: string }) => r.userId))
    const inactive = await this.prisma.teamMember.findMany({
      where: { teamId: event.teamId, operationalStatus: 'INACTIVE' },
      select: { userId: true },
    })
    const inactiveIds = new Set((inactive ?? []).map((row: { userId: string }) => row.userId))
    const nonResponders = event.team.access
      .filter((a: { role?: string }) => !a.role || a.role === TeamRole.PLAYER)
      .filter((a: { user: { id: string } }) => !inactiveIds.has(a.user.id))
      .map((a: { user: { id: string } }) => a.user)
      .filter((u: { id: string }) => !respondedUserIds.has(u.id) && u.id !== requestingUserId)

    // Bug 2 fix: deduplicate by userId (users with multiple roles appear multiple times)
    const seen = new Set<string>()
    const uniqueNonResponders = nonResponders.filter((u: { id: string }) => {
      if (seen.has(u.id)) return false
      seen.add(u.id)
      return true
    })

    // Bug 3 fix: if nobody needs a reminder, return early without claiming the rate-limit slot
    if (uniqueNonResponders.length === 0) {
      return {
        sent: 0,
        nextAvailableAt: new Date(Date.now() + RSVP_REMINDER_COOLDOWN_MS).toISOString(),
      }
    }

    // Bug 1 fix: atomic rate-limit claim — only one concurrent caller gets count === 1
    const cutoff = new Date(Date.now() - RSVP_REMINDER_COOLDOWN_MS)
    const claimedAt = new Date()
    const claim = await this.prisma.event.updateMany({
      where: {
        id: eventId,
        clubId,
        OR: [{ lastRsvpReminderAt: null }, { lastRsvpReminderAt: { lt: cutoff } }],
      },
      data: { lastRsvpReminderAt: claimedAt },
    })
    if (claim.count === 0) {
      // Someone beat us or rate limit is still active — re-read to get retryAfter
      const fresh = await this.prisma.event.findUnique({
        where: { id: eventId },
        select: { lastRsvpReminderAt: true },
      })
      const nextAvailableAt = new Date(
        (fresh?.lastRsvpReminderAt?.getTime() ?? Date.now()) + RSVP_REMINDER_COOLDOWN_MS,
      ).toISOString()
      throw new HttpException(
        { message: 'Rate limit: reminder already sent', retryAfter: nextAvailableAt },
        429,
      )
    }

    // Each player reads the reminder in their own language.
    const locales = await this.loadEventLocales(uniqueNonResponders.map((u: { id: string }) => u.id))
    const data = {
      type: 'event_rsvp_reminder',
      eventId,
      clubId,
      url: `anstoss:///event-detail?eventId=${eventId}`,
    }

    const deliveryResults = await Promise.all(
      uniqueNonResponders.map(async (user: { id: string }) => {
        const copy = rsvpReminderCopy(locales.get(user.id) ?? 'de', {
          event,
          date: new Date(event.date),
          location: event.location,
        })
        try {
          await this.pushService.sendToUser(user.id, copy.title, copy.body, data, { clubId })
          return true
        } catch {
          return false
        }
      }),
    )
    const sent = deliveryResults.filter(Boolean).length

    if (sent === 0) {
      await this.prisma.event.updateMany({
        where: { id: eventId, clubId, lastRsvpReminderAt: claimedAt },
        data: { lastRsvpReminderAt: null },
      })
    }

    const nextAvailableAt = new Date(Date.now() + RSVP_REMINDER_COOLDOWN_MS).toISOString()
    return { sent, nextAvailableAt }
  }

  /**
   * Player self check-in for an event.
   * Window: 2 hours before start → 3 hours after start.
   * Idempotent — second tap returns the existing record without error.
   */
  async checkIn(clubId: string, eventId: string, userId: string): Promise<{ checkedInAt: string }> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId, clubId },
    })
    if (!event) throw new NotFoundException('Event not found')
    if (event.cancelledAt) throw new BadRequestException('Event is cancelled')

    // Must be a member of the event's team (players, coaches, guardians)
    await this.teamsService.assertReadableAccess(userId, event.teamId, { eventId: event.id })

    // Time window: 2 hours before start → 3 hours after start
    const eventTime = new Date(event.date).getTime()
    const now = Date.now()
    const windowStart = eventTime - 2 * 60 * 60 * 1000
    const windowEnd = eventTime + 3 * 60 * 60 * 1000
    if (now < windowStart || now > windowEnd) {
      throw new BadRequestException('Check-in window is not open')
    }

    // Idempotent upsert — second tap returns existing record
    const checkIn = await this.prisma.eventCheckIn.upsert({
      where: { eventId_userId: { eventId, userId } },
      create: { clubId, teamId: event.teamId, eventId, userId },
      update: {}, // no-op on duplicate
    })

    return { checkedInAt: checkIn.checkedInAt.toISOString() }
  }

  /**
   * Attendance report for coaches/admins.
   * Shows all RSVPs, actual check-ins, and no-shows (after event ends).
   */
  async getAttendance(
    clubId: string,
    eventId: string,
    requestingUserId: string,
  ): Promise<{
    rsvps: Array<{
      userId: string
      user: { name: string; avatarUrl?: string | null }
      status: string
      reason?: string | null
    }>
    checkIns: Array<{
      userId: string
      user: { name: string }
      checkedInAt: string
    }>
    noShows: Array<{
      userId: string
      user: { name: string }
    }>
  }> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId, clubId } })
    if (!event) throw new NotFoundException('Event not found')

    // Auth: must be able to manage events for this team
    await this.teamsService.assertEventManagementAccess(requestingUserId, event.teamId)

    const [rsvps, checkIns] = await Promise.all([
      this.prisma.rsvp.findMany({
        where: { eventId },
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
        },
      }),
      this.prisma.eventCheckIn.findMany({
        where: { eventId },
        orderBy: { checkedInAt: 'asc' },
        include: {
          user: { select: { id: true, name: true } },
        },
      }),
    ])

    const checkedInUserIds = new Set(checkIns.map((c: { userId: string }) => c.userId))

    // No-shows: RSVPed YES but didn't check in (only show after event window closes)
    const eventEnded = new Date(event.date).getTime() + 3 * 60 * 60 * 1000 < Date.now()
    const noShows = eventEnded
      ? rsvps.filter(
          (r: { status: string; userId: string }) =>
            r.status === 'YES' && !checkedInUserIds.has(r.userId),
        )
      : []

    return {
      rsvps: rsvps.map((r: any) => ({
        userId: r.userId,
        user: r.user,
        status: r.status,
        reason: r.reason,
      })),
      checkIns: checkIns.map((c: any) => ({
        userId: c.userId,
        user: c.user,
        checkedInAt: c.checkedInAt.toISOString(),
      })),
      noShows: noShows.map((r: any) => ({ userId: r.userId, user: r.user })),
    }
  }

  private async archiveExpiredEvents(teamId: string) {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - EVENT_ARCHIVE_RETENTION_DAYS)

    await this.prisma.event.updateMany({
      where: {
        teamId,
        archivedAt: null,
        date: {
          lt: cutoff,
        },
      },
      data: {
        archivedAt: new Date(),
      },
    })
  }

  private async archiveExpiredClubEvents(clubId: string) {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - EVENT_ARCHIVE_RETENTION_DAYS)

    await this.prisma.event.updateMany({
      where: {
        clubId,
        archivedAt: null,
        date: {
          lt: cutoff,
        },
      },
      data: {
        archivedAt: new Date(),
      },
    })
  }
}

function buildEventReadiness(event: EventReadinessRecord): EventReadiness {
  const squadSize = event.team?._count?.access ?? 0
  const responseCount = event._count.rsvps ?? event.rsvps.length
  const yesCount = event.rsvps.filter((rsvp) => rsvp.status === RsvpStatus.YES).length
  const maybeCount = event.rsvps.filter((rsvp) => rsvp.status === RsvpStatus.MAYBE).length
  const noCount = event.rsvps.filter((rsvp) => rsvp.status === RsvpStatus.NO).length
  const pendingCount = Math.max(0, squadSize - responseCount)
  const checkInCount = event._count.checkIns ?? 0
  const injuryRiskCount = event.rsvps.filter(
    (rsvp) => rsvp.status === RsvpStatus.NO && isInjuryReason(rsvp.reason ?? null),
  ).length
  const suspensionRiskCount = event.rsvps.filter(
    (rsvp) => rsvp.status === RsvpStatus.NO && isSuspensionReason(rsvp.reason ?? null),
  ).length

  const signals: EventReadinessSignal[] = []

  if (squadSize === 0) {
    return {
      status: 'NEEDS_SETUP',
      score: 0,
      briefing: createReadinessBriefing(
        'needs_setup',
        {},
        'Add players before readiness can be calculated.',
      ),
      metrics: {
        squadSize,
        responseCount,
        yesCount,
        maybeCount,
        noCount,
        pendingCount: 0,
        responseRate: 0,
        confirmedRate: 0,
        checkInCount,
        injuryRiskCount,
        suspensionRiskCount,
      },
      signals: [{ key: 'no_squad', severity: 'critical' }],
      nudge: {
        recommended: false,
        reason: 'none',
        targetCount: 0,
        urgency: 'low',
      },
    }
  }

  // RSVPs can include coaches or guests outside the squad count; cap at 100%.
  const responseRate = Math.min(1, responseCount / squadSize)
  const confirmedRate = Math.min(1, yesCount / squadSize)
  const targetConfirmed = getTargetConfirmedCount(event.type, squadSize)
  let score = 100

  if (yesCount < targetConfirmed) {
    const missing = targetConfirmed - yesCount
    score -= Math.min(36, missing * 6)
    signals.push({
      key: 'low_confirmations',
      severity: event.type === 'MATCH' && missing >= 3 ? 'critical' : 'warning',
      count: yesCount,
      target: targetConfirmed,
    })
  }

  if (responseRate < 0.6) {
    score -= 25
    signals.push({
      key: 'low_response_rate',
      severity: responseRate < 0.35 ? 'critical' : 'warning',
      count: responseCount,
      target: squadSize,
    })
  } else if (responseRate < 0.8) {
    score -= 10
    signals.push({
      key: 'pending_replies',
      severity: 'info',
      count: pendingCount,
      target: squadSize,
    })
  }

  if (pendingCount > 0) {
    score -= Math.min(18, pendingCount * 2)
    if (!signals.some((signal) => signal.key === 'pending_replies')) {
      signals.push({
        key: 'pending_replies',
        severity: pendingCount >= 4 ? 'warning' : 'info',
        count: pendingCount,
        target: squadSize,
      })
    }
  }

  const unavailableCount = noCount + maybeCount
  if (unavailableCount > 0) {
    score -= Math.min(14, unavailableCount * 2)
    signals.push({
      key: 'availability_risks',
      severity: unavailableCount >= 4 ? 'warning' : 'info',
      count: unavailableCount,
    })
  }

  const medicalRiskCount = injuryRiskCount + suspensionRiskCount
  if (medicalRiskCount > 0) {
    score -= Math.min(15, medicalRiskCount * 5)
    signals.push({
      key: 'injury_risks',
      severity: medicalRiskCount >= 2 ? 'critical' : 'warning',
      count: medicalRiskCount,
    })
  }

  const now = Date.now()
  const eventTime = event.date.getTime()
  const checkInWindowOpen = now >= eventTime - 2 * 60 * 60 * 1000
  const eventStarted = now >= eventTime
  const eventWindowClosed = now > eventTime + 3 * 60 * 60 * 1000

  if (checkInWindowOpen && !eventWindowClosed && yesCount > 0 && checkInCount < yesCount) {
    const missingCheckIns = yesCount - checkInCount
    score -= Math.min(12, missingCheckIns * 2)
    signals.push({
      key: 'check_in_gap',
      severity: missingCheckIns >= 4 ? 'warning' : 'info',
      count: checkInCount,
      target: yesCount,
    })
  }

  if (eventWindowClosed && yesCount > checkInCount) {
    const noShowCount = yesCount - checkInCount
    score -= Math.min(20, noShowCount * 4)
    signals.push({
      key: 'no_show_risk',
      severity: noShowCount >= 3 ? 'critical' : 'warning',
      count: noShowCount,
      target: yesCount,
    })
  }

  const normalizedScore = Math.max(0, Math.min(100, Math.round(score)))
  const status = getReadinessStatus(normalizedScore, signals)
  const nudge = buildNudgeRecommendation({
    event,
    status,
    pendingCount,
    responseRate,
    yesCount,
    targetConfirmed,
  })

  return {
    status,
    score: normalizedScore,
    briefing: buildReadinessBriefing({
      status,
      squadSize,
      yesCount,
      maybeCount,
      noCount,
      pendingCount,
      checkInCount,
      targetConfirmed,
      injuryRiskCount,
      suspensionRiskCount,
      checkInWindowOpen,
      eventStarted,
      eventWindowClosed,
      nudge,
    }),
    metrics: {
      squadSize,
      responseCount,
      yesCount,
      maybeCount,
      noCount,
      pendingCount,
      responseRate: roundRate(responseRate),
      confirmedRate: roundRate(confirmedRate),
      checkInCount,
      injuryRiskCount,
      suspensionRiskCount,
    },
    signals: selectVisibleSignals(signals, 4),
    nudge,
  }
}

function buildReadinessBriefing({
  status,
  squadSize,
  yesCount,
  maybeCount,
  noCount,
  pendingCount,
  checkInCount,
  targetConfirmed,
  injuryRiskCount,
  suspensionRiskCount,
  checkInWindowOpen,
  eventStarted,
  eventWindowClosed,
  nudge,
}: {
  status: EventReadiness['status']
  squadSize: number
  yesCount: number
  maybeCount: number
  noCount: number
  pendingCount: number
  checkInCount: number
  targetConfirmed: number
  injuryRiskCount: number
  suspensionRiskCount: number
  checkInWindowOpen: boolean
  eventStarted: boolean
  eventWindowClosed: boolean
  nudge: EventReadinessNudge
}): NonNullable<EventReadiness['briefing']> {
  const missingConfirmations = Math.max(0, targetConfirmed - yesCount)
  const medicalRiskCount = injuryRiskCount + suspensionRiskCount
  const availabilityRiskCount = maybeCount + noCount
  const noShowCount = Math.max(0, yesCount - checkInCount)

  if (status === 'NEEDS_SETUP') {
    return createReadinessBriefing(
      'needs_setup',
      {},
      'Add players before readiness can be calculated.',
    )
  }

  if (eventWindowClosed) {
    if (noShowCount > 0) {
      return createReadinessBriefing(
        'no_show_review',
        { count: noShowCount },
        `Review attendance: ${noShowCount} confirmed ${pluralize(
          'player',
          noShowCount,
        )} ${noShowCount === 1 ? 'was' : 'were'} not checked in.`,
      )
    }

    return createReadinessBriefing(
      'event_closed',
      {},
      'Event has ended. Review attendance before follow-up.',
    )
  }

  if (eventStarted) {
    return createReadinessBriefing(
      'event_started',
      {},
      'Event is underway. Use check-ins and attendance instead of RSVP nudges.',
    )
  }

  if (medicalRiskCount >= 2) {
    return createReadinessBriefing(
      'private_availability_review',
      { count: medicalRiskCount },
      `Review ${medicalRiskCount} private availability ${pluralize(
        'risk',
        medicalRiskCount,
      )} in Anstoss.`,
    )
  }

  if (status === 'AT_RISK' && missingConfirmations > 0) {
    return createReadinessBriefing(
      'low_confirmations',
      { count: missingConfirmations, target: targetConfirmed, confirmed: yesCount },
      `Need ${missingConfirmations} more ${pluralize(
        'confirmation',
        missingConfirmations,
      )} to reach the match target.`,
    )
  }

  if (medicalRiskCount > 0) {
    return createReadinessBriefing(
      'private_availability_review',
      { count: medicalRiskCount },
      `Review ${medicalRiskCount} private availability ${pluralize(
        'risk',
        medicalRiskCount,
      )} in Anstoss.`,
    )
  }

  if (checkInWindowOpen && !eventWindowClosed && yesCount > 0 && checkInCount < yesCount) {
    return createReadinessBriefing(
      'check_in_gap',
      { count: checkInCount, target: yesCount },
      `Check in arrivals: ${checkInCount}/${yesCount} confirmed players are marked present.`,
    )
  }

  if (status === 'READY') {
    if (pendingCount > 0 && availabilityRiskCount > 0) {
      return createReadinessBriefing(
        'ready_followups',
        { yes: yesCount, squad: squadSize, pending: pendingCount, risks: availabilityRiskCount },
        `Squad is ready: ${yesCount}/${squadSize} confirmed. Monitor ${pendingCount} pending ${pluralize(
          'reply',
          pendingCount,
        )} and ${availabilityRiskCount} availability ${pluralize('risk', availabilityRiskCount)}.`,
      )
    }

    if (pendingCount > 0) {
      return createReadinessBriefing(
        'ready_pending',
        { yes: yesCount, squad: squadSize, pending: pendingCount },
        `Squad is ready: ${yesCount}/${squadSize} confirmed. Monitor ${pendingCount} pending ${pluralize(
          'reply',
          pendingCount,
        )}.`,
      )
    }

    if (availabilityRiskCount > 0) {
      return createReadinessBriefing(
        'ready_availability',
        { yes: yesCount, squad: squadSize, risks: availabilityRiskCount },
        `Squad is ready: ${yesCount}/${squadSize} confirmed. Monitor ${availabilityRiskCount} availability ${pluralize(
          'risk',
          availabilityRiskCount,
        )}.`,
      )
    }

    return createReadinessBriefing(
      'ready_clear',
      { yes: yesCount, squad: squadSize },
      `Squad is ready: ${yesCount}/${squadSize} confirmed and no urgent blockers.`,
    )
  }

  if (pendingCount > 0) {
    if (nudge.recommended) {
      return createReadinessBriefing(
        'pending_nudge',
        { count: pendingCount },
        `Send an RSVP nudge to ${pendingCount} pending ${pluralize(
          'reply',
          pendingCount,
        )}, then review availability.`,
      )
    }

    return createReadinessBriefing(
      'pending_monitor',
      { count: pendingCount },
      `Monitor ${pendingCount} pending ${pluralize('reply', pendingCount)} before kickoff.`,
    )
  }

  if (availabilityRiskCount > 0) {
    return createReadinessBriefing(
      'availability_review',
      { count: availabilityRiskCount },
      `Review ${availabilityRiskCount} availability ${pluralize(
        'risk',
        availabilityRiskCount,
      )} before finalizing the plan.`,
    )
  }

  return createReadinessBriefing(
    'final_count',
    {},
    'Confirm the final player count before kickoff.',
  )
}

function buildNudgeRecommendation({
  event,
  status,
  pendingCount,
  responseRate,
  yesCount,
  targetConfirmed,
}: {
  event: EventReadinessRecord
  status: EventReadiness['status']
  pendingCount: number
  responseRate: number
  yesCount: number
  targetConfirmed: number
}): EventReadinessNudge {
  const now = Date.now()
  const eventTime = event.date.getTime()
  const targetCount = Math.max(0, pendingCount)

  if (targetCount === 0) {
    return { recommended: false, reason: 'none', targetCount: 0, urgency: 'low' }
  }

  if (eventTime <= now) {
    return {
      recommended: false,
      reason: 'event_started',
      targetCount,
      urgency: 'low',
    }
  }

  if (event.lastRsvpReminderAt) {
    const nextAvailableAt = event.lastRsvpReminderAt.getTime() + RSVP_REMINDER_COOLDOWN_MS
    if (nextAvailableAt > now) {
      return {
        recommended: false,
        reason: 'cooldown',
        targetCount,
        urgency: 'low',
        nextAvailableAt: new Date(nextAvailableAt).toISOString(),
      }
    }
  }

  const hoursToEvent = (eventTime - now) / (60 * 60 * 1000)
  const lowConfirmations = yesCount < targetConfirmed
  const lowResponseRate = responseRate < 0.8
  const shouldNudge =
    hoursToEvent <= 24
      ? targetCount > 0
      : hoursToEvent <= 72
        ? targetCount >= 3 || lowResponseRate || lowConfirmations
        : targetCount >= 5 || responseRate < 0.6

  if (!shouldNudge) {
    return {
      recommended: false,
      reason: 'none',
      targetCount,
      urgency: 'low',
    }
  }

  const reason = lowConfirmations
    ? 'low_confirmations'
    : lowResponseRate
      ? 'low_response_rate'
      : 'pending_replies'

  const urgency: EventReadinessNudge['urgency'] =
    hoursToEvent <= 24 || status === 'AT_RISK'
      ? 'high'
      : hoursToEvent <= 72 || targetCount >= 4
        ? 'medium'
        : 'low'

  return {
    recommended: true,
    reason,
    targetCount,
    urgency,
  }
}

function createReadinessBriefing(
  key: NonNullable<EventReadiness['briefing']>['key'],
  params: NonNullable<EventReadiness['briefing']>['params'],
  fallback: string,
): NonNullable<EventReadiness['briefing']> {
  return { key, params, fallback }
}

function getTargetConfirmedCount(type: EventTypeValue, squadSize: number): number {
  if (type === 'MATCH') return Math.min(11, squadSize)
  if (type === 'TRAINING') return Math.min(Math.max(6, Math.ceil(squadSize * 0.5)), squadSize)
  return Math.min(Math.max(4, Math.ceil(squadSize * 0.4)), squadSize)
}

function pluralize(noun: string, count: number): string {
  if (count !== 1 && noun.endsWith('y')) return `${noun.slice(0, -1)}ies`
  return count === 1 ? noun : `${noun}s`
}

function getReadinessStatus(
  score: number,
  signals: EventReadinessSignal[],
): EventReadiness['status'] {
  if (signals.some((signal) => signal.severity === 'critical') || score < 55) {
    return 'AT_RISK'
  }
  if (score < 80 || signals.some((signal) => signal.severity === 'warning')) {
    return 'WATCH'
  }
  return 'READY'
}

function selectVisibleSignals(
  signals: EventReadinessSignal[],
  limit: number,
): EventReadinessSignal[] {
  return [...signals]
    .sort((a, b) => {
      const severityDelta = getSeverityRank(b.severity) - getSeverityRank(a.severity)
      if (severityDelta !== 0) return severityDelta
      return getSignalRank(b.key) - getSignalRank(a.key)
    })
    .slice(0, limit)
}

function getSeverityRank(severity: EventReadinessSignal['severity']): number {
  if (severity === 'critical') return 3
  if (severity === 'warning') return 2
  return 1
}

function getSignalRank(key: EventReadinessSignal['key']): number {
  switch (key) {
    case 'no_show_risk':
      return 100
    case 'injury_risks':
      return 90
    case 'low_confirmations':
      return 80
    case 'low_response_rate':
      return 70
    case 'check_in_gap':
      return 60
    case 'pending_replies':
      return 50
    case 'availability_risks':
      return 40
    case 'no_squad':
      return 30
  }
}

function isInjuryReason(reason: string | null): boolean {
  if (!reason) return false
  return ['injury', 'injured', 'sick', 'INJURY', 'INJURED'].includes(reason)
}

function isSuspensionReason(reason: string | null): boolean {
  if (!reason) return false
  return ['suspended', 'suspension', 'SUSPENDED', 'SUSPENSION'].includes(reason)
}

function roundRate(value: number): number {
  return Math.round(value * 100) / 100
}

function parseDateBoundary(value: string, boundary: 'start' | 'end') {
  const germanMatch = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)

  let date: Date

  if (germanMatch) {
    const [, day, month, year] = germanMatch
    date = new Date(Number(year), Number(month) - 1, Number(day))
  } else if (isoMatch) {
    const [, year, month, day] = isoMatch
    date = new Date(Number(year), Number(month) - 1, Number(day))
  } else {
    date = new Date(value)
  }

  if (boundary === 'start') {
    date.setHours(0, 0, 0, 0)
  } else {
    date.setHours(23, 59, 59, 999)
  }

  return date
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? ''
}
