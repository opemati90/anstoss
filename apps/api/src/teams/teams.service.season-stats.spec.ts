import { TeamsService } from './teams.service'

/**
 * Unit tests for TeamsService.getTeamSeasonStats
 *
 * The service calls:
 *   1. assertEventManagementAccess — mocked to pass
 *   2. prisma.importedFixture.findMany — returns fixture data
 *
 * W/D/L determination uses inferLinkedTeamPerspective from fussball.utils.
 */
describe('TeamsService.getTeamSeasonStats', () => {
  function createService(fixtures: object[]) {
    const prisma = {
      importedFixture: {
        findMany: jest.fn().mockResolvedValue(fixtures),
      },
    }

    const service = new TeamsService(prisma as never)

    // Skip auth — tested separately
    jest.spyOn(service as any, 'assertEventManagementAccess').mockResolvedValue(undefined)

    return { prisma, service }
  }

  it('returns zeros when no fixtures exist', async () => {
    const { service } = createService([])

    const result = await service.getTeamSeasonStats('club-1', 'team-1', 'user-1')

    expect(result).toEqual({
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      winRate: 0,
      goalDifference: 0,
      recentForm: [],
    })
  })

  it('counts W/D/L correctly from fixture results', async () => {
    // Team label = "FC Muster" — home team in all fixtures
    const makeFixture = (resultHome: number, resultAway: number) => ({
      kickoffAt: new Date().toISOString(),
      homeTeam: 'FC Muster',
      awayTeam: 'Gegner FC',
      resultHome,
      resultAway,
      teamLink: { label: 'FC Muster' },
    })

    const { service } = createService([
      makeFixture(3, 1), // W
      makeFixture(2, 2), // D
      makeFixture(0, 2), // L
      makeFixture(1, 0), // W
      makeFixture(4, 0), // W
    ])

    const result = await service.getTeamSeasonStats('club-1', 'team-1', 'user-1')

    expect(result.played).toBe(5)
    expect(result.wins).toBe(3)
    expect(result.draws).toBe(1)
    expect(result.losses).toBe(1)
    expect(result.winRate).toBe(60)
    // goals for = 10, goals against = 5
    expect(result.goalDifference).toBe(5)
  })

  it('returns recentForm as last 5 results most recent first', async () => {
    // fixtures are returned newest-first (orderBy kickoffAt desc in the service)
    const base = new Date('2026-01-01').getTime()
    const makeFixture = (resultHome: number, resultAway: number, dayOffset: number) => ({
      kickoffAt: new Date(base + dayOffset * 86400000).toISOString(),
      homeTeam: 'Our Club',
      awayTeam: 'Them',
      resultHome,
      resultAway,
      teamLink: { label: 'Our Club' },
    })

    // 7 fixtures, newest first (prisma returns desc) → only first 5 go to recentForm
    const { service } = createService([
      makeFixture(2, 0, 6), // W — most recent
      makeFixture(1, 1, 5), // D
      makeFixture(0, 3, 4), // L
      makeFixture(3, 0, 3), // W
      makeFixture(2, 1, 2), // W
      makeFixture(0, 1, 1), // L — 6th: not in recentForm
      makeFixture(1, 0, 0), // W — 7th: not in recentForm
    ])

    const result = await service.getTeamSeasonStats('club-1', 'team-1', 'user-1')

    expect(result.recentForm).toEqual(['W', 'D', 'L', 'W', 'W'])
  })

  it('skips fixtures where home/away side cannot be determined', async () => {
    const { service } = createService([
      {
        kickoffAt: new Date().toISOString(),
        homeTeam: 'Unknown Team A',
        awayTeam: 'Unknown Team B',
        resultHome: 2,
        resultAway: 1,
        teamLink: { label: 'FC Muster' }, // no match → isHome=null
      },
      {
        kickoffAt: new Date().toISOString(),
        homeTeam: 'FC Muster',
        awayTeam: 'Gegner',
        resultHome: 3,
        resultAway: 0,
        teamLink: { label: 'FC Muster' }, // isHome=true → W
      },
    ])

    const result = await service.getTeamSeasonStats('club-1', 'team-1', 'user-1')

    // Only the identifiable fixture counts
    expect(result.played).toBe(1)
    expect(result.wins).toBe(1)
  })

  it('handles away perspective correctly', async () => {
    // Our team is the away team
    const { service } = createService([
      {
        kickoffAt: new Date().toISOString(),
        homeTeam: 'Home Club',
        awayTeam: 'Our Club',
        resultHome: 1,
        resultAway: 3, // Our Club wins 3-1 away
        teamLink: { label: 'Our Club' },
      },
    ])

    const result = await service.getTeamSeasonStats('club-1', 'team-1', 'user-1')

    expect(result.wins).toBe(1)
    expect(result.goalDifference).toBe(2) // 3-1=+2
  })
})
