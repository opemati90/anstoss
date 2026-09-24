import { BadRequestException } from '@nestjs/common'
import { TeamAccessDeniedError } from '@anstoss/shared'
import { EventsService } from './events.service'

/**
 * Adversarial-review fixes (2026-09-24): Kader drop-outs (H1), viewer role
 * (H3), localized squad pushes (M2), multi-weekday "this and following" (M3),
 * draft Kader privacy (L2), past-event edits (L6), Treffpunkt check (L8),
 * derived titles (L7 / M6) and squad-only reply counts.
 */
function setup() {
  const prisma: any = {
    event: {
      create: jest.fn(async ({ data }: any) => ({ id: 'evt-new', createdAt: new Date(), ...data })),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(async ({ data }: any) => ({
        id: 'evt-1',
        teamId: 'team-1',
        clubId: 'club-1',
        title: 'Training',
        type: 'TRAINING',
        date: new Date(),
        ...data,
      })),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn().mockResolvedValue(1),
    },
    eventSeries: {
      update: jest.fn().mockResolvedValue({ id: 'series-1' }),
      findUnique: jest.fn(),
    },
    rsvp: {
      upsert: jest.fn(async ({ create }: any) => create),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    teamAccess: {
      findFirst: jest.fn().mockResolvedValue({ id: 'access-1' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    teamMember: { findMany: jest.fn().mockResolvedValue([]) },
    guardianRelationship: {
      findFirst: jest.fn().mockResolvedValue({ id: 'g-1' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    eventReminderPreference: { upsert: jest.fn() },
    team: { findUnique: jest.fn().mockResolvedValue({ name: 'Erste' }) },
    user: {
      findUnique: jest.fn().mockResolvedValue({ name: 'Tim Weber' }),
      findMany: jest.fn(async ({ where }: any) =>
        where.id.in.map((id: string) => ({
          id,
          preferredLanguage: id === 'parent-tr' ? 'tr' : id === 'lukas' ? 'en' : 'de',
        })),
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
    sendToTeamRendered: jest.fn().mockResolvedValue(undefined),
    sendToUserLocalized: jest.fn().mockResolvedValue(undefined),
  }
  const service = new EventsService(
    prisma,
    teams as never,
    { getOverdueContributionsForUser: jest.fn().mockResolvedValue([]) } as never,
    push as never,
    { emitRsvpUpdate: jest.fn(), emitEventUpsert: jest.fn() } as never,
    { postSystemNotice: jest.fn().mockResolvedValue(undefined) } as never,
  )
  return { prisma, teams, push, service }
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

const player = (userId: string, name: string) => ({
  userId,
  user: { id: userId, name, avatarUrl: null },
})

describe('EventsService – review fixes', () => {
  describe('H1 Kader drop-outs', () => {
    const event = {
      id: 'evt-1',
      clubId: 'club-1',
      teamId: 'team-1',
      title: 'SV Babelsberg 03',
      type: 'MATCH',
      opponent: 'SV Babelsberg 03',
      homeAway: 'AWAY',
      autoTitle: true,
      date: new Date(Date.now() + 4 * 86400000),
      cancelledAt: null,
      createdById: 'coach-1',
      squadPublishedAt: new Date(),
    }

    it('an Absage takes the player out of the Kader and marks the drop-out', async () => {
      const { prisma, service } = setup()
      prisma.event.findUnique.mockResolvedValue(event)

      await service.upsertRsvp('evt-1', 'tim', 'NO', 'injured')

      expect(prisma.rsvp.updateMany).toHaveBeenCalledWith({
        where: { eventId: 'evt-1', userId: 'tim', nominated: true },
        data: { nominated: false, squadDroppedAt: expect.any(Date) },
      })
      // The flag is reset before the answer is stored.
      expect(prisma.rsvp.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.rsvp.upsert.mock.invocationCallOrder[0],
      )
    })

    it('a Zusage does not touch the nomination', async () => {
      const { prisma, service } = setup()
      prisma.event.findUnique.mockResolvedValue(event)
      await service.upsertRsvp('evt-1', 'tim', 'YES')
      expect(prisma.rsvp.updateMany).not.toHaveBeenCalled()
    })

    it('never hands the client a nominated id that is not a candidate, and names the drop-outs', async () => {
      const { prisma, service } = setup()
      prisma.event.findFirst.mockResolvedValue(event)
      // Tim is still on the team but said Absage; Jonas left the team.
      prisma.teamAccess.findMany.mockResolvedValue([
        player('tim', 'Tim Weber'),
        player('lukas', 'Lukas Hoffmann'),
      ])
      const droppedAt = new Date('2026-10-09T18:00:00.000Z')
      prisma.rsvp.findMany.mockResolvedValue([
        {
          userId: 'tim',
          status: 'NO',
          reason: 'injured',
          nominated: false,
          squadDroppedAt: droppedAt,
          user: { name: 'Tim Weber' },
        },
        {
          userId: 'lukas',
          status: 'YES',
          reason: null,
          nominated: true,
          squadDroppedAt: null,
          user: { name: 'Lukas Hoffmann' },
        },
        {
          userId: 'jonas',
          status: 'YES',
          reason: null,
          nominated: true,
          squadDroppedAt: null,
          user: { name: 'Jonas Becker' },
        },
      ])

      const squad = await service.getSquad('club-1', 'evt-1', 'coach-1')

      expect(squad.nominatedUserIds).toEqual(['lukas'])
      expect(squad.dropouts).toEqual([
        {
          userId: 'tim',
          name: 'Tim Weber',
          cause: 'declined',
          reason: 'injured',
          at: droppedAt.toISOString(),
        },
        { userId: 'jonas', name: 'Jonas Becker', cause: 'left', reason: null, at: null },
      ])
    })

    it('saving the Kader with a stale id succeeds and clears the drop-out notice', async () => {
      const { prisma, service } = setup()
      prisma.event.findFirst.mockResolvedValue(event)
      prisma.teamAccess.findMany.mockResolvedValue([player('lukas', 'Lukas Hoffmann')])
      prisma.rsvp.findMany.mockResolvedValue([
        { userId: 'lukas', status: 'YES', reason: null, nominated: true, squadDroppedAt: null },
        { userId: 'jonas', status: 'YES', reason: null, nominated: true, squadDroppedAt: null },
      ])

      await expect(
        service.updateSquad('club-1', 'evt-1', 'coach-1', {
          userIds: ['lukas', 'jonas'],
          publish: true,
        }),
      ).resolves.toEqual(expect.objectContaining({ nominatedUserIds: ['lukas'] }))
      expect(prisma.rsvp.updateMany).toHaveBeenCalledWith({
        where: { eventId: 'evt-1', userId: { in: ['lukas'] } },
        data: { nominated: true, squadDroppedAt: null },
      })
      expect(prisma.rsvp.updateMany).toHaveBeenCalledWith({
        where: { eventId: 'evt-1', squadDroppedAt: { not: null } },
        data: { squadDroppedAt: null },
      })
    })

    it('the player who said Absage no longer reads "Du bist im Kader"', async () => {
      const { prisma, teams, service } = setup()
      teams.assertEventManagementAccess.mockRejectedValue(new TeamAccessDeniedError('no'))
      prisma.event.findFirst.mockResolvedValue({
        ...event,
        createdAt: new Date(),
        _count: { rsvps: 1, checkIns: 0, carpoolRides: 0 },
        rsvps: [
          // A stale flag from before the fix: still nominated, answer NO.
          {
            id: 'r1',
            userId: 'tim',
            status: 'NO',
            reason: null,
            note: null,
            nominated: true,
            updatedAt: new Date(),
            user: { id: 'tim', name: 'Tim Weber', avatarUrl: null },
          },
        ],
        checkIns: [],
        reminderPreferences: [],
        team: { id: 'team-1', name: 'Erste', _count: { access: 1 } },
        fixture: null,
        series: null,
        lineup: null,
      })
      prisma.teamAccess.findMany.mockResolvedValue([player('tim', 'Tim Weber')])

      const detail = await service.findById('club-1', 'evt-1', 'tim')
      expect(detail.myNominated).toBe(false)
      expect(detail.rsvps[0].nominated).toBe(false)
    })
  })

  describe('L2 draft Kader and Aufstellung', () => {
    const detailEvent = (published: boolean) => ({
      id: 'evt-1',
      clubId: 'club-1',
      teamId: 'team-1',
      title: 'SV Babelsberg 03',
      type: 'MATCH',
      date: new Date(Date.now() + 4 * 86400000),
      createdAt: new Date(),
      squadPublishedAt: published ? new Date() : null,
      _count: { rsvps: 1, checkIns: 0, carpoolRides: 0 },
      rsvps: [
        {
          id: 'r1',
          userId: 'tim',
          status: 'YES',
          reason: null,
          note: null,
          nominated: true,
          updatedAt: new Date(),
          user: { id: 'tim', name: 'Tim Weber', avatarUrl: null },
        },
      ],
      checkIns: [],
      reminderPreferences: [],
      team: { id: 'team-1', name: 'Erste', _count: { access: 1 } },
      fixture: null,
      series: null,
      lineup: { formation: '4-4-2', starters: [{ name: 'Tim Weber' }], bench: [] },
    })

    it('hides nominations and lineup from players until the Kader is published', async () => {
      const { prisma, teams, service } = setup()
      teams.assertEventManagementAccess.mockRejectedValue(new TeamAccessDeniedError('no'))
      prisma.teamAccess.findMany.mockResolvedValue([player('tim', 'Tim Weber')])

      prisma.event.findFirst.mockResolvedValue(detailEvent(false))
      const draft = await service.findById('club-1', 'evt-1', 'tim')
      expect(draft.myNominated).toBe(false)
      expect(draft.rsvps[0].nominated).toBe(false)
      expect(draft.lineup).toBeNull()

      prisma.event.findFirst.mockResolvedValue(detailEvent(true))
      const published = await service.findById('club-1', 'evt-1', 'tim')
      expect(published.myNominated).toBe(true)
      expect(published.lineup?.formation).toBe('4-4-2')
    })

    it('managers see the draft', async () => {
      const { prisma, service } = setup()
      prisma.teamAccess.findMany.mockResolvedValue([player('tim', 'Tim Weber')])
      prisma.event.findFirst.mockResolvedValue(detailEvent(false))
      const detail = await service.findById('club-1', 'evt-1', 'coach-1')
      expect(detail.rsvps[0].nominated).toBe(true)
      expect(detail.lineup?.formation).toBe('4-4-2')
    })

    it('GET lineup returns null to a player before publish', async () => {
      const { prisma, teams, service } = setup()
      teams.assertEventManagementAccess.mockRejectedValue(new TeamAccessDeniedError('no'))
      prisma.event.findFirst.mockResolvedValue({ ...detailEvent(false), fixture: null })
      await expect(service.getLineup('club-1', 'evt-1', 'tim')).resolves.toBeNull()
    })
  })

  describe('H3 viewer role', () => {
    it('a Spielertrainer (manager with a player row) is a player', async () => {
      const { prisma, service } = setup()
      prisma.event.findFirst.mockResolvedValue({
        id: 'evt-1',
        clubId: 'club-1',
        teamId: 'team-1',
        title: 'Training',
        type: 'TRAINING',
        date: new Date(Date.now() + 86400000),
        createdAt: new Date(),
        _count: { rsvps: 0, checkIns: 0, carpoolRides: 0 },
        rsvps: [],
        checkIns: [],
        reminderPreferences: [],
        team: { id: 'team-1', name: 'Erste', _count: { access: 0 } },
        fixture: null,
        series: null,
        lineup: null,
      })
      const detail = await service.findById('club-1', 'evt-1', 'coach-1')
      expect(prisma.teamAccess.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({ userId: 'coach-1', teamId: 'team-1', role: 'PLAYER' }),
        select: { id: true },
      })
      expect(detail.viewer).toEqual({ canManage: true, isPlayer: true, isGuardian: false })
    })
  })

  describe('squad-only reply counts', () => {
    it('does not count replies from coaches, trialists or inactive players', async () => {
      const { prisma, service } = setup()
      const date = new Date(Date.now() + 3 * 86400000)
      prisma.event.findMany.mockResolvedValue([
        {
          id: 'evt-1',
          teamId: 'team-1',
          clubId: 'club-1',
          title: 'Training',
          type: 'TRAINING',
          date,
          location: null,
          notes: null,
          createdById: 'coach-1',
          createdAt: date,
          archivedAt: null,
          _count: { rsvps: 4, checkIns: 0 },
          rsvps: [
            { userId: 'tim', status: 'YES', reason: null },
            { userId: 'coach-1', status: 'YES', reason: null },
            { userId: 'trial-1', status: 'MAYBE', reason: null },
            { userId: 'inactive-1', status: 'NO', reason: null },
          ],
          team: { id: 'team-1', name: 'Erste', _count: { access: 3 } },
        },
      ])
      // Squad query: tim and inactive-1 match role/phase; inactive-1 is INACTIVE.
      prisma.teamAccess.findMany.mockImplementation(async (args: any) =>
        args.where.userId?.in
          ? [
              { teamId: 'team-1', userId: 'tim' },
              { teamId: 'team-1', userId: 'inactive-1' },
            ]
          : [],
      )
      prisma.teamMember.findMany.mockResolvedValue([{ teamId: 'team-1', userId: 'inactive-1' }])

      const [item] = await service.listUpcoming('team-1', 'coach-1')

      const squadQuery = prisma.teamAccess.findMany.mock.calls.find(
        (c: any[]) => c[0].where.userId?.in,
      )[0]
      expect(squadQuery.where).toEqual(
        expect.objectContaining({ role: 'PLAYER', phase: 'FULL', status: 'ACTIVE' }),
      )
      expect(item).toEqual(
        expect.objectContaining({ responseCount: 1, yesCount: 1, maybeCount: 0, noCount: 0 }),
      )
      expect(item.myRsvp).toBe('YES') // the coach's own answer is still shown to them
      expect(item.readiness?.metrics.responseCount).toBe(1)
    })

    it('reminds only squad members, so the number matches the Offen list', async () => {
      const { prisma, push, service } = setup()
      prisma.event.findUnique.mockResolvedValue({
        id: 'evt-1',
        clubId: 'club-1',
        teamId: 'team-1',
        title: 'Training',
        type: 'TRAINING',
        autoTitle: true,
        date: new Date(Date.now() + 3 * 86400000),
        location: 'Sportplatz',
        cancelledAt: null,
        team: {
          access: [
            { role: 'PLAYER', user: { id: 'tim' } },
            { role: 'PLAYER', user: { id: 'inactive-1' } },
          ],
        },
      })
      prisma.teamMember.findMany.mockResolvedValue([{ userId: 'inactive-1' }])
      prisma.event.updateMany.mockResolvedValue({ count: 1 })

      await service.remindRsvp('club-1', 'evt-1', 'coach-1')

      const include = prisma.event.findUnique.mock.calls[0][0].include
      expect(include.team.include.access.where).toEqual(
        expect.objectContaining({ role: 'PLAYER', phase: 'FULL', status: 'ACTIVE' }),
      )
      expect(push.sendToUser).toHaveBeenCalledTimes(1)
      expect(push.sendToUser.mock.calls[0][0]).toBe('tim')
      expect(push.sendToUser.mock.calls[0][2]).toContain('Hast du schon zu- oder abgesagt?')
    })
  })

  describe('M2 squad push to guardians', () => {
    it('tells a parent "<child> ist im Kader" in the parent’s language with a local date', async () => {
      const { prisma, push, service } = setup()
      prisma.event.findFirst.mockResolvedValue({
        id: 'evt-1',
        clubId: 'club-1',
        teamId: 'team-1',
        title: 'SV Babelsberg 03',
        type: 'MATCH',
        opponent: 'SV Babelsberg 03',
        homeAway: 'HOME',
        autoTitle: true,
        date: new Date('2026-10-10T13:00:00.000Z'),
        cancelledAt: null,
        squadPublishedAt: null,
      })
      prisma.teamAccess.findMany.mockResolvedValue([player('mia', 'Mia Weber')])
      prisma.rsvp.findMany.mockResolvedValue([
        { userId: 'mia', status: 'YES', reason: null, nominated: false },
      ])
      prisma.guardianRelationship.findMany.mockResolvedValue([
        {
          parentUserId: 'parent-de',
          playerUserId: 'mia',
          childName: null,
          player: { name: 'Mia Weber' },
        },
        {
          parentUserId: 'parent-tr',
          playerUserId: 'mia',
          childName: null,
          player: { name: 'Mia Weber' },
        },
      ])

      await service.updateSquad('club-1', 'evt-1', 'coach-1', { userIds: ['mia'], publish: true })
      await flush()

      const byUser = Object.fromEntries(push.sendToUser.mock.calls.map((c: any[]) => [c[0], c]))
      expect(byUser.mia[1]).toBe('Heimspiel gegen SV Babelsberg 03')
      expect(byUser.mia[2]).toBe(
        'Du bist im Kader für Heimspiel gegen SV Babelsberg 03 am Sa., 10.10.',
      )
      expect(byUser['parent-de'][2]).toBe(
        'Mia ist im Kader für Heimspiel gegen SV Babelsberg 03 am Sa., 10.10.',
      )
      expect(byUser['parent-de'][2]).not.toContain('Du bist')
      expect(byUser['parent-tr'][1]).toBe('İç saha: SV Babelsberg 03')
      expect(byUser['parent-tr'][2]).toMatch(
        /^Mia kadroya seçildi\. İç saha: SV Babelsberg 03, 10.10 Cmt\.$/,
      )
    })
  })

  describe('M3 "this and following" in a Di + Do series', () => {
    const tue = new Date('2026-10-06T17:00:00.000Z') // Tue 19:00 Berlin
    const base = {
      id: 'evt-1',
      clubId: 'club-1',
      teamId: 'team-1',
      title: 'Training',
      type: 'TRAINING',
      autoTitle: true,
      seriesId: 'series-1',
      date: tue,
      meetingAt: null,
      cancelledAt: null,
      location: null,
      meetingPoint: null,
    }
    const later = [
      { id: 'thu-1', date: new Date('2026-10-08T17:00:00.000Z'), meetingAt: null },
      { id: 'tue-2', date: new Date('2026-10-13T17:00:00.000Z'), meetingAt: null },
      { id: 'thu-2', date: new Date('2026-10-15T17:00:00.000Z'), meetingAt: null },
    ]

    it('moving Tuesday to Wednesday shifts only Tuesdays and rewrites the weekdays', async () => {
      const { prisma, service } = setup()
      prisma.event.findUnique.mockResolvedValue(base)
      prisma.event.findMany.mockResolvedValue(later)
      prisma.eventSeries.findUnique.mockResolvedValue({
        startsAt: tue,
        until: new Date('2026-10-15T21:00:00.000Z'),
        weekdays: [2, 4],
      })

      const wed = new Date('2026-10-07T17:00:00.000Z')
      await service.update('evt-1', 'coach-1', { date: wed }, 'following')

      const rowUpdate = (id: string) =>
        prisma.event.update.mock.calls.find((c: any[]) => c[0].where.id === id)?.[0].data
      expect(rowUpdate('tue-2')).toEqual(
        expect.objectContaining({
          date: new Date('2026-10-14T17:00:00.000Z'),
          rescheduledAt: expect.any(Date),
        }),
      )
      expect(rowUpdate('thu-1')).not.toHaveProperty('date')
      expect(rowUpdate('thu-2')).not.toHaveProperty('date')
      expect(prisma.eventSeries.update).toHaveBeenCalledWith({
        where: { id: 'series-1' },
        data: expect.objectContaining({ weekdays: [3, 4] }),
      })
    })

    it('a new time (same weekday) applies to every weekday', async () => {
      const { prisma, service } = setup()
      prisma.event.findUnique.mockResolvedValue(base)
      prisma.event.findMany.mockResolvedValue(later)
      prisma.eventSeries.findUnique.mockResolvedValue({
        startsAt: tue,
        until: new Date('2026-10-15T21:00:00.000Z'),
        weekdays: [2, 4],
      })

      await service.update(
        'evt-1',
        'coach-1',
        { date: new Date('2026-10-06T16:30:00.000Z') },
        'following',
      )

      const dates = prisma.event.update.mock.calls
        .filter((c: any[]) => c[0].where.id !== 'evt-1')
        .map((c: any[]) => c[0].data.date.toISOString())
      expect(dates).toEqual([
        '2026-10-08T16:30:00.000Z',
        '2026-10-13T16:30:00.000Z',
        '2026-10-15T16:30:00.000Z',
      ])
      expect(prisma.eventSeries.update.mock.calls[0][0].data).not.toHaveProperty('weekdays')
    })

    it('a place-only edit is one updateMany, inside a transaction with a timeout (M4)', async () => {
      const { prisma, service } = setup()
      prisma.event.findUnique.mockResolvedValue(base)
      prisma.event.findMany.mockResolvedValue(later)
      prisma.eventSeries.findUnique.mockResolvedValue({
        startsAt: tue,
        until: tue,
        weekdays: [2, 4],
      })

      await service.update('evt-1', 'coach-1', { location: 'Kunstrasen' }, 'following')

      expect(prisma.event.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['thu-1', 'tue-2', 'thu-2'] } },
        data: { location: 'Kunstrasen' },
      })
      expect(prisma.$transaction.mock.calls[0][1]).toEqual(
        expect.objectContaining({ timeout: 20_000 }),
      )
    })
  })

  describe('L6 / L8 edits', () => {
    const past = {
      id: 'evt-1',
      clubId: 'club-1',
      teamId: 'team-1',
      title: 'SV Babelsberg 03',
      type: 'MATCH',
      opponent: 'SV Babelsberg 03',
      homeAway: 'AWAY',
      autoTitle: true,
      date: new Date(Date.now() - 2 * 86400000),
      meetingAt: null,
      cancelledAt: null,
      location: 'Sportplatz Babelsberg',
      notes: 'Alt',
    }

    it('lets a coach correct a past match and clear its place', async () => {
      const { prisma, service } = setup()
      prisma.event.findUnique.mockResolvedValue(past)
      await service.update('evt-1', 'coach-1', { location: null, notes: 'Ergebnis 2:1' })
      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: { location: null, notes: 'Ergebnis 2:1' },
      })
    })

    it('an empty place string clears it too', async () => {
      const { prisma, service } = setup()
      prisma.event.findUnique.mockResolvedValue(past)
      await service.update('evt-1', 'coach-1', { location: '  ' })
      expect(prisma.event.update.mock.calls[0][0].data).toEqual({ location: null })
    })

    it('refuses moving an upcoming event into the past', async () => {
      const { prisma, service } = setup()
      prisma.event.findUnique.mockResolvedValue({ ...past, date: new Date(Date.now() + 86400000) })
      await expect(
        service.update('evt-1', 'coach-1', { date: new Date(Date.now() - 86400000) }),
      ).rejects.toThrow(BadRequestException)
    })

    it('checks a new Treffpunkt against the stored kickoff (L8)', async () => {
      const { prisma, service } = setup()
      const kickoff = new Date(Date.now() + 86400000)
      prisma.event.findUnique.mockResolvedValue({ ...past, date: kickoff })
      await expect(
        service.update('evt-1', 'coach-1', { meetingAt: new Date(kickoff.getTime() + 60000) }),
      ).rejects.toThrow('Meeting time must be before the start')
      expect(prisma.event.update).not.toHaveBeenCalled()
    })
  })

  describe('L7 / M6 derived titles', () => {
    it('stores a match as the opponent with autoTitle, also for an old "@ X" client', async () => {
      const { prisma, service } = setup()
      await service.create({
        title: '@ SV Babelsberg 03',
        type: 'MATCH',
        date: new Date(Date.now() + 86400000),
        teamId: 'team-1',
        createdById: 'coach-1',
        opponent: 'SV Babelsberg 03',
        homeAway: 'AWAY',
      })
      expect(prisma.event.create.mock.calls[0][0].data).toEqual(
        expect.objectContaining({ title: 'SV Babelsberg 03', autoTitle: true }),
      )
    })

    it('stores a Training without a title as a derived title, not in the coach’s language', async () => {
      const { prisma, service } = setup()
      await service.create({
        title: 'Allenamento',
        type: 'TRAINING',
        date: new Date(Date.now() + 86400000),
        teamId: 'team-1',
        createdById: 'coach-1',
      })
      expect(prisma.event.create.mock.calls[0][0].data).toEqual(
        expect.objectContaining({ title: 'Training', autoTitle: true }),
      )
    })

    it('keeps a typed title and refuses an OTHER event without one', async () => {
      const { prisma, service } = setup()
      await service.create({
        title: 'Weihnachtsfeier',
        type: 'OTHER',
        date: new Date(Date.now() + 86400000),
        teamId: 'team-1',
        createdById: 'coach-1',
      })
      expect(prisma.event.create.mock.calls[0][0].data).toEqual(
        expect.objectContaining({ title: 'Weihnachtsfeier', autoTitle: false }),
      )
      await expect(
        service.create({
          title: null,
          type: 'OTHER',
          date: new Date(Date.now() + 86400000),
          teamId: 'team-1',
          createdById: 'coach-1',
        }),
      ).rejects.toThrow(BadRequestException)
    })

    it('a derived match title follows a new opponent on edit', async () => {
      const { prisma, service } = setup()
      prisma.event.findUnique.mockResolvedValue({
        id: 'evt-1',
        clubId: 'club-1',
        teamId: 'team-1',
        title: 'SV Babelsberg 03',
        type: 'MATCH',
        opponent: 'SV Babelsberg 03',
        autoTitle: true,
        date: new Date(Date.now() + 86400000),
        cancelledAt: null,
      })
      await service.update('evt-1', 'coach-1', { opponent: 'FC Stahl Brandenburg' })
      expect(prisma.event.update.mock.calls[0][0].data).toEqual(
        expect.objectContaining({
          title: 'FC Stahl Brandenburg',
          autoTitle: true,
          opponent: 'FC Stahl Brandenburg',
        }),
      )
    })
  })
})
