import { FussballService } from './fussball.service'

/**
 * Events revamp: an imported fixture becomes a MATCH event that carries its
 * opponent, home/away, fixture link and Treffpunkt as fields instead of a
 * German sentence in the title.
 */
function createService(existingEvent: Record<string, unknown> | null = null) {
  const prisma = {
    externalTeamLink: {
      findFirst: jest.fn().mockResolvedValue({ label: 'SV Albatros' }),
    },
    membership: {
      findFirst: jest.fn().mockResolvedValue({ userId: 'coach-1' }),
    },
    event: {
      findFirst: jest.fn().mockResolvedValue(existingEvent),
      create: jest.fn().mockResolvedValue({ id: 'evt-new' }),
      update: jest.fn(async ({ data }: any) => ({ ...existingEvent, ...data })),
    },
    team: { findUnique: jest.fn().mockResolvedValue({ name: 'Erste' }) },
    importedFixture: { findFirst: jest.fn() },
    fixtureOverlay: { update: jest.fn(), create: jest.fn() },
  }
  const push = { sendToTeamRendered: jest.fn().mockResolvedValue(undefined) }
  const teams = { assertManageAccess: jest.fn().mockResolvedValue({}), assertReadableAccess: jest.fn() }
  const service = new FussballService(
    prisma as never,
    teams as never,
    {} as never,
    {} as never,
    push as never,
    {} as never,
  )
  return { prisma, push, service }
}

const kickoffAt = new Date('2026-10-04T13:00:00.000Z')
const fixture = (homeTeam: string, awayTeam: string) => ({
  id: 'fx-1',
  clubId: 'club-1',
  teamId: 'team-1',
  teamLinkId: 'link-1',
  provider: 'FUSSBALL_PUBLIC_PAGE',
  externalMatchId: 'm-1',
  competition: 'Kreisliga A',
  kickoffAt,
  homeTeam,
  awayTeam,
  venueName: 'Sportplatz Babelsberg',
  pitchAddress: 'Karl-Liebknecht-Str. 90',
  resultHome: null,
  resultAway: null,
  status: 'SCHEDULED',
})

const importedNotes = 'Competition: Kreisliga A\nStatus: scheduled\nImported from FUSSBALL.DE (initial-import)'
/** An event as the previous sync left it. */
const existing = (overrides: Record<string, unknown> = {}) => ({
  id: 'evt-1',
  teamId: 'team-1',
  clubId: 'club-1',
  date: kickoffAt,
  title: 'SV Babelsberg 03',
  autoTitle: true,
  type: 'MATCH',
  opponent: 'SV Babelsberg 03',
  homeAway: 'AWAY',
  location: 'Sportplatz Babelsberg · Karl-Liebknecht-Str. 90',
  notes: importedNotes,
  meetingAt: null as Date | null,
  meetingPoint: null as string | null,
  cancelledAt: null,
  importedFields: {
    location: 'Sportplatz Babelsberg · Karl-Liebknecht-Str. 90',
    notes: importedNotes,
    meetingAt: null,
    meetingPoint: null,
  },
  ...overrides,
})

const sync = (service: FussballService, ...args: unknown[]) =>
  (service as unknown as { syncEventForFixture: (...a: unknown[]) => Promise<void> })
    .syncEventForFixture(...args)

