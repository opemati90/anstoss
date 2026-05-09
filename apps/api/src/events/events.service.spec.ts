import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common'
import { EventsService } from './events.service'

describe('EventsService', () => {
  let service: EventsService
  let mockPrisma: any
  let mockTeamsService: any

  beforeEach(() => {
    mockPrisma = {
      event: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      rsvp: {
        upsert: jest.fn(),
        groupBy: jest.fn(),
      },
      teamAccess: {
        // Default: caller IS on the team — short-circuits the parent
        // auto-proxy branch in upsertRsvp.
        findFirst: jest.fn().mockResolvedValue({ id: 'access-1' }),
      },
      guardianRelationship: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      eventReminderPreference: {
        upsert: jest.fn(),
      },
    }
    mockTeamsService = {
      assertEventManagementAccess: jest.fn().mockResolvedValue({
        team: { clubId: 'club-1' },
        membership: { role: 'OWNER' },
        activeTeamAccess: [],
      }),
      assertManageAccess: jest.fn().mockResolvedValue({
        team: { clubId: 'club-1' },
        membership: { role: 'OWNER' },
        activeTeamAccess: [],
      }),
      assertReadableAccess: jest.fn().mockResolvedValue({
        membership: { role: 'OWNER' },
        activeTeamAccess: [],
      }),
    }
    const mockContributionsService = {
      // Default: no overdue contributions — RSVP YES is allowed.
      getOverdueContributionsForUser: jest.fn().mockResolvedValue([]),
    }
    service = new EventsService(
      mockPrisma,
      mockTeamsService,
      mockContributionsService as never,
    )
  })

  describe('create', () => {
    it('creates an event with provided data', async () => {
      const data = {
        title: 'Training Session',
        type: 'TRAINING' as const,
        date: new Date('2027-01-01'),
        location: 'Stadium',
        notes: 'Bring boots',
        teamId: 'team-1',
        createdById: 'user-1',
      }
      mockPrisma.event.create.mockResolvedValue({ id: 'evt-1', ...data, clubId: 'club-1' })

      const result = await service.create(data)

      expect(mockTeamsService.assertEventManagementAccess).toHaveBeenCalledWith(
        'user-1',
        'team-1',
      )
      expect(mockPrisma.event.create).toHaveBeenCalledWith({
        data: {
          title: 'Training Session',
          type: 'TRAINING',
          date: data.date,
          location: 'Stadium',
          notes: 'Bring boots',
          teamId: 'team-1',
          createdById: 'user-1',
          clubId: 'club-1',
        },
      })
      expect(result.id).toBe('evt-1')
    })
  })

  describe('listUpcoming', () => {
    it('returns upcoming non-cancelled events ordered by date', async () => {
      const eventDate = new Date('2027-01-01')
      mockPrisma.event.findMany.mockResolvedValue([
        {
          id: 'evt-1',
          teamId: 'team-1',
          clubId: 'club-1',
          title: 'Training',
          type: 'TRAINING',
          date: eventDate,
          location: null,
          notes: null,
          createdById: 'user-1',
          createdAt: eventDate,
          archivedAt: null,
          _count: { rsvps: 3 },
          rsvps: [
            { userId: 'user-1', status: 'YES' },
            { userId: 'user-2', status: 'MAYBE' },
            { userId: 'user-3', status: 'NO' },
          ],
        },
      ])

      const result = await service.listUpcoming('team-1', 'user-1')

      expect(mockTeamsService.assertReadableAccess).toHaveBeenCalledWith('user-1', 'team-1')
      expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            teamId: 'team-1',
            cancelledAt: null,
            archivedAt: null,
          }),
          orderBy: { date: 'asc' },
        }),
      )
      expect(mockPrisma.event.updateMany).toHaveBeenCalled()
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual(
        expect.objectContaining({
          responseCount: 3,
          yesCount: 1,
          maybeCount: 1,
          noCount: 1,
          myRsvp: 'YES',
        }),
      )
    })
  })

  describe('findById', () => {
    it('returns the event with rsvps and team when found', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({
        id: 'evt-1',
        teamId: 'team-1',
        rsvps: [],
        team: { id: 'team-1', name: 'A-Team' },
      })

      const result = await service.findById('evt-1', 'user-1')

      expect(mockTeamsService.assertReadableAccess).toHaveBeenCalledWith('user-1', 'team-1')
      expect(result.id).toBe('evt-1')
    })

    it('throws NotFoundException when event does not exist', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null)

      await expect(service.findById('missing', 'user-1')).rejects.toThrow(NotFoundException)
    })
  })

  describe('upsertRsvp', () => {
    it('throws NotFoundException when event does not exist', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null)

      await expect(service.upsertRsvp('missing', 'user-1', 'YES')).rejects.toThrow(
        NotFoundException,
      )
    })

    it('throws BadRequestException when event is cancelled', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({
        id: 'evt-1',
        teamId: 'team-1',
        cancelledAt: new Date(),
      })

      await expect(service.upsertRsvp('evt-1', 'user-1', 'YES')).rejects.toThrow(
        BadRequestException,
      )
    })

    it('creates a new RSVP for first-time response', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({
        id: 'evt-1',
        teamId: 'team-1',
        cancelledAt: null,
      })
      mockPrisma.rsvp.upsert.mockResolvedValue({ eventId: 'evt-1', userId: 'user-1', status: 'YES' })

      const result = await service.upsertRsvp('evt-1', 'user-1', 'YES')

      expect(mockTeamsService.assertReadableAccess).toHaveBeenCalledWith('user-1', 'team-1')
      expect(mockPrisma.rsvp.upsert).toHaveBeenCalledWith({
        where: { eventId_userId: { eventId: 'evt-1', userId: 'user-1' } },
        update: { status: 'YES' },
        create: { eventId: 'evt-1', userId: 'user-1', status: 'YES' },
      })
      expect(result.status).toBe('YES')
    })
  })

  describe('getRsvpSummary', () => {
    it('returns counts for yes, maybe, no', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({
        id: 'evt-1',
        teamId: 'team-1',
      })
      mockPrisma.rsvp.groupBy.mockResolvedValue([
        { status: 'YES', _count: { status: 5 } },
        { status: 'NO', _count: { status: 2 } },
      ])

      const result = await service.getRsvpSummary('evt-1', 'user-1')

      expect(mockTeamsService.assertReadableAccess).toHaveBeenCalledWith('user-1', 'team-1')
      expect(result).toEqual({ yes: 5, maybe: 0, no: 2 })
    })

    it('returns all zeros when no RSVPs exist', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({
        id: 'evt-1',
        teamId: 'team-1',
      })
      mockPrisma.rsvp.groupBy.mockResolvedValue([])

      const result = await service.getRsvpSummary('evt-1', 'user-1')

      expect(result).toEqual({ yes: 0, maybe: 0, no: 0 })
    })

    it('throws NotFoundException when event does not exist', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null)

      await expect(service.getRsvpSummary('missing', 'user-1')).rejects.toThrow(
        NotFoundException,
      )
    })
  })

  describe('update', () => {
    const baseEvent = {
      id: 'evt-1',
      createdById: 'user-1',
      cancelledAt: null,
    }

    it('throws NotFoundException when event does not exist', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null)

      await expect(service.update('missing', 'user-1', { title: 'New' })).rejects.toThrow(
        NotFoundException,
      )
    })

    it('throws ForbiddenException when user is not the creator', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(baseEvent)

      await expect(service.update('evt-1', 'other-user', { title: 'New' })).rejects.toThrow(
        ForbiddenException,
      )
    })

    it('throws BadRequestException when event is cancelled', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({
        ...baseEvent,
        cancelledAt: new Date(),
      })

      await expect(service.update('evt-1', 'user-1', { title: 'New' })).rejects.toThrow(
        BadRequestException,
      )
    })

    it('updates only provided fields', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(baseEvent)
      mockPrisma.event.update.mockResolvedValue({ ...baseEvent, title: 'Updated' })

      await service.update('evt-1', 'user-1', { title: 'Updated' })

      expect(mockPrisma.event.update).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: { title: 'Updated' },
      })
    })

    it('updates multiple fields at once', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(baseEvent)
      mockPrisma.event.update.mockResolvedValue(baseEvent)

      await service.update('evt-1', 'user-1', {
        title: 'New Title',
        location: 'New Location',
      })

      expect(mockPrisma.event.update).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: { title: 'New Title', location: 'New Location' },
      })
    })
  })

  describe('cancel', () => {
    const baseEvent = {
      id: 'evt-1',
      createdById: 'user-1',
      cancelledAt: null,
    }

    it('throws NotFoundException when event does not exist', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null)

      await expect(service.cancel('missing', 'user-1')).rejects.toThrow(NotFoundException)
    })

    it('throws ForbiddenException when user is not the creator', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(baseEvent)

      await expect(service.cancel('evt-1', 'other-user')).rejects.toThrow(ForbiddenException)
    })

    it('throws BadRequestException when event is already cancelled', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({
        ...baseEvent,
        cancelledAt: new Date(),
      })

      await expect(service.cancel('evt-1', 'user-1')).rejects.toThrow(BadRequestException)
    })

    it('soft-deletes by setting cancelledAt', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(baseEvent)
      mockPrisma.event.update.mockResolvedValue({
        ...baseEvent,
        cancelledAt: new Date(),
      })

      const result = await service.cancel('evt-1', 'user-1')

      expect(mockPrisma.event.update).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: { cancelledAt: expect.any(Date) },
      })
      expect(result.cancelledAt).toBeTruthy()
    })
  })

  describe('listUpcoming – Sprint 2 filters', () => {
    it('passes type filter to prisma where clause', async () => {
      mockPrisma.event.findMany.mockResolvedValue([])

      await service.listUpcoming('team-1', 'user-1', { type: 'MATCH' })

      expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: 'MATCH' }),
        }),
      )
    })

    it('applies dateFrom and dateTo to date filter', async () => {
      mockPrisma.event.findMany.mockResolvedValue([])

      await service.listUpcoming('team-1', 'user-1', {
        dateFrom: '01.01.2026',
        dateTo: '30.06.2026',
      })

      const call = mockPrisma.event.findMany.mock.calls[0][0]
      const gte = call.where.date.gte as Date
      const lte = call.where.date.lte as Date

      expect(gte.getFullYear()).toBe(2026)
      expect(gte.getMonth()).toBe(0)
      expect(gte.getDate()).toBe(1)
      expect(gte.getHours()).toBe(0)
      expect(gte.getMinutes()).toBe(0)

      expect(lte.getFullYear()).toBe(2026)
      expect(lte.getMonth()).toBe(5)
      expect(lte.getDate()).toBe(30)
      expect(lte.getHours()).toBe(23)
      expect(lte.getMinutes()).toBe(59)
    })

    it('omits type from where when not provided', async () => {
      mockPrisma.event.findMany.mockResolvedValue([])

      await service.listUpcoming('team-1', 'user-1', {})

      const call = mockPrisma.event.findMany.mock.calls[0][0]
      expect(call.where.type).toBeUndefined()
    })

    it('defaults date to gte now when type provided but no date filters', async () => {
      mockPrisma.event.findMany.mockResolvedValue([])

      const before = new Date()
      await service.listUpcoming('team-1', 'user-1', { type: 'TRAINING' })
      const after = new Date()

      const call = mockPrisma.event.findMany.mock.calls[0][0]
      expect(call.where.type).toBe('TRAINING')
      const gte = call.where.date.gte as Date
      expect(gte.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(gte.getTime()).toBeLessThanOrEqual(after.getTime())
      expect(call.where.date.lte).toBeUndefined()
    })

    it('uses descending order and limit for past events', async () => {
      mockPrisma.event.findMany.mockResolvedValue([])

      await service.listUpcoming('team-1', 'user-1', {
        scope: 'past',
        limit: 5,
      })

      expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { date: 'desc' },
          take: 5,
          where: expect.objectContaining({
            date: expect.objectContaining({
              lt: expect.any(Date),
            }),
          }),
        }),
      )
    })
  })
})
