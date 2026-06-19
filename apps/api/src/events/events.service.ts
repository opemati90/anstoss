import { Injectable, NotFoundException, ForbiddenException, BadRequestException, HttpException } from '@nestjs/common'
import { TeamAccessStatus, TeamRole, type Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type {
  EventFeedItem,
  EventReadiness,
  EventReadinessNudge,
  EventReadinessSignal,
} from '@anstoss/shared'
import {
  buildClubPermissionMap,
  ClubCapability,
  rsvpStatusSchema,
  TeamAccessDeniedError,
} from '@anstoss/shared'

const RsvpStatus = rsvpStatusSchema.enum
import { TeamsService } from '../teams/teams.service'
import { ContributionsService } from '../contributions/contributions.service'
import { PushService } from '../push/push.service'

const RSVP_REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000

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
    },
  },
  team: {
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          access: {
            where: {
              status: TeamAccessStatus.ACTIVE,
              role: TeamRole.PLAYER,
            },
          },
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
    },
  },
  team: {
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          access: {
            where: {
              status: TeamAccessStatus.ACTIVE,
              role: TeamRole.PLAYER,
            },
          },
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

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamsService: TeamsService,
    private readonly contributionsService: ContributionsService,
    private readonly pushService: PushService,
  ) {}

  async create(data: {
    title: string
    type: EventTypeValue
    date: Date
    location?: string
    notes?: string
    teamId: string
    createdById: string
  }) {
    const access = await this.teamsService.assertEventManagementAccess(
      data.createdById,
      data.teamId,
    )

    return this.prisma.event.create({
      data: {
        title: data.title,
        type: data.type,
        date: data.date,
        location: data.location,
        notes: data.notes,
        teamId: data.teamId,
        createdById: data.createdById,
        clubId: access.team.clubId,
      },
    })
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
    await this.teamsService.assertReadableAccess(userId, teamId)
    await this.archiveExpiredEvents(teamId)
    const includeReadiness = await this.canViewReadiness(userId, teamId)

    const scope = filters?.scope ?? 'upcoming'
    const now = new Date()
    const dateFilter: Record<string, Date> =
      scope === 'past'
        ? { lt: now }
        : { gte: now }

    if (filters?.dateFrom) {
      dateFilter.gte = parseDateBoundary(filters.dateFrom, 'start')
    }

    if (filters?.dateTo) {
      dateFilter.lte = parseDateBoundary(filters.dateTo, 'end')
    }

    const where: Prisma.EventWhereInput = {
      teamId,
      date: dateFilter,
      cancelledAt: null,
      archivedAt: null,
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
          where: { userId, teamId, status: TeamAccessStatus.ACTIVE },
          select: { id: true },
        }),
        this.prisma.guardianRelationship.findMany({
          where: {
            parentUserId: userId,
            playerUserId: { not: null },
            player: {
              teamAccess: {
                some: { teamId, status: TeamAccessStatus.ACTIVE },
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

    const events = await this.prisma.event.findMany({
      where,
      include: upcomingEventInclude,
      orderBy: { date: scope === 'past' ? 'desc' : 'asc' },
      ...(filters?.limit ? { take: filters.limit } : {}),
    })

    return events.map((event: UpcomingEventRecord) =>
      this.mapEventRecord(event, userId, includeReadiness),
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
      where: { userId, clubId, status: TeamAccessStatus.ACTIVE },
      select: { teamId: true },
    })
    const userTeamIds = userTeamRows.map((r: { teamId: string }) => r.teamId)

    if (userTeamIds.length === 0) {
      return []
    }

    // Archive expired events across all user teams in parallel
    await Promise.all(userTeamIds.map((tid: string) => this.archiveExpiredEvents(tid)))

    const scope = filters?.scope ?? 'upcoming'
    const now = new Date()
    const dateFilter: Record<string, Date> =
      scope === 'past'
        ? { lt: now }
        : { gte: now }

    if (filters?.dateFrom) {
      dateFilter.gte = parseDateBoundary(filters.dateFrom, 'start')
    }
    if (filters?.dateTo) {
      dateFilter.lte = parseDateBoundary(filters.dateTo, 'end')
    }

    const where: Prisma.EventWhereInput = {
      clubId,
      teamId: { in: userTeamIds },
      date: dateFilter,
      cancelledAt: null,
      archivedAt: null,
    }

    if (filters?.type) {
      where.type = filters.type
    }

    const limit = filters?.limit ?? 4
    const events = await this.prisma.event.findMany({
      where,
      include: upcomingEventIncludeWithTeam,
      orderBy: { date: scope === 'past' ? 'desc' : 'asc' },
      take: limit,
    })

    const readinessTeamIds = await this.getReadinessTeamIds(userId, userTeamIds)

    return events.map((event: UpcomingEventRecordWithTeam) => ({
      ...this.mapEventRecord(event, userId, readinessTeamIds.has(event.teamId)),
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
    const dateFilter: Record<string, Date> =
      scope === 'past'
        ? { lt: now }
        : { gte: now }

    if (filters?.dateFrom) {
      dateFilter.gte = parseDateBoundary(filters.dateFrom, 'start')
    }
    if (filters?.dateTo) {
      dateFilter.lte = parseDateBoundary(filters.dateTo, 'end')
    }

    const where: Prisma.EventWhereInput = {
      clubId,
      date: dateFilter,
      cancelledAt: null,
      archivedAt: null,
    }

    if (filters?.type) {
      where.type = filters.type
    }

    const events = await this.prisma.event.findMany({
      where,
      include: upcomingEventIncludeWithTeam,
      orderBy: { date: scope === 'past' ? 'desc' : 'asc' },
      take: filters?.limit ?? 4,
    })

    return events.map((event: UpcomingEventRecordWithTeam) => ({
      ...this.mapEventRecord(event, userId, true),
      team: event.team ? { id: event.team.id, name: event.team.name } : null,
    }))
  }

  /**
   * Shared mapper from Prisma event record → EventFeedItem shape.
   */
  private mapEventRecord(
    event: UpcomingEventRecord | UpcomingEventRecordWithTeam,
    userId: string,
    includeReadiness = false,
  ): EventFeedItem {
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
      responseCount: event._count.rsvps,
      yesCount: event.rsvps.filter((rsvp) => rsvp.status === RsvpStatus.YES).length,
      maybeCount: event.rsvps.filter((rsvp) => rsvp.status === RsvpStatus.MAYBE).length,
      noCount: event.rsvps.filter((rsvp) => rsvp.status === RsvpStatus.NO).length,
      myRsvp:
        event.rsvps.find(
          (rsvp: typeof event.rsvps[number]) => rsvp.userId === userId,
        )?.status ?? null,
    }

    if (includeReadiness) {
      item.readiness = buildEventReadiness(event)
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
    return new Set(decisions.filter((decision) => decision.canView).map((decision) => decision.teamId))
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

  async findById(clubId: string, id: string, userId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id, clubId },
      include: {
        _count: {
          select: { rsvps: true, checkIns: true },
        },
        rsvps: {
          include: {
            user: {
              select: { id: true, name: true },
            },
          },
        },
        team: {
          select: {
            id: true,
            name: true,
            _count: {
              select: {
                access: {
                  where: {
                    status: TeamAccessStatus.ACTIVE,
                    role: TeamRole.PLAYER,
                  },
                },
              },
            },
          },
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

    await this.teamsService.assertReadableAccess(userId, event.teamId)
    const includeReadiness = await this.canViewReadiness(userId, event.teamId)

    const myRsvp =
      event.rsvps.find((rsvp) => rsvp.userId === userId)?.status ?? null

    const myCheckInAt = event.checkIns[0]?.checkedInAt?.toISOString() ?? null
    const teamMemberCount = includeReadiness
      ? event.team?._count?.access ?? null
      : undefined

    return {
      ...event,
      team: event.team ? { id: event.team.id, name: event.team.name } : null,
      myRsvp,
      myCheckInAt,
      checkIns: undefined,
      _count: undefined,
      reminderEnabled: (event.reminderPreferences?.length ?? 0) > 0,
      reminderPreferences: undefined,
      teamMemberCount,
      readiness: includeReadiness ? buildEventReadiness(event) : undefined,
    }
  }

  async upsertRsvp(
    eventId: string,
    userId: string,
    status: RsvpStatusValue,
    reason?: string,
  ): Promise<{ eventId: string; userId: string; status: string }> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    })

    if (!event) {
      throw new NotFoundException('Event not found')
    }

    await this.teamsService.assertReadableAccess(userId, event.teamId)

    if (event.cancelledAt) {
      throw new BadRequestException('Cannot RSVP to a cancelled event')
    }

    // Parent auto-proxy: if the caller is a parent (not a player on
    // this team) and has a guardian relationship to a child who IS on
    // the team, RSVP on behalf of the child instead of for themselves.
    // Avoids the parent flow needing to thread childUserId through the
    // mobile call stack; the API resolves the right person to RSVP for.
    // Multi-child households on the same team get the first match —
    // they need to use rsvp-proxy directly with childUserId for fine
    // control.
    const callerOnTeam = await this.prisma.teamAccess.findFirst({
      where: { userId, teamId: event.teamId, status: 'ACTIVE' },
      select: { id: true },
    })
    if (!callerOnTeam) {
      const guardianMatch = await this.prisma.guardianRelationship.findFirst({
        where: {
          parentUserId: userId,
          playerUserId: { not: null },
          player: {
            teamAccess: { some: { teamId: event.teamId, status: 'ACTIVE' } },
          },
        },
        select: { playerUserId: true },
      })
      if (guardianMatch?.playerUserId) {
        return this.upsertRsvpProxy(
          eventId,
          userId,
          guardianMatch.playerUserId,
          status,
          reason,
        )
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

    const rsvp = await this.prisma.rsvp.upsert({
      where: {
        eventId_userId: { eventId, userId },
      },
      update: { status, reason: status === 'NO' ? (reason ?? null) : null },
      create: {
        eventId,
        userId,
        status,
        reason: status === 'NO' ? (reason ?? null) : null,
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

    return rsvp
  }

  async toggleReminder(eventId: string, userId: string, enabled: boolean) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    })

    if (!event) {
      throw new NotFoundException('Event not found')
    }

    await this.teamsService.assertReadableAccess(userId, event.teamId)

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

    return this.upsertRsvp(eventId, childUserId, status, reason)
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
      yes: counts.find((c: typeof counts[number]) => c.status === RsvpStatus.YES)?._count.status || 0,
      maybe: counts.find((c: typeof counts[number]) => c.status === RsvpStatus.MAYBE)?._count.status || 0,
      no: counts.find((c: typeof counts[number]) => c.status === RsvpStatus.NO)?._count.status || 0,
    }
  }

  async update(
    eventId: string,
    userId: string,
    data: {
      title?: string
      type?: EventTypeValue
      date?: Date
      location?: string
      notes?: string
    },
  ) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    })

    if (!event) {
      throw new NotFoundException('Event not found')
    }

    if (event.createdById !== userId) {
      throw new ForbiddenException('Only the event creator can update this event')
    }

    if (event.cancelledAt) {
      throw new BadRequestException('Cannot update a cancelled event')
    }

    await this.archiveExpiredEvents(event.teamId)

    return this.prisma.event.update({
      where: { id: eventId },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.date !== undefined && { date: data.date }),
        ...(data.location !== undefined && { location: data.location }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
    })
  }

  async cancel(eventId: string, userId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    })

    if (!event) {
      throw new NotFoundException('Event not found')
    }

    if (event.createdById !== userId) {
      throw new ForbiddenException('Only the event creator can cancel this event')
    }

    if (event.cancelledAt) {
      throw new BadRequestException('Event is already cancelled')
    }

    await this.archiveExpiredEvents(event.teamId)

    // Soft-delete: mark as cancelled rather than hard delete
    return this.prisma.event.update({
      where: { id: eventId },
      data: { cancelledAt: new Date() },
    })
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
              where: {
                status: TeamAccessStatus.ACTIVE,
                role: TeamRole.PLAYER,
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
    const nonResponders = event.team.access
      .filter((a: { role?: string }) => !a.role || a.role === TeamRole.PLAYER)
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
      return { sent: 0, nextAvailableAt: new Date(Date.now() + RSVP_REMINDER_COOLDOWN_MS).toISOString() }
    }

    // Bug 1 fix: atomic rate-limit claim — only one concurrent caller gets count === 1
    const cutoff = new Date(Date.now() - RSVP_REMINDER_COOLDOWN_MS)
    const claim = await this.prisma.event.updateMany({
      where: {
        id: eventId,
        clubId,
        OR: [
          { lastRsvpReminderAt: null },
          { lastRsvpReminderAt: { lt: cutoff } },
        ],
      },
      data: { lastRsvpReminderAt: new Date() },
    })
    if (claim.count === 0) {
      // Someone beat us or rate limit is still active — re-read to get retryAfter
      const fresh = await this.prisma.event.findUnique({ where: { id: eventId }, select: { lastRsvpReminderAt: true } })
      const nextAvailableAt = new Date((fresh?.lastRsvpReminderAt?.getTime() ?? Date.now()) + RSVP_REMINDER_COOLDOWN_MS).toISOString()
      throw new HttpException({ message: 'Rate limit: reminder already sent', retryAfter: nextAvailableAt }, 429)
    }

    // Bug 4 fix: use de-DE locale and Berlin timezone so weekday/time are correct for German clubs
    const day = new Intl.DateTimeFormat('de-DE', { weekday: 'long', timeZone: 'Europe/Berlin' }).format(new Date(event.date))
    const time = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }).format(new Date(event.date))
    const title = event.title
    const body = `${day}, ${time} at ${event.location ?? 'TBD'} — have you replied yet?`
    const data = { type: 'event_rsvp_reminder', eventId, clubId, url: `anstoss:///event-detail?eventId=${eventId}` }

    const deliveryResults = await Promise.all(
      uniqueNonResponders.map(async (user: { id: string }) => {
        try {
          await this.pushService.sendToUser(user.id, title, body, data, { clubId })
          return true
        } catch {
          return false
        }
      }),
    )
    const sent = deliveryResults.filter(Boolean).length

    if (sent === 0) {
      await this.prisma.event.updateMany({
        where: { id: eventId, clubId },
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
  async checkIn(
    clubId: string,
    eventId: string,
    userId: string,
  ): Promise<{ checkedInAt: string }> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId, clubId },
    })
    if (!event) throw new NotFoundException('Event not found')
    if (event.cancelledAt) throw new BadRequestException('Event is cancelled')

    // Must be a member of the event's team (players, coaches, guardians)
    await this.teamsService.assertReadableAccess(userId, event.teamId)

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

