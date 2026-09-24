import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  HttpException,
} from '@nestjs/common'
import { TeamAccessDeniedError } from '@anstoss/shared'
import { EventsService } from './events.service'

describe('EventsService', () => {
  let service: EventsService
  let mockPrisma: any
  let createdRows: any[] = []
  let mockTeamsService: any
  let mockPushService: any
  let mockEventsGateway: any
  let mockChatService: any

  beforeEach(() => {
    createdRows = []
    mockPrisma = {
      event: {
        create: jest.fn(),
        // Series rows go in with createMany and are read back by seriesId.
        createMany: jest.fn(async ({ data }: any) => {
          createdRows.push(...data.map((row: any, i: number) => ({ id: `evt-${createdRows.length + i + 1}`, createdAt: new Date(), ...row })))
          return { count: data.length }
        }),
        findMany: jest.fn(async (args: any) =>
          args?.where?.seriesId && !args?.where?.id
            ? createdRows.filter((row) => row.seriesId === args.where.seriesId)
            : [],
        ),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn().mockResolvedValue(1),
      },
      membership: {
        findUnique: jest.fn().mockResolvedValue({
          role: 'OWNER',
          operationalRoles: [],
        }),
      },
      rsvp: {
        upsert: jest.fn(),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      teamAccess: {
        // Default: caller IS on the team — short-circuits the parent
        // auto-proxy branch in upsertRsvp.
        findFirst: jest.fn().mockResolvedValue({ id: 'access-1' }),
        // Squad lookups by responder id: everyone who replied is in the squad
        // unless a test says otherwise.
        findMany: jest.fn(async (args: any) =>
          args?.where?.userId?.in
            ? args.where.userId.in.map((userId: string) => ({
                teamId: args.where.teamId?.in?.[0] ?? args.where.teamId,
                userId,
              }))
            : [],
        ),
      },
      // Kader revamp: squadSize subtracts INACTIVE players (none by default).
      teamMember: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      guardianRelationship: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      fixtureOverlay: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      eventReminderPreference: {
        upsert: jest.fn(),
      },
      eventSeries: {
        create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'series-1', ...data })),
        update: jest.fn().mockResolvedValue({ id: 'series-1' }),
        findUnique: jest.fn().mockResolvedValue({
          startsAt: new Date('2027-03-02T18:30:00.000Z'),
          until: new Date('2027-04-13T16:30:00.000Z'),
        }),
      },
      $transaction: jest.fn(async (ops: Promise<unknown>[] | ((tx: any) => Promise<unknown>)) =>
        Array.isArray(ops) ? Promise.all(ops) : ops(mockPrisma),
      ),
      team: {
        findUnique: jest.fn().mockResolvedValue({ name: 'First XI' }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Player One' }),
        findMany: jest.fn(async ({ where }: any) =>
          (where?.id?.in ?? []).map((id: string) => ({ id, preferredLanguage: 'de' })),
        ),
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
      sendToTeamLocalized: jest.fn().mockResolvedValue(undefined),
      sendToUserLocalized: jest.fn().mockResolvedValue(undefined),
      sendToTeamRendered: jest.fn().mockResolvedValue(undefined),
    }
    mockEventsGateway = {
      emitRsvpUpdate: jest.fn().mockResolvedValue(undefined),
      emitEventUpsert: jest.fn(),
    }
    mockChatService = { postSystemNotice: jest.fn().mockResolvedValue(undefined) }
    const mockContributionsService = {
      // Default: no overdue contributions — RSVP YES is allowed.
      getOverdueContributionsForUser: jest.fn().mockResolvedValue([]),
    }
    service = new EventsService(
      mockPrisma,
      mockTeamsService,
      mockContributionsService as never,
      mockPushService as never,
      mockEventsGateway as never,
      mockChatService as never,
    )
  })

  describe('create', () => {
    it('materialises one row per occurrence up to the end date', async () => {
      let n = 0
      mockPrisma.event.create.mockImplementation(async ({ data }: any) => ({ id: `evt-${++n}`, ...data }))
      const first = new Date('2027-03-02T18:30:00.000Z')
      const until = new Date(first.getTime() + 3 * 7 * 86_400_000)

      const result = await service.createSeries({
        title: 'Training',
        type: 'TRAINING',
        date: first,
        teamId: 'team-1',
        createdById: 'user-1',
        intervalWeeks: 1,
        until,
      })

      expect(result.events).toHaveLength(4)
      expect(result.events.every((e: any) => e.seriesId === 'series-1')).toBe(true)
      expect(result.events[3].date.getTime()).toBe(until.getTime())
      // One notice for the series, not one per occurrence.
      expect(mockChatService.postSystemNotice).toHaveBeenCalledTimes(1)
    })

    it('keeps the Berlin wall-clock time stable across daylight-saving changes', async () => {
      let n = 0
      mockPrisma.event.create.mockImplementation(async ({ data }: any) => ({
        id: `dst-${++n}`,
        ...data,
      }))
      // 18:30 Europe/Berlin before DST starts in 2027 is 17:30Z.
      const first = new Date('2027-03-23T17:30:00.000Z')
      const until = new Date('2027-04-06T16:30:00.000Z')

      const result = await service.createSeries({
        title: 'Training',
        type: 'TRAINING',
        date: first,
        teamId: 'team-1',
        createdById: 'user-1',
        intervalWeeks: 1,
        until,
      })

      expect(result.events.map((event: any) => event.date.toISOString())).toEqual([
        '2027-03-23T17:30:00.000Z',
        // After DST starts, 18:30 Europe/Berlin is 16:30Z.
        '2027-03-30T16:30:00.000Z',
        '2027-04-06T16:30:00.000Z',
      ])
    })

    it('rejects a route club that does not own the selected team', async () => {
      await expect(
        service.create({
          title: 'Training',
          type: 'TRAINING',
          date: new Date('2027-03-02T18:30:00.000Z'),
          teamId: 'team-1',
          createdById: 'user-1',
          clubId: 'other-club',
        }),
      ).rejects.toThrow(BadRequestException)

      expect(mockPrisma.event.create).not.toHaveBeenCalled()
    })

    it('rejects a recurring event route club that does not own the selected team', async () => {
      await expect(
        service.createSeries({
          title: 'Training',
          type: 'TRAINING',
          date: new Date('2027-03-02T18:30:00.000Z'),
          teamId: 'team-1',
          createdById: 'user-1',
          clubId: 'other-club',
          intervalWeeks: 1,
          until: new Date('2027-03-16T18:30:00.000Z'),
        }),
      ).rejects.toThrow(BadRequestException)

      expect(mockPrisma.eventSeries.create).not.toHaveBeenCalled()
      expect(mockPrisma.event.create).not.toHaveBeenCalled()
    })

    it('rejects a series with more than four training days a week (M4)', async () => {
      await expect(
        service.createSeries({
          title: 'Training',
          type: 'TRAINING',
          date: new Date('2027-01-05T17:30:00.000Z'),
          teamId: 'team-1',
          createdById: 'user-1',
          intervalWeeks: 1,
          until: new Date('2027-02-05T17:30:00.000Z'),
          weekdays: [1, 2, 3, 4, 5],
        }),
      ).rejects.toThrow(BadRequestException)
      expect(mockPrisma.event.createMany).not.toHaveBeenCalled()
    })

    it('writes a season of Di + Do with one createMany and an explicit timeout (M4)', async () => {
      const { events } = await service.createSeries({
        title: null,
        type: 'TRAINING',
        date: new Date('2027-07-06T17:00:00.000Z'),
        teamId: 'team-1',
        createdById: 'user-1',
        intervalWeeks: 1,
        until: new Date('2028-06-30T21:59:00.000Z'),
        weekdays: [2, 4],
      })
      expect(mockPrisma.event.createMany).toHaveBeenCalledTimes(1)
      expect(mockPrisma.event.create).not.toHaveBeenCalled()
      expect(mockPrisma.event.createMany.mock.calls[0][0].data).toHaveLength(events.length)
      expect(events.length).toBeGreaterThan(100)
      // $transaction(fn, { timeout }) — not Prisma's 5 s default.
      expect(mockPrisma.$transaction.mock.calls[0][1]).toEqual(
        expect.objectContaining({ timeout: 20_000 }),
      )
      // L7: the default title is derived, not stored in the creator's language.
      expect(mockPrisma.event.createMany.mock.calls[0][0].data[0]).toEqual(
        expect.objectContaining({ title: 'Training', autoTitle: true }),
      )
    })

    it('does not report series creation as failed when the chat notice fails after commit', async () => {
      let n = 0
      mockPrisma.event.create.mockImplementation(async ({ data }: any) => ({
        id: `evt-${++n}`,
        ...data,
      }))
      mockChatService.postSystemNotice.mockRejectedValueOnce(new Error('chat down'))

      await expect(
        service.createSeries({
          title: 'Training',
          type: 'TRAINING',
          date: new Date('2027-03-02T18:30:00.000Z'),
          teamId: 'team-1',
          createdById: 'user-1',
          intervalWeeks: 1,
          until: new Date('2027-03-09T18:30:00.000Z'),
        }),
      ).resolves.toMatchObject({ events: expect.any(Array) })
    })

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

      expect(mockTeamsService.assertEventManagementAccess).toHaveBeenCalledWith('user-1', 'team-1')
      expect(mockPrisma.event.create).toHaveBeenCalledWith({
        data: {
          title: 'Training Session',
          autoTitle: false,
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

    it('sends an EVENT_CREATED team push excluding the creator', async () => {
      const data = {
        title: 'Match Day',
        type: 'MATCH' as const,
        date: new Date('2027-03-01T15:00:00Z'),
        teamId: 'team-1',
        createdById: 'user-1',
      }
      mockPrisma.event.create.mockResolvedValue({
        id: 'evt-9',
        ...data,
        location: null,
        notes: null,
        clubId: 'club-1',
      })

      await service.create(data)
      // notifyEventCreated is fire-and-forget — flush the microtask queue
      await new Promise((resolve) => setImmediate(resolve))

      // Rendered once per reader language (sendToTeamRendered).
      expect(mockPushService.sendToTeamRendered).toHaveBeenCalledTimes(1)
      const call = mockPushService.sendToTeamRendered.mock.calls[0]
      expect(call[0]).toBe('team-1') // teamId
      expect(call[1]('de').body).toBe('Neuer Termin: Match Day am Mo., 01.03.')
      expect(call[1]('en').body).toBe('New match: Match Day on Mon 01/03')
      expect(call[1]('de').title).toContain('First XI')
      expect(call[3]).toBe('user-1') // excludeUserId = creator
      expect(call[4]).toMatchObject({ clubId: 'club-1', category: 'events' })
    })
  })

  it('excludes expired loans when deriving the all-team event feed', async () => {
    await expect(service.listUpcomingAllTeams('club-1', 'user-1')).resolves.toEqual([])

    expect(mockPrisma.teamAccess.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        clubId: 'club-1',
        status: 'ACTIVE',
        OR: [{ loanEndDate: null }, { loanEndDate: { gt: expect.any(Date) } }],
      },
      select: { teamId: true, phase: true },
    })
  })

  describe('listUpcoming', () => {
    it('returns upcoming events ordered by date, keeping cancelled ones visible', async () => {
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
          team: { id: 'team-1', name: 'A-Team', _count: { access: 18 } },
        },
      ])

      const result = await service.listUpcoming('team-1', 'user-1')

      expect(mockTeamsService.assertReadableAccess).toHaveBeenCalledWith('user-1', 'team-1', expect.anything())
      expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          // Cancelled events stay in the upcoming feed until their date passes
          // so the squad sees the change in the schedule itself.
          where: expect.not.objectContaining({ cancelledAt: null }),
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

    it('uses the Kader squad rule for squadSize (players, FULL, not inactive)', async () => {
      const eventDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
      mockPrisma.event.findMany.mockResolvedValue([
        {
          id: 'evt-squad',
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
          _count: { rsvps: 0 },
          rsvps: [],
          team: { id: 'team-1', name: 'A-Team', _count: { access: 18 } },
        },
      ])
      mockPrisma.teamMember.findMany.mockResolvedValue([
        { teamId: 'team-1', userId: 'inactive-1' },
      ])
      mockPrisma.teamAccess.findMany.mockResolvedValue([
        { teamId: 'team-1', userId: 'inactive-1', loanEndDate: null },
      ])

      const [event] = await service.listUpcoming('team-1', 'user-1')

      expect(event.squadSize).toBe(17)
      const include = mockPrisma.event.findMany.mock.calls[0][0].include
      expect(include.team.select._count.select.access.where).toEqual({
        status: 'ACTIVE',
        role: 'PLAYER',
        phase: 'FULL',
      })
    })

    it('drops cancelled events from the past scope', async () => {
      mockPrisma.event.findMany.mockResolvedValue([])

      await service.listUpcoming('team-1', 'user-1', { scope: 'past' })

      expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ teamId: 'team-1', cancelledAt: null, archivedAt: null }),
        }),
      )
    })

    it('attaches readiness score and risk signals to event feed items', async () => {
      const eventDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
      mockPrisma.event.findMany.mockResolvedValue([
        {
          id: 'evt-1',
          teamId: 'team-1',
          clubId: 'club-1',
          title: 'League match',
          type: 'MATCH',
          date: eventDate,
          location: null,
          notes: null,
          createdById: 'user-1',
          createdAt: eventDate,
          archivedAt: null,
          _count: { rsvps: 9, checkIns: 0 },
          rsvps: [
            ...Array.from({ length: 7 }).map((_, i) => ({
              userId: `yes-${i}`,
              status: 'YES',
              reason: null,
            })),
            { userId: 'maybe-1', status: 'MAYBE', reason: null },
            { userId: 'injured-1', status: 'NO', reason: 'INJURED' },
          ],
          team: { id: 'team-1', name: 'A-Team', _count: { access: 14 } },
        },
      ])

      const [event] = await service.listUpcoming('team-1', 'user-1')

      expect(event.readiness).toEqual(
        expect.objectContaining({
          status: 'AT_RISK',
          score: expect.any(Number),
          briefing: expect.objectContaining({
            key: 'low_confirmations',
            params: expect.objectContaining({ count: 4, target: 11, confirmed: 7 }),
            fallback: 'Need 4 more confirmations to reach the match target.',
          }),
          metrics: expect.objectContaining({
            squadSize: 14,
            responseCount: 9,
            yesCount: 7,
            pendingCount: 5,
            injuryRiskCount: 1,
          }),
        }),
      )
      expect(event.readiness?.signals.map((signal) => signal.key)).toEqual(
        expect.arrayContaining(['low_confirmations', 'pending_replies', 'injury_risks']),
      )
      expect(event.readiness?.nudge).toEqual(
        expect.objectContaining({
          recommended: true,
          reason: 'low_confirmations',
          targetCount: 5,
          urgency: expect.any(String),
        }),
      )
    })

    it('does not expose readiness aggregates to readable non-managers', async () => {
      const eventDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
      mockTeamsService.assertEventManagementAccess.mockRejectedValue(
        new TeamAccessDeniedError('You do not manage events for this team.'),
      )
      mockPrisma.event.findMany.mockResolvedValue([
        {
          id: 'evt-1',
          teamId: 'team-1',
          clubId: 'club-1',
          title: 'League match',
          type: 'MATCH',
          date: eventDate,
          location: null,
          notes: null,
          createdById: 'user-1',
          createdAt: eventDate,
          archivedAt: null,
          _count: { rsvps: 1, checkIns: 0 },
          rsvps: [{ userId: 'injured-1', status: 'NO', reason: 'INJURED' }],
          team: { id: 'team-1', name: 'A-Team', _count: { access: 14 } },
        },
      ])

      const [event] = await service.listUpcoming('team-1', 'player-1')

      expect(event.readiness).toBeUndefined()
    })

    it('counts only active player access rows for squad sizing', async () => {
      mockPrisma.event.findMany.mockResolvedValue([])

      await service.listUpcoming('team-1', 'coach-1')

      expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            team: expect.objectContaining({
              select: expect.objectContaining({
                _count: {
                  select: {
                    access: {
                      where: {
                        status: 'ACTIVE',
                        role: 'PLAYER',
                        phase: 'FULL',
                      },
                    },
                  },
                },
              }),
            }),
          }),
        }),
      )
    })

    it('prioritizes critical readiness signals before truncating', async () => {
      const eventDate = new Date(Date.now() - 4 * 60 * 60 * 1000)
      mockPrisma.event.findMany.mockResolvedValue([
        {
          id: 'evt-1',
          teamId: 'team-1',
          clubId: 'club-1',
          title: 'Finished match',
          type: 'MATCH',
          date: eventDate,
          location: null,
          notes: null,
          createdById: 'user-1',
          createdAt: eventDate,
          archivedAt: null,
          _count: { rsvps: 9, checkIns: 0 },
          rsvps: [
            ...Array.from({ length: 3 }).map((_, i) => ({
              userId: `yes-${i}`,
              status: 'YES',
              reason: null,
            })),
            { userId: 'maybe-1', status: 'MAYBE', reason: null },
            { userId: 'injured-1', status: 'NO', reason: 'INJURED' },
            { userId: 'injured-2', status: 'NO', reason: 'INJURED' },
            { userId: 'no-1', status: 'NO', reason: null },
            { userId: 'no-2', status: 'NO', reason: null },
            { userId: 'no-3', status: 'NO', reason: null },
          ],
          team: { id: 'team-1', name: 'A-Team', _count: { access: 20 } },
        },
      ])

      const [event] = await service.listUpcoming('team-1', 'coach-1')
      const signalKeys = event.readiness?.signals.map((signal) => signal.key) ?? []

      expect(signalKeys).toContain('no_show_risk')
      expect(signalKeys).toContain('injury_risks')
      expect(signalKeys).toHaveLength(4)
    })

    it('marks events without an active squad as needing setup', async () => {
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
          _count: { rsvps: 0, checkIns: 0 },
          rsvps: [],
          team: { id: 'team-1', name: 'A-Team', _count: { access: 0 } },
        },
      ])

      const [event] = await service.listUpcoming('team-1', 'user-1')

      expect(event.readiness?.status).toBe('NEEDS_SETUP')
      expect(event.readiness?.score).toBe(0)
      expect(event.readiness?.briefing).toEqual(
        expect.objectContaining({
          key: 'needs_setup',
          fallback: 'Add players before readiness can be calculated.',
        }),
      )
      expect(event.readiness?.signals).toEqual([{ key: 'no_squad', severity: 'critical' }])
      expect(event.readiness?.nudge?.recommended).toBe(false)
    })

    it('uses attendance briefing instead of RSVP nudge copy after an event starts', async () => {
      const eventDate = new Date(Date.now() - 30 * 60 * 1000)
      mockPrisma.event.findMany.mockResolvedValue([
        {
          id: 'evt-1',
          teamId: 'team-1',
          clubId: 'club-1',
          title: 'Live match',
          type: 'MATCH',
          date: eventDate,
          location: null,
          notes: null,
          createdById: 'user-1',
          createdAt: eventDate,
          archivedAt: null,
          _count: { rsvps: 7, checkIns: 2 },
          rsvps: Array.from({ length: 7 }).map((_, i) => ({
            userId: `yes-${i}`,
            status: 'YES',
            reason: null,
          })),
          team: { id: 'team-1', name: 'A-Team', _count: { access: 14 } },
        },
      ])

      const [event] = await service.listUpcoming('team-1', 'coach-1')

      expect(event.readiness?.briefing).toEqual(
        expect.objectContaining({
          key: 'event_started',
          fallback: 'Event is underway. Use check-ins and attendance instead of RSVP nudges.',
        }),
      )
      expect(event.readiness?.nudge).toEqual(
        expect.objectContaining({
          recommended: false,
          reason: 'event_started',
        }),
      )
    })

    it('uses no-show review briefing after the event window closes', async () => {
      const eventDate = new Date(Date.now() - 4 * 60 * 60 * 1000)
      mockPrisma.event.findMany.mockResolvedValue([
        {
          id: 'evt-1',
          teamId: 'team-1',
          clubId: 'club-1',
          title: 'Finished match',
          type: 'MATCH',
          date: eventDate,
          location: null,
          notes: null,
          createdById: 'user-1',
          createdAt: eventDate,
          archivedAt: null,
          _count: { rsvps: 11, checkIns: 8 },
          rsvps: Array.from({ length: 11 }).map((_, i) => ({
            userId: `yes-${i}`,
            status: 'YES',
            reason: null,
          })),
          team: { id: 'team-1', name: 'A-Team', _count: { access: 14 } },
        },
      ])

      const [event] = await service.listUpcoming('team-1', 'coach-1')

      expect(event.readiness?.briefing).toEqual(
        expect.objectContaining({
          key: 'no_show_review',
          params: expect.objectContaining({ count: 3 }),
          fallback: 'Review attendance: 3 confirmed players were not checked in.',
        }),
      )
    })

    it('suppresses readiness nudge while RSVP reminder is in cooldown', async () => {
      const eventDate = new Date(Date.now() + 12 * 60 * 60 * 1000)
      const reminderSentAt = new Date(Date.now() - 60 * 60 * 1000)
      mockPrisma.event.findMany.mockResolvedValue([
        {
          id: 'evt-1',
          teamId: 'team-1',
          clubId: 'club-1',
          title: 'League match',
          type: 'MATCH',
          date: eventDate,
          location: null,
          notes: null,
          createdById: 'user-1',
          createdAt: eventDate,
          archivedAt: null,
          lastRsvpReminderAt: reminderSentAt,
          _count: { rsvps: 8, checkIns: 0 },
          rsvps: Array.from({ length: 8 }).map((_, i) => ({
            userId: `yes-${i}`,
            status: 'YES',
            reason: null,
          })),
          team: { id: 'team-1', name: 'A-Team', _count: { access: 14 } },
        },
      ])

      const [event] = await service.listUpcoming('team-1', 'coach-1')

      expect(event.readiness?.nudge).toEqual(
        expect.objectContaining({
          recommended: false,
          reason: 'cooldown',
          targetCount: 6,
          nextAvailableAt: expect.any(String),
        }),
      )
    })

    it('returns club-wide upcoming readiness for club event managers without a team filter', async () => {
      const eventDate = new Date('2027-01-01')
      mockPrisma.event.findMany.mockResolvedValue([
        {
          id: 'evt-1',
          teamId: 'team-1',
          clubId: 'club-1',
          title: 'Cup match',
          type: 'MATCH',
          date: eventDate,
          location: null,
          notes: null,
          createdById: 'user-1',
          createdAt: eventDate,
          archivedAt: null,
          _count: { rsvps: 11, checkIns: 0 },
          rsvps: Array.from({ length: 11 }).map((_, i) => ({
            userId: `yes-${i}`,
            status: 'YES',
            reason: null,
          })),
          team: { id: 'team-1', name: 'A-Team', _count: { access: 14 } },
        },
      ])

      const [event] = await service.listUpcomingManagedClub('club-1', 'owner-1', { limit: 1 })

      expect(mockPrisma.membership.findUnique).toHaveBeenCalledWith({
        where: { userId_clubId: { userId: 'owner-1', clubId: 'club-1' } },
        select: { role: true, operationalRoles: true },
      })
      expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ clubId: 'club-1' }),
          take: 1,
        }),
      )
      expect(event.team).toEqual({ id: 'team-1', name: 'A-Team' })
      expect(event.readiness?.metrics.squadSize).toBe(14)
      expect(event.readiness?.briefing).toEqual(
        expect.objectContaining({
          key: 'ready_pending',
          params: expect.objectContaining({ yes: 11, squad: 14, pending: 3 }),
          fallback: 'Squad is ready: 11/14 confirmed. Monitor 3 pending replies.',
        }),
      )
    })

    it('rejects club-wide upcoming feed for members without event permission', async () => {
      mockPrisma.membership.findUnique.mockResolvedValue({
        role: 'PLAYER',
        operationalRoles: [],
      })

      await expect(service.listUpcomingManagedClub('club-1', 'player-1')).rejects.toThrow(
        TeamAccessDeniedError,
      )
      expect(mockPrisma.event.findMany).not.toHaveBeenCalled()
    })
  })

  describe('findById', () => {
    it('returns the event with manager-only readiness when found', async () => {
      mockPrisma.event.findFirst.mockResolvedValue({
        id: 'evt-1',
        teamId: 'team-1',
        type: 'MATCH',
        date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        _count: { rsvps: 2, checkIns: 0 },
        rsvps: [],
        checkIns: [],
        team: { id: 'team-1', name: 'A-Team', _count: { access: 14 } },
      })

      const result = await service.findById('club-1', 'evt-1', 'user-1')

      expect(mockTeamsService.assertReadableAccess).toHaveBeenCalledWith('user-1', 'team-1', expect.anything())
      expect(mockPrisma.event.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'evt-1', clubId: 'club-1' },
        }),
      )
      expect(result.id).toBe('evt-1')
      expect(result.team).toEqual({ id: 'team-1', name: 'A-Team' })
      expect(result.teamMemberCount).toBe(14)
      expect(result.readiness).toEqual(
        expect.objectContaining({
          status: 'AT_RISK',
          metrics: expect.objectContaining({ squadSize: 14 }),
        }),
      )
      expect(mockPrisma.event.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            team: expect.objectContaining({
              select: expect.objectContaining({
                _count: {
                  select: {
                    access: {
                      where: {
                        status: 'ACTIVE',
                        role: 'PLAYER',
                        phase: 'FULL',
                      },
                    },
                  },
                },
              }),
            }),
          }),
        }),
      )
    })

    it('does not attach readiness to event details for readable non-managers', async () => {
      mockTeamsService.assertEventManagementAccess.mockRejectedValue(
        new TeamAccessDeniedError('You do not manage events for this team.'),
      )
      mockPrisma.event.findFirst.mockResolvedValue({
        id: 'evt-1',
        teamId: 'team-1',
        type: 'MATCH',
        date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        _count: { rsvps: 1, checkIns: 0 },
        rsvps: [
          { userId: 'player-1', status: 'NO', reason: 'INJURED' },
          { userId: 'player-2', status: 'NO', reason: 'PERSONAL' },
        ],
        checkIns: [],
        team: { id: 'team-1', name: 'A-Team', _count: { access: 14 } },
      })

      const result = await service.findById('club-1', 'evt-1', 'player-1')

      expect(mockTeamsService.assertReadableAccess).toHaveBeenCalledWith('player-1', 'team-1', expect.anything())
      expect(result.team).toEqual({ id: 'team-1', name: 'A-Team' })
      expect(result.teamMemberCount).toBeUndefined()
      expect(result.readiness).toBeUndefined()
      expect(result.rsvps).toEqual([
        expect.objectContaining({ userId: 'player-1', reason: 'INJURED' }),
        expect.objectContaining({ userId: 'player-2', reason: undefined }),
      ])
    })

    it('throws NotFoundException when event does not exist', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(null)

      await expect(service.findById('club-1', 'missing', 'user-1')).rejects.toThrow(
        NotFoundException,
      )
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
      mockPrisma.rsvp.upsert.mockResolvedValue({
        eventId: 'evt-1',
        userId: 'user-1',
        status: 'YES',
      })

      const result = await service.upsertRsvp('evt-1', 'user-1', 'YES')

      expect(mockTeamsService.assertReadableAccess).toHaveBeenCalledWith('user-1', 'team-1', expect.anything())
      expect(mockPrisma.rsvp.upsert).toHaveBeenCalledWith({
        where: { eventId_userId: { eventId: 'evt-1', userId: 'user-1' } },
        update: { status: 'YES', reason: null, note: null, squadDroppedAt: null },
        create: { eventId: 'evt-1', userId: 'user-1', status: 'YES', reason: null, note: null },
      })
      expect(result.status).toBe('YES')
    })

    it('emits an event:rsvp realtime update with fresh counts', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({
        id: 'evt-1',
        teamId: 'team-1',
        cancelledAt: null,
        createdById: 'user-1',
      })
      mockPrisma.rsvp.upsert.mockResolvedValue({
        eventId: 'evt-1',
        userId: 'user-1',
        status: 'YES',
      })

      await service.upsertRsvp('evt-1', 'user-1', 'YES')

      expect(mockEventsGateway.emitRsvpUpdate).toHaveBeenCalledWith('team-1', 'evt-1')
    })

    it('notifies the organizer (RSVP_UPDATE) when a different user responds', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({
        id: 'evt-1',
        teamId: 'team-1',
        clubId: 'club-1',
        title: 'Friendly Match',
        cancelledAt: null,
        createdById: 'organizer-1',
      })
      mockPrisma.rsvp.upsert.mockResolvedValue({
        eventId: 'evt-1',
        userId: 'user-1',
        status: 'MAYBE',
      })

      await service.upsertRsvp('evt-1', 'user-1', 'MAYBE')

      expect(mockPushService.sendToUserLocalized).toHaveBeenCalledTimes(1)
      const [recipient, type, data] = mockPushService.sendToUserLocalized.mock.calls[0]
      expect(recipient).toBe('organizer-1')
      expect(type).toBe('RSVP_UPDATE')
      expect(data).toMatchObject({ status: 'MAYBE', eventTitle: 'Friendly Match' })
    })

    it('does NOT notify the organizer for their own RSVP', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({
        id: 'evt-1',
        teamId: 'team-1',
        clubId: 'club-1',
        title: 'Friendly Match',
        cancelledAt: null,
        createdById: 'user-1',
      })
      mockPrisma.rsvp.upsert.mockResolvedValue({
        eventId: 'evt-1',
        userId: 'user-1',
        status: 'YES',
      })

      await service.upsertRsvp('evt-1', 'user-1', 'YES')

      expect(mockPushService.sendToUserLocalized).not.toHaveBeenCalled()
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

      await expect(service.getRsvpSummary('missing', 'user-1')).rejects.toThrow(NotFoundException)
    })
  })

  describe('update', () => {
    const baseEvent = {
      id: 'evt-1',
      teamId: 'team-1',
      clubId: 'club-1',
      title: 'Training',
      date: new Date('2027-03-02T18:30:00.000Z'),
      location: 'Pitch 2',
      createdById: 'user-1',
      cancelledAt: null,
      cancelReason: null,
    }

    it('throws NotFoundException when event does not exist', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null)

      await expect(service.update('missing', 'user-1', { title: 'New' })).rejects.toThrow(
        NotFoundException,
      )
    })

    it('does not mutate an event through the wrong route club', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(baseEvent)

      await expect(
        service.update('evt-1', 'user-1', { title: 'New' }, 'this', 'other-club'),
      ).rejects.toThrow(NotFoundException)

      expect(mockTeamsService.assertEventManagementAccess).not.toHaveBeenCalled()
      expect(mockPrisma.event.update).not.toHaveBeenCalled()
    })

    it('throws ForbiddenException when the user is not an event manager', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(baseEvent)
      mockTeamsService.assertEventManagementAccess.mockRejectedValueOnce(
        new ForbiddenException('nope'),
      )

      await expect(service.update('evt-1', 'other-user', { title: 'New' })).rejects.toThrow(
        ForbiddenException,
      )
    })

    it('lets a manager who did not create the event edit it', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(baseEvent)
      mockPrisma.event.update.mockResolvedValue({ ...baseEvent, title: 'New' })

      await expect(
        service.update('evt-1', 'other-coach', { title: 'New' }),
      ).resolves.toMatchObject({ title: 'New' })
      expect(mockTeamsService.assertEventManagementAccess).toHaveBeenCalledWith(
        'other-coach',
        baseEvent.teamId,
      )
    })

    it('applies "following" edits to later occurrences of the series, shifted by the same delta', async () => {
      const seriesEvent = { ...baseEvent, seriesId: 'series-1' }
      mockPrisma.event.findUnique.mockResolvedValue(seriesEvent)
      const moved = new Date(baseEvent.date.getTime() + 3_600_000)
      mockPrisma.event.update.mockResolvedValue({ ...seriesEvent, date: moved })
      const laterDate = new Date(baseEvent.date.getTime() + 7 * 86_400_000)
      mockPrisma.event.findMany.mockResolvedValue([{ id: 'evt-2', date: laterDate }])

      await service.update('evt-1', 'user-1', { date: moved, location: 'Pitch 3' }, 'following')

      const laterUpdate = mockPrisma.event.update.mock.calls.find(
        (call: any[]) => call[0].where.id === 'evt-2',
      )
      expect(laterUpdate[0].data.location).toBe('Pitch 3')
      expect(laterUpdate[0].data.date.getTime()).toBe(laterDate.getTime() + 3_600_000)
      expect(laterUpdate[0].data.rescheduledAt).toBeInstanceOf(Date)
      expect(mockPrisma.eventSeries.update).toHaveBeenCalled()
    })

    it('keeps following occurrence edits on the same Berlin wall-clock time across DST', async () => {
      const seriesEvent = {
        ...baseEvent,
        seriesId: 'series-1',
        // 2027-03-23 18:30 Europe/Berlin, before spring DST.
        date: new Date('2027-03-23T17:30:00.000Z'),
      }
      const moved = new Date('2027-03-30T16:30:00.000Z') // 18:30 after DST starts.
      const laterDate = new Date('2027-04-06T16:30:00.000Z') // 18:30 Berlin.
      mockPrisma.event.findUnique.mockResolvedValue(seriesEvent)
      mockPrisma.event.update.mockResolvedValue({ ...seriesEvent, date: moved })
      mockPrisma.event.findMany.mockResolvedValue([{ id: 'evt-2', date: laterDate }])
      mockPrisma.eventSeries.findUnique.mockResolvedValue({
        startsAt: new Date('2027-03-23T17:30:00.000Z'),
        until: new Date('2027-04-20T16:30:00.000Z'),
      })

      await service.update('evt-1', 'user-1', { date: moved }, 'following')

      const laterUpdate = mockPrisma.event.update.mock.calls.find(
        (call: any[]) => call[0].where.id === 'evt-2',
      )
      expect(laterUpdate[0].data.date.toISOString()).toBe('2027-04-13T16:30:00.000Z')
      expect(mockPrisma.eventSeries.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            until: new Date('2027-04-27T16:30:00.000Z'),
          }),
        }),
      )
    })

    it('updates series startsAt when the first occurrence moves with following scope', async () => {
      const seriesEvent = {
        ...baseEvent,
        seriesId: 'series-1',
        date: new Date('2027-03-23T17:30:00.000Z'),
      }
      const moved = new Date('2027-03-30T16:30:00.000Z')
      mockPrisma.event.findUnique.mockResolvedValue(seriesEvent)
      mockPrisma.event.update.mockResolvedValue({ ...seriesEvent, date: moved })
      mockPrisma.event.findMany.mockResolvedValue([])
      mockPrisma.event.count.mockResolvedValueOnce(0)
      mockPrisma.eventSeries.findUnique.mockResolvedValue({
        startsAt: seriesEvent.date,
        until: new Date('2027-04-20T16:30:00.000Z'),
      })

      await service.update('evt-1', 'user-1', { date: moved }, 'following')

      expect(mockPrisma.eventSeries.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            startsAt: moved,
            until: new Date('2027-04-27T16:30:00.000Z'),
          }),
        }),
      )
    })

    it('keeps following occurrence edits on the same Berlin wall-clock time across fall DST', async () => {
      const seriesEvent = {
        ...baseEvent,
        seriesId: 'series-1',
        // 2027-10-26 18:30 Europe/Berlin, before fall DST ends.
        date: new Date('2027-10-26T16:30:00.000Z'),
      }
      const moved = new Date('2027-11-02T17:30:00.000Z') // 18:30 after DST ends.
      const laterDate = new Date('2027-11-09T17:30:00.000Z') // 18:30 Berlin.
      mockPrisma.event.findUnique.mockResolvedValue(seriesEvent)
      mockPrisma.event.update.mockResolvedValue({ ...seriesEvent, date: moved })
      mockPrisma.event.findMany.mockResolvedValue([{ id: 'evt-2', date: laterDate }])
      mockPrisma.eventSeries.findUnique.mockResolvedValue({
        startsAt: new Date('2027-10-26T16:30:00.000Z'),
        until: new Date('2027-11-23T17:30:00.000Z'),
      })

      await service.update('evt-1', 'user-1', { date: moved }, 'following')

      const laterUpdate = mockPrisma.event.update.mock.calls.find(
        (call: any[]) => call[0].where.id === 'evt-2',
      )
      expect(laterUpdate[0].data.date.toISOString()).toBe('2027-11-16T17:30:00.000Z')
      expect(mockPrisma.eventSeries.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            until: new Date('2027-11-30T17:30:00.000Z'),
          }),
        }),
      )
    })

    it('stamps rescheduledAt only when the date actually moves', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(baseEvent)
      mockPrisma.event.update.mockResolvedValue({ ...baseEvent, title: 'New' })
      await service.update('evt-1', 'user-1', { title: 'New', date: baseEvent.date })
      expect(mockPrisma.event.update.mock.calls[0][0].data).not.toHaveProperty('rescheduledAt')

      const moved = new Date(baseEvent.date.getTime() + 3_600_000)
      mockPrisma.event.update.mockResolvedValue({ ...baseEvent, date: moved })
      await service.update('evt-1', 'user-1', { date: moved })
      expect(mockPrisma.event.update.mock.calls[1][0].data.rescheduledAt).toBeInstanceOf(Date)
    })

    it('notifies the squad when the date changes, and stays quiet for a title edit', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(baseEvent)
      mockPrisma.event.update.mockResolvedValue({ ...baseEvent, title: 'New' })

      await service.update('evt-1', 'user-1', { title: 'New' })
      expect(mockPushService.sendToTeamRendered).not.toHaveBeenCalled()
      expect(mockChatService.postSystemNotice).not.toHaveBeenCalled()

      const moved = new Date(baseEvent.date.getTime() + 3_600_000)
      mockPrisma.event.update.mockResolvedValue({ ...baseEvent, date: moved })
      await service.update('evt-1', 'user-1', { date: moved })

      expect(mockPushService.sendToTeamRendered).toHaveBeenCalledWith(
        baseEvent.teamId,
        expect.any(Function),
        expect.objectContaining({ type: 'event_updated', eventId: 'evt-1' }),
        'user-1',
        expect.objectContaining({ category: 'events' }),
      )
      const render = mockPushService.sendToTeamRendered.mock.calls[0][1]
      expect(render('de').body).toContain(`Geändert: ${baseEvent.title} ist jetzt am`)
      expect(mockChatService.postSystemNotice).toHaveBeenCalledWith(
        expect.objectContaining({ teamId: baseEvent.teamId, actorId: 'user-1' }),
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
        data: { title: 'Updated', autoTitle: false },
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
        data: { title: 'New Title', autoTitle: false, location: 'New Location' },
      })
    })
  })

  describe('cancel', () => {
    it('cancels the rest of the series with scope "following"', async () => {
      const seriesEvent = {
        id: 'evt-1', teamId: 'team-1', clubId: 'club-1', title: 'Training',
        date: new Date('2027-03-02T18:30:00.000Z'), cancelledAt: null, seriesId: 'series-1',
      }
      mockPrisma.event.findUnique.mockResolvedValue(seriesEvent)
      mockPrisma.event.update.mockResolvedValue({ ...seriesEvent, cancelledAt: new Date(), cancelReason: null })
      mockPrisma.event.updateMany.mockResolvedValue({ count: 5 })

      await service.cancel('evt-1', 'user-1', undefined, 'following')

      expect(mockPrisma.event.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ seriesId: 'series-1', cancelledAt: null }),
        }),
      )
      expect(mockPrisma.eventSeries.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { until: seriesEvent.date } }),
      )
      expect(mockChatService.postSystemNotice).toHaveBeenCalledTimes(1)
    })

    it('does not cancel an event through the wrong route club', async () => {
      const event = {
        id: 'evt-1',
        teamId: 'team-1',
        clubId: 'club-1',
        title: 'Training',
        date: new Date('2027-03-02T18:30:00.000Z'),
        cancelledAt: null,
      }
      mockPrisma.event.findUnique.mockResolvedValue(event)

      await expect(
        service.cancel('evt-1', 'user-1', undefined, 'this', 'other-club'),
      ).rejects.toThrow(NotFoundException)

      expect(mockTeamsService.assertEventManagementAccess).not.toHaveBeenCalled()
      expect(mockPrisma.event.update).not.toHaveBeenCalled()
    })


    const baseEvent = {
      id: 'evt-1',
      teamId: 'team-1',
      clubId: 'club-1',
      title: 'Training',
      date: new Date('2027-03-02T18:30:00.000Z'),
      location: 'Pitch 2',
      createdById: 'user-1',
      cancelledAt: null,
      cancelReason: null,
    }

    it('throws NotFoundException when event does not exist', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null)

      await expect(service.cancel('missing', 'user-1')).rejects.toThrow(NotFoundException)
    })

    it('throws ForbiddenException when the user is not an event manager', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(baseEvent)
      mockTeamsService.assertEventManagementAccess.mockRejectedValueOnce(
        new ForbiddenException('nope'),
      )

      await expect(service.cancel('evt-1', 'other-user')).rejects.toThrow(ForbiddenException)
      expect(mockPrisma.event.update).not.toHaveBeenCalled()
    })

    it('throws BadRequestException when event is already cancelled', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({
        ...baseEvent,
        cancelledAt: new Date(),
      })

      await expect(service.cancel('evt-1', 'user-1')).rejects.toThrow(BadRequestException)
    })

    it('soft-cancels with the reason and tells the squad', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(baseEvent)
      const cancelled = {
        ...baseEvent,
        cancelledAt: new Date(),
        cancelReason: 'Pitch frozen',
      }
      mockPrisma.event.update.mockResolvedValue(cancelled)

      // A second coach, not the creator, cancels: that must be allowed.
      const result = await service.cancel('evt-1', 'coach-2', '  Pitch frozen  ')

      expect(mockTeamsService.assertEventManagementAccess).toHaveBeenCalledWith(
        'coach-2',
        'team-1',
      )
      expect(mockPrisma.event.update).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: { cancelledAt: expect.any(Date), cancelReason: 'Pitch frozen' },
      })
      expect(result.cancelledAt).toBeTruthy()

      // Everyone finds out three ways: live refresh, push, and a notice in
      // the team channel.
      expect(mockEventsGateway.emitEventUpsert).toHaveBeenCalledWith('team-1', 'evt-1')
      expect(mockPushService.sendToTeamRendered).toHaveBeenCalledWith(
        'team-1',
        expect.any(Function),
        expect.objectContaining({ type: 'event_cancelled', eventId: 'evt-1', clubId: 'club-1' }),
        'coach-2',
        expect.objectContaining({ clubId: 'club-1', category: 'events' }),
      )
      const render = mockPushService.sendToTeamRendered.mock.calls[0][1]
      expect(render('de').body).toMatch(/^Abgesagt: Training am .* – Pitch frozen$/)
      expect(mockChatService.postSystemNotice).toHaveBeenCalledWith(
        expect.objectContaining({
          teamId: 'team-1',
          clubId: 'club-1',
          actorId: 'coach-2',
          content: expect.stringContaining('Pitch frozen'),
        }),
      )
    })

    it('stores no reason when none is given', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(baseEvent)
      mockPrisma.event.update.mockResolvedValue({ ...baseEvent, cancelledAt: new Date() })

      await service.cancel('evt-1', 'user-1')

      expect(mockPrisma.event.update).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: { cancelledAt: expect.any(Date), cancelReason: null },
      })
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
          { role: 'PLAYER', user: { id: 'user-2' } },
          { role: 'PLAYER', user: { id: 'user-3' } },
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
        expect.objectContaining({
          type: 'event_rsvp_reminder',
          eventId: 'evt-1',
          clubId: 'club-1',
        }),
        { clubId: 'club-1' },
      )
      expect(mockPrisma.event.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            team: expect.objectContaining({
              include: expect.objectContaining({
                access: expect.objectContaining({
                  where: expect.objectContaining({
                    status: 'ACTIVE',
                    role: 'PLAYER',
                    OR: [{ loanEndDate: null }, { loanEndDate: { gt: expect.any(Date) } }],
                  }),
                }),
              }),
            }),
          }),
        }),
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
      expect(mockPushService.sendToUser).toHaveBeenCalledWith(
        'user-3',
        expect.any(String),
        expect.any(String),
        expect.any(Object),
        expect.any(Object),
      )
      expect(result.sent).toBe(1)
    })

    it('does not send RSVP nudges to non-player team roles', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({
        ...baseEvent,
        team: {
          access: [
            { role: 'PLAYER', user: { id: 'player-1' } },
            { role: 'COACH', user: { id: 'coach-1' } },
            { role: 'PARENT', user: { id: 'parent-1' } },
          ],
        },
      })
      mockPrisma.rsvp.findMany.mockResolvedValue([])
      mockPrisma.event.updateMany.mockResolvedValue({ count: 1 })

      const result = await service.remindRsvp('club-1', 'evt-1', 'user-1')

      expect(mockPushService.sendToUser).toHaveBeenCalledTimes(1)
      expect(mockPushService.sendToUser).toHaveBeenCalledWith(
        'player-1',
        expect.any(String),
        expect.any(String),
        expect.any(Object),
        expect.any(Object),
      )
      expect(result.sent).toBe(1)
    })

    it('returns actual sent count and clears cooldown claim when all pushes fail', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(baseEvent)
      mockPrisma.rsvp.findMany.mockResolvedValue([])
      mockPrisma.event.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 })
      mockPushService.sendToUser.mockRejectedValue(new Error('push unavailable'))

      const result = await service.remindRsvp('club-1', 'evt-1', 'user-1')

      expect(result.sent).toBe(0)
      expect(mockPrisma.event.updateMany).toHaveBeenLastCalledWith({
        where: {
          id: 'evt-1',
          clubId: 'club-1',
          lastRsvpReminderAt: expect.any(Date),
        },
        data: { lastRsvpReminderAt: null },
      })
    })

    it('only clears the RSVP cooldown claim owned by the failed send attempt', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(baseEvent)
      mockPrisma.rsvp.findMany.mockResolvedValue([])
      mockPrisma.event.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 })
      mockPushService.sendToUser.mockRejectedValue(new Error('push unavailable'))

      await service.remindRsvp('club-1', 'evt-1', 'user-1')

      const claimCall = mockPrisma.event.updateMany.mock.calls[0]?.[0]
      const cleanupCall = mockPrisma.event.updateMany.mock.calls[1]?.[0]
      expect(cleanupCall).toEqual({
        where: {
          id: 'evt-1',
          clubId: 'club-1',
          lastRsvpReminderAt: claimCall.data.lastRsvpReminderAt,
        },
        data: { lastRsvpReminderAt: null },
      })
    })

    it('returns sent: 0 when all members have RSVPed', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(baseEvent)
      mockPrisma.rsvp.findMany.mockResolvedValue([{ userId: 'user-2' }, { userId: 'user-3' }])

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
            { role: 'PLAYER', user: { id: 'user-1' } }, // requester — should be excluded
            { role: 'PLAYER', user: { id: 'user-2' } },
          ],
        },
      })
      mockPrisma.rsvp.findMany.mockResolvedValue([])
      mockPrisma.event.updateMany.mockResolvedValue({ count: 1 }) // atomic claim succeeds

      const result = await service.remindRsvp('club-1', 'evt-1', 'user-1')

      expect(mockPushService.sendToUser).toHaveBeenCalledTimes(1)
      expect(mockPushService.sendToUser).toHaveBeenCalledWith(
        'user-2',
        expect.any(String),
        expect.any(String),
        expect.any(Object),
        expect.any(Object),
      )
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
            { role: 'PLAYER', user: { id: 'user-2' } },
            { role: 'PLAYER', user: { id: 'user-2' } },
            { role: 'PLAYER', user: { id: 'user-3' } },
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

      await expect(service.checkIn('club-1', 'missing', 'user-1')).rejects.toThrow(
        NotFoundException,
      )
    })

    it('throws BadRequestException when event is cancelled', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({ ...baseEvent, cancelledAt: new Date() })

      await expect(service.checkIn('club-1', 'evt-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      )
    })

    it('throws BadRequestException when before check-in window (> 2h before start)', async () => {
      // Event is 3 hours in the future — outside the 2h window
      mockPrisma.event.findUnique.mockResolvedValue({
        ...baseEvent,
        date: new Date(Date.now() + 3 * 60 * 60 * 1000 + 60_000),
      })

      await expect(service.checkIn('club-1', 'evt-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      )
    })

    it('throws BadRequestException when after check-in window (> 3h after start)', async () => {
      // Event ended 4 hours ago — outside the 3h post-start window
      mockPrisma.event.findUnique.mockResolvedValue({
        ...baseEvent,
        date: new Date(Date.now() - 4 * 60 * 60 * 1000),
      })

      await expect(service.checkIn('club-1', 'evt-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      )
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
