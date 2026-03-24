import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { EventFeedItem } from '@anstoss/shared'
import { TeamsService } from '../teams/teams.service'

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamsService: TeamsService,
  ) {}

  async create(data: {
    title: string
    type: string
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
        type: data.type as any,
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
  async listUpcoming(teamId: string, userId: string): Promise<EventFeedItem[]> {
    await this.teamsService.assertReadableAccess(userId, teamId)

    const events = await this.prisma.event.findMany({
      where: {
        teamId,
        date: { gte: new Date() },
      },
      include: {
        _count: {
          select: { rsvps: true },
        },
        rsvps: {
          select: {
            userId: true,
            status: true,
          },
        },
      },
      orderBy: { date: 'asc' },
    })

    return events.map((event: typeof events[number]) => ({
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

  async upsertRsvp(eventId: string, userId: string, status: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    })

    if (!event) {
      throw new NotFoundException('Event not found')
    }

    await this.teamsService.assertReadableAccess(userId, event.teamId)

    return this.prisma.rsvp.upsert({
      where: {
        eventId_userId: { eventId, userId },
      },
      update: { status: status as any },
      create: {
        eventId,
        userId,
        status: status as any,
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
}