function buildEventReadiness(
  event: EventReadinessRecord,
): EventReadiness {
  const squadSize = event.team?._count?.access ?? 0
  const responseCount = event._count.rsvps ?? event.rsvps.length
  const yesCount = event.rsvps.filter((rsvp) => rsvp.status === RsvpStatus.YES).length
  const maybeCount = event.rsvps.filter((rsvp) => rsvp.status === RsvpStatus.MAYBE).length
  const noCount = event.rsvps.filter((rsvp) => rsvp.status === RsvpStatus.NO).length
  const pendingCount = Math.max(0, squadSize - responseCount)
  const checkInCount = event._count.checkIns ?? 0
  const injuryRiskCount = event.rsvps.filter((rsvp) =>
    rsvp.status === RsvpStatus.NO && isInjuryReason(rsvp.reason ?? null),
  ).length
  const suspensionRiskCount = event.rsvps.filter((rsvp) =>
    rsvp.status === RsvpStatus.NO && isSuspensionReason(rsvp.reason ?? null),
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

  const responseRate = responseCount / squadSize
  const confirmedRate = yesCount / squadSize
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
        )} and ${availabilityRiskCount} availability ${pluralize(
          'risk',
          availabilityRiskCount,
        )}.`,
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
  return ['injury', 'injured', 'INJURY', 'INJURED'].includes(reason)
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
