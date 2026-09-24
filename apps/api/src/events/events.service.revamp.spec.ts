import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { TeamAccessDeniedError } from '@anstoss/shared'
import { EventsService } from './events.service'

/**
 * Events revamp (2026-09): multi-weekday series, matchday logistics,
 * per-child parent RSVPs, Kader nomination and event-keyed lineups.
 */
function setup() {
  let n = 0
  const created: any[] = []
  const prisma: any = {
    event: {
      create: jest.fn(async ({ data }: any) => ({ id: `evt-${++n}`, createdAt: new Date(), ...data })),
      createMany: jest.fn(async ({ data }: any) => {
        created.push(...data.map((row: any) => ({ id: `evt-${++n}`, createdAt: new Date(), ...row })))
        return { count: data.length }
      }),
      findMany: jest.fn(async (args: any) =>
        args?.where?.seriesId && !args?.where?.id
          ? created.filter((row) => row.seriesId === args.where.seriesId)
          : [],
      ),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(async ({ data }: any) => ({ id: 'evt-1', teamId: 'team-1', clubId: 'club-1', title: 'T', date: new Date(), ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn().mockResolvedValue(1),
    },
    eventSeries: {
      create: jest.fn(async ({ data }: any) => ({ id: 'series-1', ...data })),
      update: jest.fn().mockResolvedValue({ id: 'series-1' }),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    rsvp: {
      upsert: jest.fn(async ({ create }: any) => create),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    teamAccess: {
      findFirst: jest.fn().mockResolvedValue({ id: 'access-1' }),
      findMany: jest.fn(async (args: any) =>
        args?.where?.userId?.in
          ? args.where.userId.in.map((userId: string) => ({
              teamId: args.where.teamId?.in?.[0] ?? args.where.teamId,
              userId,
            }))
          : [],
      ),
    },
    teamMember: { findMany: jest.fn().mockResolvedValue([]) },
    guardianRelationship: {
      findFirst: jest.fn().mockResolvedValue({ id: 'g-1' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    eventReminderPreference: { upsert: jest.fn() },
    fixtureOverlay: { upsert: jest.fn().mockResolvedValue({}) },
    team: { findUnique: jest.fn().mockResolvedValue({ name: 'Erste' }) },
    user: {
      findUnique: jest.fn().mockResolvedValue({ name: 'Tim Weber' }),
      findMany: jest.fn(async ({ where }: any) =>
        (where?.id?.in ?? []).map((id: string) => ({ id, preferredLanguage: 'de' })),
      ),
    },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  }
  const teams = {
    assertEventManagementAccess: jest.fn().mockResolvedValue({ team: { clubId: 'club-1' } }),
    assertReadableAccess: jest.fn().mockResolvedValue({}),
  }
  const push = {
    sendToUser: jest.fn().mockResolvedValue(undefined),
    sendToTeamLocalized: jest.fn().mockResolvedValue(undefined),
    sendToUserLocalized: jest.fn().mockResolvedValue(undefined),
    sendToTeamRendered: jest.fn().mockResolvedValue(undefined),
  }
  const gateway = { emitRsvpUpdate: jest.fn(), emitEventUpsert: jest.fn() }
  const chat = { postSystemNotice: jest.fn().mockResolvedValue(undefined) }
  const contributions = { getOverdueContributionsForUser: jest.fn().mockResolvedValue([]) }
  const service = new EventsService(
    prisma,
    teams as never,
    contributions as never,
    push as never,
    gateway as never,
    chat as never,
  )
  return { prisma, teams, push, service }
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

describe('EventsService – events revamp', () => {
  describe('createSeries with several weekdays', () => {
    it('creates Tuesday and Thursday sessions at the same Berlin time', async () => {
      const { service } = setup()
      // Tue 2026-10-06 19:00 Europe/Berlin (CEST) = 17:00Z.
      const first = new Date('2026-10-06T17:00:00.000Z')
      const until = new Date('2026-10-15T21:59:00.000Z')

      const { events } = await service.createSeries({
        title: 'Training',
        type: 'TRAINING',
        date: first,
        teamId: 'team-1',
        createdById: 'coach-1',
        intervalWeeks: 1,
        until,
        weekdays: [4, 2],
      })

      expect(events.map((e: any) => e.date.toISOString())).toEqual([
        '2026-10-06T17:00:00.000Z',
        '2026-10-08T17:00:00.000Z',
        '2026-10-13T17:00:00.000Z',
        '2026-10-15T17:00:00.000Z',
      ])
    })

    it('keeps 19:00 wall time across the end of daylight saving time', async () => {
      const { service } = setup()
      const first = new Date('2026-10-20T17:00:00.000Z') // Tue 19:00 CEST
      const { events } = await service.createSeries({
        title: 'Training',
        type: 'TRAINING',
        date: first,
        teamId: 'team-1',
        createdById: 'coach-1',
        intervalWeeks: 1,
        until: new Date('2026-10-29T22:00:00.000Z'),
        weekdays: [2, 4],
      })
      // DST ends 25.10.: 19:00 CET = 18:00Z.
      expect(events.map((e: any) => e.date.toISOString())).toEqual([
        '2026-10-20T17:00:00.000Z',
        '2026-10-22T17:00:00.000Z',
        '2026-10-27T18:00:00.000Z',
        '2026-10-29T18:00:00.000Z',
      ])
    })

    it('stores the weekdays and gives every occurrence the same meeting offset and logistics', async () => {
      const { prisma, service } = setup()
      const first = new Date('2026-10-06T17:00:00.000Z')
      const { events } = await service.createSeries({
        title: 'Training',
        type: 'TRAINING',
        date: first,
        teamId: 'team-1',
        createdById: 'coach-1',
        intervalWeeks: 2,
        until: new Date('2026-10-22T20:00:00.000Z'),
        weekdays: [2, 4],
        meetingAt: new Date(first.getTime() - 15 * 60000),
        meetingPoint: 'Kabine 2',
        durationMin: 90,
      })

      expect(prisma.eventSeries.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ weekdays: [2, 4], meetingOffsetMin: 15, durationMin: 90 }),
      })
      // Every other week: 06., 08., 20., 22.
      expect(events).toHaveLength(4)
      for (const event of events as any[]) {
        expect(event.meetingAt.getTime()).toBe(event.date.getTime() - 15 * 60000)
        expect(event.meetingPoint).toBe('Kabine 2')
        expect(event.durationMin).toBe(90)
      }
    })

    it('allows 52 weeks per weekday but rejects more than a year', async () => {
      const { service } = setup()
      await expect(
        service.createSeries({
          title: 'Training',
          type: 'TRAINING',
          date: new Date('2026-10-06T17:00:00.000Z'),
          teamId: 'team-1',
          createdById: 'coach-1',
          intervalWeeks: 1,
          until: new Date('2027-10-20T17:00:00.000Z'),
          weekdays: [2, 4],
        }),
      ).rejects.toThrow(BadRequestException)
    })
  })

  describe('create with logistics', () => {
    it('persists opponent, home/away, Treffpunkt and carpool', async () => {
      const { prisma, service } = setup()
      const date = new Date('2026-10-11T13:00:00.000Z')
      const meetingAt = new Date('2026-10-11T12:00:00.000Z')
      await service.create({
        title: '@ SV Babelsberg 03',
        type: 'MATCH',
        date,
        teamId: 'team-1',
        createdById: 'coach-1',
        opponent: ' SV Babelsberg 03 ',
        homeAway: 'AWAY',
        meetingAt,
        meetingPoint: 'Parkplatz Vereinsheim',
        carpoolEnabled: true,
      })

      expect(prisma.event.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          opponent: 'SV Babelsberg 03',
          homeAway: 'AWAY',
          meetingAt,
          meetingPoint: 'Parkplatz Vereinsheim',
          carpoolEnabled: true,
        }),
      })
    })
  })

  describe('update – meeting offset on "this and following"', () => {
    it('applies the new Treffpunkt offset to later occurrences', async () => {
      const { prisma, service } = setup()
      const date = new Date('2026-10-06T17:00:00.000Z')
      prisma.event.findUnique.mockResolvedValue({
        id: 'evt-1',
        clubId: 'club-1',
        teamId: 'team-1',
        seriesId: 'series-1',
        date,
        meetingAt: null,
        cancelledAt: null,
      })
      const later = new Date('2026-10-08T17:00:00.000Z')
      prisma.event.findMany.mockResolvedValue([{ id: 'evt-2', date: later, meetingAt: null }])

      await service.update(
        'evt-1',
        'coach-1',
        { meetingAt: new Date(date.getTime() - 30 * 60000) },
        'following',
      )

      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: 'evt-2' },
        data: expect.objectContaining({ meetingAt: new Date(later.getTime() - 30 * 60000) }),
      })
      expect(prisma.eventSeries.update).toHaveBeenCalledWith({
        where: { id: 'series-1' },
        data: expect.objectContaining({ meetingOffsetMin: 30 }),
      })
    })
  })

  describe('upsertRsvp – parents', () => {
    const event = {
      id: 'evt-1',
      clubId: 'club-1',
      teamId: 'team-1',
      date: new Date(Date.now() + 5 * 86400000),
      cancelledAt: null,
      createdById: 'coach-1',
      title: 'Training',
    }

    it('requires childUserId when the parent guards two children on the team', async () => {
      const { prisma, service } = setup()
      prisma.event.findUnique.mockResolvedValue(event)
      prisma.teamAccess.findFirst.mockResolvedValue(null)
      prisma.guardianRelationship.findMany.mockResolvedValue([
        { playerUserId: 'mia' },
        { playerUserId: 'ben' },
      ])

      await expect(service.upsertRsvp('evt-1', 'parent-1', 'YES')).rejects.toThrow(
        'childUserId is required',
      )
      expect(prisma.rsvp.upsert).not.toHaveBeenCalled()
    })

    it('answers for the only child on the team', async () => {
      const { prisma, service } = setup()
      prisma.event.findUnique.mockResolvedValue(event)
      prisma.teamAccess.findFirst.mockImplementation(async ({ where }: any) =>
        where.userId === 'mia' ? { id: 'a-mia' } : null,
      )
      prisma.guardianRelationship.findMany.mockResolvedValue([{ playerUserId: 'mia' }])

      await service.upsertRsvp('evt-1', 'parent-1', 'NO', 'sick', ' Fieber ')

      expect(prisma.rsvp.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { eventId_userId: { eventId: 'evt-1', userId: 'mia' } },
          create: expect.objectContaining({ userId: 'mia', status: 'NO', reason: 'sick', note: 'Fieber' }),
        }),
      )
    })

    it('answers for the named child after the guardian check', async () => {
      const { prisma, service } = setup()
      prisma.event.findUnique.mockResolvedValue(event)
      await service.upsertRsvp('evt-1', 'parent-1', 'YES', undefined, undefined, 'ben')

      expect(prisma.guardianRelationship.findFirst).toHaveBeenCalledWith({
        where: { parentUserId: 'parent-1', playerUserId: 'ben' },
      })
      expect(prisma.rsvp.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { eventId_userId: { eventId: 'evt-1', userId: 'ben' } } }),
      )
    })

    it('refuses a child the caller does not guard', async () => {
      const { prisma, service } = setup()
      prisma.guardianRelationship.findFirst.mockResolvedValue(null)
      await expect(
        service.upsertRsvp('evt-1', 'parent-1', 'YES', undefined, undefined, 'stranger'),
      ).rejects.toThrow(ForbiddenException)
    })
  })

  describe('readiness – suspension reason', () => {
    it('counts a "suspended" absence as a medical/disciplinary risk', async () => {
      const { prisma, service } = setup()
      prisma.event.findFirst.mockResolvedValue({
        id: 'evt-1',
        clubId: 'club-1',
        teamId: 'team-1',
        type: 'MATCH',
        date: new Date(Date.now() + 3 * 86400000),
        createdAt: new Date(),
        _count: { rsvps: 1, checkIns: 0, carpoolRides: 0 },
        rsvps: [
          {
            id: 'r1',
            userId: 'p1',
            status: 'NO',
            reason: 'suspended',
            note: null,
            nominated: false,
            updatedAt: new Date(),
            user: { id: 'p1', name: 'Lukas Hoffmann', avatarUrl: null },
          },
        ],
        checkIns: [],
        reminderPreferences: [],
        team: { id: 'team-1', name: 'Erste', _count: { access: 14 } },
        fixture: null,
        series: null,
        lineup: null,
      })
      prisma.teamAccess.findMany.mockResolvedValue([
        { userId: 'p1', user: { id: 'p1', name: 'Lukas Hoffmann', avatarUrl: null } },
      ])

      const detail = await service.findById('club-1', 'evt-1', 'coach-1')
      expect(detail.readiness?.metrics.suspensionRiskCount).toBe(1)
    })
  })

  describe('findById – members, children and viewer', () => {
    const baseEvent = () => ({
      id: 'evt-1',
      clubId: 'club-1',
      teamId: 'team-1',
      type: 'MATCH',
      date: new Date(Date.now() + 3 * 86400000),
      createdAt: new Date(),
      _count: { rsvps: 2, checkIns: 0, carpoolRides: 2 },
      rsvps: [
        {
          id: 'r1',
          userId: 'mia',
          status: 'NO',
          reason: 'sick',
          note: 'Fieber',
          nominated: false,
          updatedAt: new Date(),
          user: { id: 'mia', name: 'Mia Weber', avatarUrl: null },
        },
        {
          id: 'r2',
          userId: 'tim',
          status: 'NO',
          reason: 'work',
          note: 'Schicht',
          nominated: false,
          updatedAt: new Date(),
          user: { id: 'tim', name: 'Tim Weber', avatarUrl: null },
        },
      ],
      checkIns: [],
      reminderPreferences: [],
      team: { id: 'team-1', name: 'U11', _count: { access: 2 } },
      fixture: null,
      series: null,
      squadPublishedAt: new Date(),
      lineup: { formation: '4-3-3', starters: [{ name: 'Mia Weber', userId: 'mia' }], bench: [] },
    })

    it('returns members, the parent’s children and hides other reasons', async () => {
      const { prisma, teams, service } = setup()
      teams.assertEventManagementAccess.mockRejectedValue(new TeamAccessDeniedError('no'))
      prisma.event.findFirst.mockResolvedValue(baseEvent())
      // The parent has no player row on the team.
      prisma.teamAccess.findFirst.mockResolvedValue(null)
      prisma.teamAccess.findMany.mockResolvedValue([
        { userId: 'mia', user: { id: 'mia', name: 'Mia Weber', avatarUrl: null } },
        { userId: 'tim', user: { id: 'tim', name: 'Tim Weber', avatarUrl: null } },
      ])
      prisma.teamMember.findMany.mockResolvedValue([{ userId: 'mia', jerseyNumber: 7, position: 'MID' }])
      prisma.guardianRelationship.findMany.mockResolvedValue([
        { playerUserId: 'mia', childName: 'Mia', player: { name: 'Mia Weber' } },
      ])

      const detail = await service.findById('club-1', 'evt-1', 'parent-1')

      expect(detail.members).toEqual([
        expect.objectContaining({ userId: 'mia', jerseyNumber: 7, position: 'MID' }),
        expect.objectContaining({ userId: 'tim', jerseyNumber: null }),
      ])
      expect(detail.children).toEqual([
        expect.objectContaining({ userId: 'mia', name: 'Mia Weber', teamName: 'U11', rsvp: 'NO', reason: 'sick' }),
      ])
      expect(detail.viewer).toEqual({ canManage: false, isPlayer: false, isGuardian: true })
      const mia = detail.rsvps.find((r) => r.userId === 'mia')
      const tim = detail.rsvps.find((r) => r.userId === 'tim')
      expect(mia?.note).toBe('Fieber')
      expect(tim?.reason).toBeUndefined()
      expect(tim?.note).toBeUndefined()
      expect(detail.lineup?.formation).toBe('4-3-3')
      expect(detail.carpoolRideCount).toBe(2)
    })
  })

  describe('Kader', () => {
    const event = {
      id: 'evt-1',
      clubId: 'club-1',
      teamId: 'team-1',
      title: '@ SV Babelsberg 03',
      date: new Date('2026-10-11T13:00:00.000Z'),
      cancelledAt: null,
      squadPublishedAt: null as Date | null,
      fixtureId: null as string | null,
    }
    const players = [
      { userId: 'tim', user: { id: 'tim', name: 'Tim Weber', avatarUrl: null } },
      { userId: 'lukas', user: { id: 'lukas', name: 'Lukas Hoffmann', avatarUrl: null } },
      { userId: 'jonas', user: { id: 'jonas', name: 'Jonas Becker', avatarUrl: null } },
    ]

    it('lists yes/maybe players as candidates', async () => {
      const { prisma, service } = setup()
      prisma.event.findFirst.mockResolvedValue(event)
      prisma.teamAccess.findMany.mockResolvedValue(players)
      prisma.rsvp.findMany.mockResolvedValue([
        { userId: 'tim', status: 'YES', reason: null, nominated: true },
        { userId: 'lukas', status: 'MAYBE', reason: null, nominated: false },
        { userId: 'jonas', status: 'NO', reason: 'injured', nominated: false },
      ])

      const squad = await service.getSquad('club-1', 'evt-1', 'coach-1')
      expect(squad.candidates.map((c) => c.userId).sort()).toEqual(['lukas', 'tim'])
      expect(squad.nominatedUserIds).toEqual(['tim'])
    })

    it('drops a player who said no from the saved Kader instead of failing the save (H1)', async () => {
      const { prisma, service } = setup()
      prisma.event.findFirst.mockResolvedValue(event)
      prisma.teamAccess.findMany.mockResolvedValue(players)
      prisma.rsvp.findMany.mockResolvedValue([
        { userId: 'tim', status: 'YES', reason: null, nominated: true },
        { userId: 'jonas', status: 'NO', reason: 'injured', nominated: false },
      ])
      await service.updateSquad('club-1', 'evt-1', 'coach-1', { userIds: ['tim', 'jonas'] })
      expect(prisma.rsvp.updateMany).toHaveBeenCalledWith({
        where: { eventId: 'evt-1', userId: { in: ['tim'] } },
        data: { nominated: true, squadDroppedAt: null },
      })
      expect(prisma.rsvp.updateMany).toHaveBeenCalledWith({
        where: { eventId: 'evt-1', userId: { notIn: ['tim'] }, nominated: true },
        data: { nominated: false },
      })
    })

    it('publishing again only notifies newly nominated players and their guardians', async () => {
      const { prisma, push, service } = setup()
      prisma.event.findFirst.mockResolvedValue({ ...event, squadPublishedAt: new Date('2026-10-08') })
      prisma.teamAccess.findMany.mockResolvedValue(players)
      prisma.rsvp.findMany.mockResolvedValue([
        { userId: 'tim', status: 'YES', reason: null, nominated: true },
        { userId: 'lukas', status: 'YES', reason: null, nominated: false },
      ])
      prisma.guardianRelationship.findMany.mockResolvedValue([
        { parentUserId: 'parent-lukas', playerUserId: 'lukas', childName: null, player: { name: 'Lukas Hoffmann' } },
      ])

      await service.updateSquad('club-1', 'evt-1', 'coach-1', {
        userIds: ['tim', 'lukas'],
        publish: true,
      })
      await flush()

      expect(prisma.rsvp.updateMany).toHaveBeenCalledWith({
        where: { eventId: 'evt-1', userId: { in: ['tim', 'lukas'] } },
        data: { nominated: true, squadDroppedAt: null },
      })
      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: { squadPublishedAt: expect.any(Date) },
      })
      const recipients = push.sendToUser.mock.calls.map((call: any[]) => call[0]).sort()
      expect(recipients).toEqual(['lukas', 'parent-lukas'])
      expect(push.sendToUser.mock.calls.every((call: any[]) => call[3].type === 'event_squad')).toBe(true)
    })
  })

  describe('lineup', () => {
    it('stores the lineup on the event and mirrors it to the fixture overlay', async () => {
      const { prisma, service } = setup()
      prisma.event.findFirst.mockResolvedValue({
        id: 'evt-1',
        clubId: 'club-1',
        teamId: 'team-1',
        fixtureId: 'fx-1',
      })

      const saved = await service.saveLineup('club-1', 'evt-1', 'coach-1', {
        formation: '4-4-2',
        starters: [{ userId: 'tim', name: 'Tim Weber', number: 9, position: 'ATT', slotId: 'ST1' }],
        bench: [],
      })

      expect(saved.starters[0]).toEqual({
        userId: 'tim',
        number: 9,
        name: 'Tim Weber',
        position: 'ATT',
        slotId: 'ST1',
      })
      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: { lineup: expect.objectContaining({ formation: '4-4-2' }) },
      })
      expect(prisma.fixtureOverlay.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { fixtureId: 'fx-1' },
          create: expect.objectContaining({
            clubId: 'club-1',
            lineupFormation: '4-4-2',
            lineup: {
              formation: '4-4-2',
              starters: [{ number: 9, name: 'Tim Weber', position: 'ATT' }],
              bench: [],
            },
          }),
        }),
      )
    })

    it('does not touch any overlay for a manual match', async () => {
      const { prisma, service } = setup()
      prisma.event.findFirst.mockResolvedValue({ id: 'evt-1', clubId: 'club-1', teamId: 'team-1', fixtureId: null })
      await service.saveLineup('club-1', 'evt-1', 'coach-1', {
        formation: '4-3-3',
        starters: [{ name: 'Tim Weber' }],
        bench: [],
      })
      expect(prisma.fixtureOverlay.upsert).not.toHaveBeenCalled()
    })
  })
})