describe('FussballService.syncEventForFixture', () => {
  it('creates an away match with opponent, fixture link and carpool open', async () => {
    const { prisma, service } = createService()
    const arrivalTime = new Date('2026-10-04T12:00:00.000Z')

    await sync(
      service,
      fixture('SV Babelsberg 03', 'SV Albatros'),
      { arrivalTime, meetingPoint: 'Parkplatz Vereinsheim' },
      'initial-import',
    )

    expect(prisma.event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'MATCH',
        // M6: the opponent plus a derived title, never "@ X".
        title: 'SV Babelsberg 03',
        autoTitle: true,
        opponent: 'SV Babelsberg 03',
        homeAway: 'AWAY',
        fixtureId: 'fx-1',
        meetingAt: arrivalTime,
        meetingPoint: 'Parkplatz Vereinsheim',
        carpoolEnabled: true,
      }),
    })
  })

  it('creates a home match without opening the carpool', async () => {
    const { prisma, service } = createService()

    await sync(service, fixture('SV Albatros', 'SV Babelsberg 03'), null, 'initial-import')

    expect(prisma.event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'SV Babelsberg 03',
        autoTitle: true,
        homeAway: 'HOME',
        meetingAt: null,
        carpoolEnabled: false,
      }),
    })
  })

  it('updates an existing event without touching the coach carpool choice', async () => {
    const { prisma, service } = createService({ ...existing(), carpoolEnabled: false })

    await sync(service, fixture('SV Babelsberg 03', 'SV Albatros'), null, 'refresh')

    expect(prisma.event.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ externalMatchKey: 'FUSSBALL_PUBLIC_PAGE:m-1' }, { fixtureId: 'fx-1' }] },
      }),
    )
    const { data } = prisma.event.update.mock.calls[0][0]
    expect(data).toEqual(
      expect.objectContaining({ opponent: 'SV Babelsberg 03', homeAway: 'AWAY', fixtureId: 'fx-1' }),
    )
    expect(data).not.toHaveProperty('carpoolEnabled')
    expect(prisma.event.create).not.toHaveBeenCalled()
  })

  describe('H2: a re-sync keeps what the coach set', () => {
    it('keeps a coach-set Treffpunkt, place and notes, refreshing only untouched fields', async () => {
      const coachMeeting = new Date('2026-10-04T11:45:00.000Z')
      const { prisma, service } = createService(
        existing({
          meetingAt: coachMeeting,
          meetingPoint: 'Parkplatz Vereinsheim',
          location: 'Kunstrasen hinten',
          notes: 'Schwarze Stutzen mitbringen',
        }),
      )
      const moved = { ...fixture('SV Babelsberg 03', 'SV Albatros'), venueName: 'Neuer Platz' }

      await sync(service, moved, null, 'venueName')

      const { data } = prisma.event.update.mock.calls[0][0]
      expect(data.meetingAt).toEqual(coachMeeting)
      expect(data.meetingPoint).toBe('Parkplatz Vereinsheim')
      expect(data.location).toBe('Kunstrasen hinten')
      expect(data.notes).toBe('Schwarze Stutzen mitbringen')
      expect(data.importedFields).toEqual(
        expect.objectContaining({ location: 'Neuer Platz · Karl-Liebknecht-Str. 90' }),
      )
    })

    it('refreshes a field the coach never touched', async () => {
      const { prisma, service } = createService(existing())
      const moved = { ...fixture('SV Babelsberg 03', 'SV Albatros'), venueName: 'Neuer Platz' }

      await sync(service, moved, null, 'venueName')

      expect(prisma.event.update.mock.calls[0][0].data.location).toBe(
        'Neuer Platz · Karl-Liebknecht-Str. 90',
      )
    })

    it('a moved kickoff reschedules, shifts the Treffpunkt and tells the team', async () => {
      const coachMeeting = new Date('2026-10-04T12:00:00.000Z') // 60 min before 13:00Z
      const { prisma, push, service } = createService(existing({ meetingAt: coachMeeting }))
      const later = new Date('2026-10-04T15:00:00.000Z')
      const future = { ...fixture('SV Babelsberg 03', 'SV Albatros'), kickoffAt: later }
      // Keep the kickoff in the future relative to the test clock.
      jest.useFakeTimers({ now: new Date('2026-09-30T10:00:00.000Z'), doNotFake: ['setImmediate', 'nextTick'] })
      try {
        await sync(service, future, null, 'kickoffAt')
        await new Promise((resolve) => setImmediate(resolve))
      } finally {
        jest.useRealTimers()
      }

      const { data } = prisma.event.update.mock.calls[0][0]
      expect(data.date).toEqual(later)
      expect(data.rescheduledAt).toBeInstanceOf(Date)
      expect(data.meetingAt).toEqual(new Date('2026-10-04T14:00:00.000Z'))
      expect(push.sendToTeamRendered).toHaveBeenCalledWith(
        'team-1',
        expect.any(Function),
        expect.objectContaining({ type: 'event_updated', eventId: 'evt-1' }),
        undefined,
        expect.objectContaining({ category: 'events' }),
      )
      const render = push.sendToTeamRendered.mock.calls[0][1]
      expect(render('de').body).toContain('Geändert: Auswärtsspiel bei SV Babelsberg 03 ist jetzt am')
    })

    it('an unchanged kickoff neither reschedules nor pushes', async () => {
      const { prisma, push, service } = createService(existing())
      await sync(service, fixture('SV Babelsberg 03', 'SV Albatros'), null, 'status')
      expect(prisma.event.update.mock.calls[0][0].data).not.toHaveProperty('rescheduledAt')
      expect(push.sendToTeamRendered).not.toHaveBeenCalled()
    })

    it('a Treffpunkt the coach sets on the fixture overlay wins', async () => {
      const { prisma, service } = createService(
        existing({ meetingPoint: 'Alter Treff', meetingAt: new Date('2026-10-04T12:00:00.000Z') }),
      )
      const arrival = new Date('2026-10-04T11:30:00.000Z')
      await sync(service, fixture('SV Babelsberg 03', 'SV Albatros'), null, 'overlay-update', undefined, {
        meetingAt: arrival,
        meetingPoint: 'Bahnhof',
      })
      const { data } = prisma.event.update.mock.calls[0][0]
      expect(data.meetingAt).toEqual(arrival)
      expect(data.meetingPoint).toBe('Bahnhof')
    })

    it('keeps a title the coach typed', async () => {
      const { prisma, service } = createService(existing({ title: 'Pokal: SV Babelsberg', autoTitle: false }))
      await sync(service, fixture('SV Babelsberg 03', 'SV Albatros'), null, 'status')
      expect(prisma.event.update.mock.calls[0][0].data).not.toHaveProperty('title')
    })
  })

  describe('L9: the fixture lineup save writes the event lineup', () => {
    it('stores the lineup on the linked event, keeping known userIds', async () => {
      const { prisma, service } = createService()
      prisma.importedFixture.findFirst.mockResolvedValue({
        ...fixture('SV Albatros', 'SV Babelsberg 03'),
        overlay: { id: 'ov-1', updatedAt: new Date() },
      })
      prisma.event.findFirst.mockResolvedValue({
        id: 'evt-1',
        lineup: { formation: '4-4-2', starters: [{ name: 'Tim Weber', userId: 'tim', slotId: 'ST1' }], bench: [] },
      })
      ;(service as any).getFixtureLineup = jest.fn().mockResolvedValue({})

      await service.saveFixtureLineup('coach-1', 'club-1', 'fx-1', {
        formation: '4-3-3',
        starters: [{ name: 'Tim Weber', number: 9, position: 'ST' }],
        bench: [{ name: 'Lukas Hoffmann', number: 14, position: 'MF' }],
      } as never)

      expect(prisma.event.findFirst).toHaveBeenCalledWith({
        where: { OR: [{ fixtureId: 'fx-1' }, { externalMatchKey: 'FUSSBALL_PUBLIC_PAGE:m-1' }] },
        select: { id: true, lineup: true },
      })
      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: {
          lineup: {
            formation: '4-3-3',
            starters: [{ userId: 'tim', number: 9, name: 'Tim Weber', position: 'ST', slotId: 'ST1' }],
            bench: [{ userId: null, number: 14, name: 'Lukas Hoffmann', position: 'MF', slotId: null }],
          },
        },
      })
    })
  })
})
