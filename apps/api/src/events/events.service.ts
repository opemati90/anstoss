import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    title: string
    type: string
    date: Date
    location?: string
    notes?: string
    teamId: string
    createdById: string
  }) {
    return this.prisma.event.create({
      data: {
        title: data.title,
        type: data.type as any,
        date: data.date,
        location: data.location,
        notes: data.notes,
        teamId: data.teamId,
        createdById: data.createdById,
        clubId: '', // overwritten by tenant middleware
      },
    })
  }

  /**
   * List upcoming events for a team with RSVP counts.
   * Uses _count aggregation — no N+1.
   */
  async listUpcoming(teamId: string) {
    return this.prisma.event.findMany({
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
  }

  async findById(id: string) {
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

    return event
  }

  async upsertRsvp(eventId: string, userId: string, status: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    })

    if (!event) {
      throw new NotFoundException('Event not found')
    }

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

  async getRsvpSummary(eventId: string) {
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
