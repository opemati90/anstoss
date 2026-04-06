import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { EventFeedItem } from '@anstoss/shared'
import { rsvpStatusSchema } from '@anstoss/shared'

const RsvpStatus = rsvpStatusSchema.enum
import { TeamsService } from '../teams/teams.service'

type EventTypeValue = EventFeedItem['type']
type RsvpStatusValue = NonNullable<EventFeedItem['myRsvp']>
type UpcomingEventFilters = {
  type?: EventTypeValue
  dateFrom?: string
  dateTo?: string
  scope?: 'upcoming' | 'past'
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

const EVENT_ARCHIVE_RETENTION_DAYS = 30

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamsService: TeamsService,
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
      },
    })

    if (!event) {
      throw new NotFoundException('Event not found')
    }

    await this.teamsService.assertReadableAccess(userId, event.teamId)

    return event
  }

  async upsertRsvp(eventId: string, userId: string, status: RsvpStatusValue) {
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

    return this.prisma.rsvp.upsert({
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
  ) {
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
