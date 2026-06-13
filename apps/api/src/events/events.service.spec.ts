import { NotFoundException, ForbiddenException, BadRequestException, HttpException } from '@nestjs/common'
import { EventsService } from './events.service'

describe('EventsService', () => {
  let service: EventsService
  let mockPrisma: any
  let mockTeamsService: any
  let mockPushService: any

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
        findMany: jest.fn().mockResolvedValue([]),
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
    mockPushService = {
      sendToUser: jest.fn().mockResolvedValue(undefined),
    }
    const mockContributionsService = {
      // Default: no overdue contributions — RSVP YES is allowed.
      getOverdueContributionsForUser: jest.fn().mockResolvedValue([]),
    }
    service = new EventsService(
      mockPrisma,
      mockTeamsService,
      mockContributionsService as never,
      mockPushService as never,
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
        checkIns: [],
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
        update: { status: 'YES', reason: null },
        create: { eventId: 'evt-1', userId: 'user-1', status: 'YES', reason: null },
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

  describe('remindRsvp', () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 1 week from now

    const baseEvent = {
      id: 'evt-1',
      clubId: 'club-1',
      teamId: 'team-1',
      title: 'Training',
      date: futureDate,
      location: 'Stadium',
      cancelledAt: null,
      lastRsvpReminderAt: null,
      team: {
        access: [
          { user: { id: 'user-2' } },
          { user: { id: 'user-3' } },
        ],
      },
    }

    it('sends reminders to non-responders and returns sent count', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(baseEvent)
      mockPrisma.rsvp.findMany.mockResolvedValue([]) // no RSVPs yet
      mockPrisma.event.updateMany.mockResolvedValue({ count: 1 }) // atomic claim succeeds

      const result = await service.remindRsvp('club-1', 'evt-1', 'user-1')

      expect(mockPushService.sendToUser).toHaveBeenCalledTimes(2)
      expect(mockPushService.sendToUser).toHaveBeenCalledWith(
        'user-2',
        'Training',
        expect.any(String),
        expect.objectContaining({ type: 'event_rsvp_reminder', eventId: 'evt-1', clubId: 'club-1' }),
        { clubId: 'club-1' },
      )
      expect(result.sent).toBe(2)
      expect(result.nextAvailableAt).toBeTruthy()
      expect(new Date(result.nextAvailableAt).getTime()).toBeGreaterThan(Date.now())
    })

    it('excludes already-RSVPed members from reminders', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(baseEvent)
      mockPrisma.rsvp.findMany.mockResolvedValue([{ userId: 'user-2' }]) // user-2 already RSVPed
      mockPrisma.event.updateMany.mockResolvedValue({ count: 1 }) // atomic claim succeeds

      const result = await service.remindRsvp('club-1', 'evt-1', 'user-1')

      expect(mockPushService.sendToUser).toHaveBeenCalledTimes(1)
      expect(mockPushService.sendToUser).toHaveBeenCalledWith('user-3', expect.any(String), expect.any(String), expect.any(Object), expect.any(Object))
      expect(result.sent).toBe(1)
    })

    it('returns sent: 0 when all members have RSVPed', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(baseEvent)
      mockPrisma.rsvp.findMany.mockResolvedValue([
        { userId: 'user-2' },
        { userId: 'user-3' },
      ])

      const result = await service.remindRsvp('club-1', 'evt-1', 'user-1')

      expect(mockPushService.sendToUser).not.toHaveBeenCalled()
      expect(result.sent).toBe(0)
      expect(result.nextAvailableAt).toBeTruthy()
    })

    it('throws 429 with retryAfter when called within 24h of last reminder', async () => {
      const recentReminder = new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago
      mockPrisma.event.findUnique
        .mockResolvedValueOnce({
          ...baseEvent,
          lastRsvpReminderAt: recentReminder,
        })
        // second findUnique is the fresh re-read after atomic claim fails
        .mockResolvedValueOnce({ lastRsvpReminderAt: recentReminder })
      mockPrisma.rsvp.findMany.mockResolvedValue([]) // non-empty so we reach the claim
      // Atomic claim fails — someone already holds the rate-limit slot
      mockPrisma.event.updateMany.mockResolvedValue({ count: 0 })

      await expect(service.remindRsvp('club-1', 'evt-1', 'user-1')).rejects.toThrow(HttpException)

      // Reset mocks and re-run to inspect error body
      mockPrisma.event.findUnique
        .mockResolvedValueOnce({
          ...baseEvent,
          lastRsvpReminderAt: recentReminder,
        })
        .mockResolvedValueOnce({ lastRsvpReminderAt: recentReminder })
      mockPrisma.rsvp.findMany.mockResolvedValue([])
      mockPrisma.event.updateMany.mockResolvedValue({ count: 0 })

      try {
        await service.remindRsvp('club-1', 'evt-1', 'user-1')
      } catch (err: any) {
        expect(err.getStatus()).toBe(429)
        expect(err.getResponse()).toMatchObject({
          message: 'Rate limit: reminder already sent',
          retryAfter: expect.any(String),
        })
        // retryAfter should be ~23h from now
        const retryAfterMs = new Date(err.getResponse().retryAfter).getTime()
        expect(retryAfterMs).toBeGreaterThan(Date.now())
      }
    })

    it('throws BadRequestException when event is in the past', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({
        ...baseEvent,
        date: new Date(Date.now() - 24 * 60 * 60 * 1000), // yesterday
      })

      await expect(service.remindRsvp('club-1', 'evt-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      )
    })

    it('throws BadRequestException when event is cancelled', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({
        ...baseEvent,
        cancelledAt: new Date(),
      })

      await expect(service.remindRsvp('club-1', 'evt-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      )
    })

    it('throws NotFoundException when event does not exist', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null)

      await expect(service.remindRsvp('club-1', 'missing', 'user-1')).rejects.toThrow(
        NotFoundException,
      )
    })

    it('does not include the requesting user in reminder targets', async () => {
      // user-1 is the requesting user, user-2 has no RSVP
      mockPrisma.event.findUnique.mockResolvedValue({
        ...baseEvent,
        team: {
          access: [
            { user: { id: 'user-1' } }, // requester — should be excluded
            { user: { id: 'user-2' } },
          ],
        },
      })
      mockPrisma.rsvp.findMany.mockResolvedValue([])
      mockPrisma.event.updateMany.mockResolvedValue({ count: 1 }) // atomic claim succeeds

      const result = await service.remindRsvp('club-1', 'evt-1', 'user-1')

      expect(mockPushService.sendToUser).toHaveBeenCalledTimes(1)
      expect(mockPushService.sendToUser).toHaveBeenCalledWith('user-2', expect.any(String), expect.any(String), expect.any(Object), expect.any(Object))
      expect(result.sent).toBe(1)
    })

    it('atomically claims rate-limit slot via updateMany before sending reminders', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(baseEvent)
      mockPrisma.rsvp.findMany.mockResolvedValue([])
      mockPrisma.event.updateMany.mockResolvedValue({ count: 1 })

      await service.remindRsvp('club-1', 'evt-1', 'user-1')

      expect(mockPrisma.event.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'evt-1', clubId: 'club-1' }),
          data: { lastRsvpReminderAt: expect.any(Date) },
        }),
      )
      // Ensure the old non-atomic event.update is NOT called for rate-limit purposes
      expect(mockPrisma.event.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: { lastRsvpReminderAt: expect.any(Date) } }),
      )
    })

    it('deduplicates users with multiple team roles before sending reminders', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({
        ...baseEvent,
        team: {
          access: [
            { user: { id: 'user-2' } }, // PLAYER role
            { user: { id: 'user-2' } }, // COACH role — same user, should be deduped
            { user: { id: 'user-3' } },
          ],
        },
      })
      mockPrisma.rsvp.findMany.mockResolvedValue([])
      mockPrisma.event.updateMany.mockResolvedValue({ count: 1 })

      const result = await service.remindRsvp('club-1', 'evt-1', 'user-1')

      expect(mockPushService.sendToUser).toHaveBeenCalledTimes(2) // user-2 once, user-3 once
      expect(result.sent).toBe(2)
    })
  })

  describe('checkIn', () => {
    const eventTime = Date.now() + 30 * 60 * 1000 // 30 min from now — inside window

    const baseEvent = {
      id: 'evt-1',
      clubId: 'club-1',
      teamId: 'team-1',
      date: new Date(eventTime),
      cancelledAt: null,
    }

    beforeEach(() => {
      mockPrisma.eventCheckIn = {
        upsert: jest.fn(),
        findMany: jest.fn(),
      }
    })

    it('returns checkedInAt on success', async () => {
      const checkedInAt = new Date()
      mockPrisma.event.findUnique.mockResolvedValue(baseEvent)
      mockPrisma.eventCheckIn.upsert.mockResolvedValue({ checkedInAt })

      const result = await service.checkIn('club-1', 'evt-1', 'user-1')

      expect(mockPrisma.eventCheckIn.upsert).toHaveBeenCalledWith({
        where: { eventId_userId: { eventId: 'evt-1', userId: 'user-1' } },
        create: { clubId: 'club-1', teamId: 'team-1', eventId: 'evt-1', userId: 'user-1' },
        update: {},
      })
      expect(result).toEqual({ checkedInAt: checkedInAt.toISOString() })
    })

    it('is idempotent — second call returns existing record', async () => {
      const checkedInAt = new Date(Date.now() - 60_000)
      mockPrisma.event.findUnique.mockResolvedValue(baseEvent)
      mockPrisma.eventCheckIn.upsert
        .mockResolvedValueOnce({ checkedInAt })
        .mockResolvedValueOnce({ checkedInAt }) // same record on second call

      const first = await service.checkIn('club-1', 'evt-1', 'user-1')
      const second = await service.checkIn('club-1', 'evt-1', 'user-1')

      expect(first).toEqual(second)
      expect(mockPrisma.eventCheckIn.upsert).toHaveBeenCalledTimes(2)
    })

    it('throws NotFoundException when event does not exist', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null)

      await expect(service.checkIn('club-1', 'missing', 'user-1')).rejects.toThrow(NotFoundException)
    })

    it('throws BadRequestException when event is cancelled', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({ ...baseEvent, cancelledAt: new Date() })

      await expect(service.checkIn('club-1', 'evt-1', 'user-1')).rejects.toThrow(BadRequestException)
    })

    it('throws BadRequestException when before check-in window (> 2h before start)', async () => {
      // Event is 3 hours in the future — outside the 2h window
      mockPrisma.event.findUnique.mockResolvedValue({
        ...baseEvent,
        date: new Date(Date.now() + 3 * 60 * 60 * 1000 + 60_000),
      })

      await expect(service.checkIn('club-1', 'evt-1', 'user-1')).rejects.toThrow(BadRequestException)
    })

    it('throws BadRequestException when after check-in window (> 3h after start)', async () => {
      // Event ended 4 hours ago — outside the 3h post-start window
      mockPrisma.event.findUnique.mockResolvedValue({
        ...baseEvent,
        date: new Date(Date.now() - 4 * 60 * 60 * 1000),
      })

      await expect(service.checkIn('club-1', 'evt-1', 'user-1')).rejects.toThrow(BadRequestException)
    })
  })

  describe('getAttendance', () => {
    const pastEventTime = new Date(Date.now() - 4 * 60 * 60 * 1000) // 4h ago — event ended
    const futureEventTime = new Date(Date.now() + 2 * 60 * 60 * 1000) // 2h from now

    const baseEvent = {
      id: 'evt-1',
      clubId: 'club-1',
      teamId: 'team-1',
      date: pastEventTime,
      cancelledAt: null,
    }

    const rsvpYes = {
      userId: 'user-2',
      status: 'YES',
      reason: null,
      user: { id: 'user-2', name: 'Alice Smith', avatarUrl: null },
    }
    const rsvpNo = {
      userId: 'user-3',
      status: 'NO',
      reason: 'INJURED',
      user: { id: 'user-3', name: 'Bob Jones', avatarUrl: null },
    }
    const checkInRecord = {
      userId: 'user-4',
      checkedInAt: new Date(pastEventTime.getTime() + 10 * 60 * 1000),
      user: { id: 'user-4', name: 'Carol White' },
    }

    beforeEach(() => {
      mockPrisma.eventCheckIn = {
        upsert: jest.fn(),
        findMany: jest.fn(),
      }
    })

    it('returns rsvps, checkIns, and noShows after event ends', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(baseEvent)
      // user-2 RSVPed YES but did NOT check in → noShow
      mockPrisma.rsvp.findMany.mockResolvedValue([rsvpYes, rsvpNo])
      mockPrisma.eventCheckIn.findMany.mockResolvedValue([checkInRecord])

      const result = await service.getAttendance('club-1', 'evt-1', 'user-1')

      expect(mockTeamsService.assertEventManagementAccess).toHaveBeenCalledWith('user-1', 'team-1')
      expect(result.rsvps).toHaveLength(2)
      expect(result.checkIns).toHaveLength(1)
      expect(result.checkIns[0].checkedInAt).toBe(checkInRecord.checkedInAt.toISOString())
      // user-2 RSVPed YES but isn't in checkIns — noShow
      expect(result.noShows).toHaveLength(1)
      expect(result.noShows[0].userId).toBe('user-2')
    })

    it('noShows is empty while event window is still open', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({ ...baseEvent, date: futureEventTime })
      mockPrisma.rsvp.findMany.mockResolvedValue([rsvpYes])
      mockPrisma.eventCheckIn.findMany.mockResolvedValue([])

      const result = await service.getAttendance('club-1', 'evt-1', 'user-1')

      expect(result.noShows).toHaveLength(0)
    })

    it('throws NotFoundException when event does not exist', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null)

      await expect(service.getAttendance('club-1', 'missing', 'user-1')).rejects.toThrow(
        NotFoundException,
      )
    })

    it('includes reason in rsvp entries', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(baseEvent)
      mockPrisma.rsvp.findMany.mockResolvedValue([rsvpNo])
      mockPrisma.eventCheckIn.findMany.mockResolvedValue([])

      const result = await service.getAttendance('club-1', 'evt-1', 'user-1')

      expect(result.rsvps[0].reason).toBe('INJURED')
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
