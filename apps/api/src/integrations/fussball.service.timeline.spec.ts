import { FussballService } from './fussball.service'

function createService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = {
    importedFixture: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    externalTeamLink: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    event: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    rosterSlot: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    ...prismaOverrides,
  }
  const teamsService = {
    assertReadableAccess: jest.fn().mockResolvedValue({}),
    assertManageAccess: jest.fn().mockResolvedValue({}),
  }
  const provider = {
    fetchMatchLineup: jest.fn().mockResolvedValue(null),
    fetchTeamPage: jest.fn(),
    fetchTeamBundle: jest.fn(),
  }
  const scraper = {
    isAvailable: jest.fn().mockReturnValue(true),
    getGame: jest.fn(),
  }

  const service = new FussballService(
    prisma as never,
    teamsService as never,
    provider as never,
    scraper as never,
    {} as never,
    {} as never,
  )

  return { prisma, teamsService, provider, scraper, service }
}

describe('FussballService licensed feed surfaces', () => {
  it('serves fixture timeline from licensed feed rawPayload', async () => {
    const { prisma, service, teamsService } = createService()
    prisma.importedFixture.findFirst.mockResolvedValue({
      id: 'fixture-1',
      teamId: 'team-1',
      status: 'LIVE',
      resultHome: 1,
      resultAway: 0,
      homeTeam: 'SV Beispiel',
      awayTeam: 'FC Test',
      rawPayload: {
        licensedFeed: {
          timeline: [
            {
              id: 'goal-12',
              minute: 12,
              kind: 'goal',
              side: 'home',
              player: 'Max Beispiel',
              detail: 'Header',
            },
          ],
        },
      },
    })

    const timeline = await service.getFixtureTimeline('user-1', 'fixture-1')

    expect(teamsService.assertReadableAccess).toHaveBeenCalledWith('user-1', 'team-1')
    expect(timeline).toEqual({
      status: 'live',
      minute: 12,
      scoreHome: 1,
      scoreAway: 0,
      events: [
        {
          id: 'goal-12',
          minute: 12,
          kind: 'goal',
          side: 'home',
          player: 'Max Beispiel',
          detail: 'Header',
        },
      ],
    })
  })

  it('maps scraper timeline events by away team name instead of defaulting home', async () => {
    const { prisma, service } = createService()
    prisma.importedFixture.findFirst.mockResolvedValue({
      id: 'fixture-1',
      teamId: 'team-1',
      status: 'LIVE',
      resultHome: 0,
      resultAway: 1,
      homeTeam: 'SV Beispiel',
      awayTeam: 'FC Test',
      rawPayload: {
        match_events: [
          {
            time: '12’',
            type: 'goal',
            team: 'FC Test',
            description: 'Away Scorer',
            score: '0:1',
          },
        ],
      },
    })

    const timeline = await service.getFixtureTimeline('user-1', 'fixture-1')

    expect(timeline?.events).toEqual([
      {
        id: 'scraper-12-goal-0',
        minute: 12,
        kind: 'goal',
        side: 'away',
        player: 'Away Scorer',
        detail: '0:1',
      },
    ])
  })

  it('returns null enrichment for licensed feed fixtures without calling the scraper', async () => {
    const { prisma, scraper, service } = createService()
    prisma.importedFixture.findFirst.mockResolvedValue({
      teamId: 'team-1',
      provider: 'LICENSED_FEED',
      externalMatchId: 'licensed-match-1',
    })

    await expect(
      service.fetchMatchEnrichmentForFixture('user-1', 'fixture-1'),
    ).resolves.toBeNull()

    expect(scraper.getGame).not.toHaveBeenCalled()
  })

  it('excludes licensed feed links from the live scraper poll window', async () => {
    const { prisma, service } = createService()
    prisma.importedFixture.findMany.mockResolvedValue([])

    await service.findLiveWindowLinks()

    expect(prisma.importedFixture.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          provider: 'API_FUSSBALL',
        }),
      }),
    )
  })

  it('rejects manual scraper sync for licensed feed links', async () => {
    const { prisma, provider, service } = createService()
    prisma.externalTeamLink.findFirst.mockResolvedValue({
      id: 'link-1',
      clubId: 'club-1',
      teamId: 'team-1',
      provider: 'LICENSED_FEED',
    })

    await expect(
      service.syncTeamLink('user-1', 'club-1', 'link-1'),
    ).rejects.toThrow('licensed feed')

    expect(provider.fetchTeamPage).not.toHaveBeenCalled()
  })

  it('serves fixture lineup from licensed feed rawPayload before provider fallback', async () => {
    const { prisma, provider, service } = createService()
    prisma.importedFixture.findFirst.mockResolvedValue({
      id: 'fixture-1',
      clubId: 'club-1',
      teamId: 'team-1',
      teamLinkId: 'link-1',
      externalMatchId: 'match-1',
      homeTeam: 'SV Beispiel',
      awayTeam: 'FC Test',
      overlay: null,
      updatedAt: new Date('2026-06-21T12:00:00.000Z'),
      rawPayload: {
        licensedFeed: {
          lineup: {
            home: {
              formation: '4-3-3',
              starters: [
                {
                  number: 9,
                  name: 'Max Beispiel',
                  position: 'ST',
                  isCaptain: true,
                },
              ],
              bench: [],
            },
            away: {
              formation: null,
              starters: [{ number: 1, name: 'Away Keeper' }],
              bench: [],
            },
          },
        },
      },
    })

    const lineup = await service.getFixtureLineup('user-1', 'fixture-1')

    expect(provider.fetchMatchLineup).not.toHaveBeenCalled()
    expect(lineup).toMatchObject({
      fixtureId: 'fixture-1',
      externalMatchId: 'match-1',
      status: 'available',
      home: {
        formation: '4-3-3',
        starters: [
          {
            number: 9,
            name: 'Max Beispiel',
            position: 'ST',
            isCaptain: true,
          },
        ],
      },
    })
  })

  it('serializes licensed feed fixtures with their real provider', async () => {
    const { prisma, service } = createService()
    prisma.importedFixture.findMany.mockResolvedValue([
      {
        id: 'fixture-1',
        clubId: 'club-1',
        teamId: 'team-1',
        teamLinkId: 'link-1',
        provider: 'LICENSED_FEED',
        externalMatchId: 'match-1',
        competition: 'Kreisliga A',
        season: '2026/2027',
        kickoffAt: new Date('2026-06-21T13:00:00.000Z'),
        status: 'SCHEDULED',
        homeTeam: 'SV Beispiel',
        awayTeam: 'FC Test',
        homeLogo: null,
        awayLogo: null,
        venueName: null,
        pitchAddress: null,
        resultHome: null,
        resultAway: null,
        tableSnapshot: null,
        rawPayload: {},
        sourceConfidence: 'OFFICIAL_PARTNER',
        lastSeenAt: new Date('2026-06-21T12:00:00.000Z'),
        createdAt: new Date('2026-06-21T12:00:00.000Z'),
        updatedAt: new Date('2026-06-21T12:00:00.000Z'),
        overlay: null,
      },
    ])

    const fixtures = await service.listFixtures('user-1', 'team-1', {
      scope: 'all',
      limit: 10,
    })

    expect(fixtures[0]).toMatchObject({
      provider: 'licensed_feed',
      sourceConfidence: 'official_partner',
    })
  })
})
