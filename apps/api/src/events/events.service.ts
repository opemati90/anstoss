import { Injectable, NotFoundException, ForbiddenException, BadRequestException, HttpException } from '@nestjs/common'
import { TeamAccessStatus, type Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { EventFeedItem } from '@anstoss/shared'
import { rsvpStatusSchema } from '@anstoss/shared'

const RsvpStatus = rsvpStatusSchema.enum
import { TeamsService } from '../teams/teams.service'
import { ContributionsService } from '../contributions/contributions.service'
import { PushService } from '../push/push.service'

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
    select: { rsvps: true },
  },
  rsvps: {
    select: {
      userId: true,
      status: true,
    },
  },
} satisfies Prisma.EventInclude

type UpcomingEventRecord = Prisma.EventGetPayload<{
  include: typeof upcomingEventInclude
}>

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

    return events.map((event: UpcomingEventRecord) => ({
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
    }))
  }

  async findById(id: string, userId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        rsvps: {
          include: {
            user: {
              select: { id: true, name: true },
            },
          },
        },
        team: {
          select: { id: true, name: true },
        },
        reminderPreferences: {
          where: { userId },
          select: { id: true },
        },
      },
    })

    if (!event) {
      throw new NotFoundException('Event not found')
    }

    await this.teamsService.assertReadableAccess(userId, event.teamId)

    // Surface the requesting user's own RSVP status — without this the
    // mobile event-detail screen can't show "You said YES" after refresh
    // (the list endpoint returns myRsvp but findById did not, so a tap
    // on a list row threw away the status).
    const myRsvp =
      event.rsvps.find((rsvp) => rsvp.userId === userId)?.status ?? null

    return {
      ...event,
      myRsvp,
      reminderEnabled: (event.reminderPreferences?.length ?? 0) > 0,
      reminderPreferences: undefined,
    }
  }

  async upsertRsvp(
    eventId: string,
    userId: string,
    status: RsvpStatusValue,
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
      update: { status },
      create: {
        eventId,
        userId,
        status,
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

    return this.upsertRsvp(eventId, childUserId, status)
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
              where: { status: TeamAccessStatus.ACTIVE },
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

    // 24h rate limit
    const RATE_LIMIT_MS = 24 * 60 * 60 * 1000
    if (event.lastRsvpReminderAt) {
      const msUntilNext = event.lastRsvpReminderAt.getTime() + RATE_LIMIT_MS - Date.now()
      if (msUntilNext > 0) {
        const nextAvailableAt = new Date(event.lastRsvpReminderAt.getTime() + RATE_LIMIT_MS).toISOString()
        throw new HttpException({ message: 'Rate limit: reminder already sent', retryAfter: nextAvailableAt }, 429)
      }
    }

    // Find members with no RSVP for this event
    const existingRsvps = await this.prisma.rsvp.findMany({
      where: { eventId },
      select: { userId: true },
    })
    const respondedUserIds = new Set(existingRsvps.map((r: { userId: string }) => r.userId))
    const nonResponders = event.team.access
      .map((a: { user: { id: string } }) => a.user)
      .filter((u: { id: string }) => !respondedUserIds.has(u.id) && u.id !== requestingUserId)

    if (nonResponders.length === 0) {
      return { sent: 0, nextAvailableAt: new Date(Date.now() + RATE_LIMIT_MS).toISOString() }
    }

    // Send push notifications
    const day = new Intl.DateTimeFormat('en-DE', { weekday: 'long' }).format(new Date(event.date))
    const time = new Intl.DateTimeFormat('en-DE', { hour: '2-digit', minute: '2-digit' }).format(new Date(event.date))
    const title = event.title
    const body = `${day}, ${time} at ${event.location ?? 'TBD'} — have you replied yet?`
    const data = { type: 'event_rsvp_reminder', eventId, clubId, url: `anstoss:///event-detail?eventId=${eventId}` }

    await Promise.all(
      nonResponders.map((user: { id: string }) =>
        this.pushService.sendToUser(user.id, title, body, data, { clubId }).catch(() => {
          // Non-fatal: push failure should not abort the whole batch
        }),
      ),
    )

    // Update rate-limit timestamp
    await this.prisma.event.update({
      where: { id: eventId },
      data: { lastRsvpReminderAt: new Date() },
    })

    const nextAvailableAt = new Date(Date.now() + RATE_LIMIT_MS).toISOString()
    return { sent: nonResponders.length, nextAvailableAt }
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
