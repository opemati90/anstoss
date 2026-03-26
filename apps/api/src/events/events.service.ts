import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { EventFeedItem } from '@anstoss/shared'
import { TeamsService } from '../teams/teams.service'

type EventTypeValue = EventFeedItem['type']
type RsvpStatusValue = NonNullable<EventFeedItem['myRsvp']>
type UpcomingEventFilters = {
  type?: EventTypeValue
  dateFrom?: string
  dateTo?: string
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
    const access = await this.teamsService.assertManageAccess(
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

    const dateFilter: Record<string, Date> = { gte: new Date() }
    if (filters?.dateFrom) dateFilter.gte = new Date(filters.dateFrom)
    if (filters?.dateTo) dateFilter.lte = new Date(filters.dateTo)

    const where: Prisma.EventWhereInput = {
      teamId,
      date: dateFilter,
      cancelledAt: null,
    }

    if (filters?.type) {
      where.type = filters.type
    }

    const events = await this.prisma.event.findMany({
      where,
      include: upcomingEventInclude,
      orderBy: { date: 'asc' },
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
      responseCount: event._count.rsvps,
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
      yes: counts.find((c: typeof counts[number]) => c.status === 'YES')?._count.status || 0,
      maybe: counts.find((c: typeof counts[number]) => c.status === 'MAYBE')?._count.status || 0,
      no: counts.find((c: typeof counts[number]) => c.status === 'NO')?._count.status || 0,
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

    // Soft-delete: mark as cancelled rather than hard delete
    return this.prisma.event.update({
      where: { id: eventId },
      data: { cancelledAt: new Date() },
    })
  }
}
