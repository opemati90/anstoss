import { ForbiddenException } from '@nestjs/common'
import { MotmService, currentSeason } from './motm.service'

function createService() {
  const prisma = {
    membership: { findFirst: jest.fn<Promise<unknown>, unknown[]>() },
    importedFixture: { findMany: jest.fn<Promise<unknown>, unknown[]>() },
    poll: { findMany: jest.fn<Promise<unknown>, unknown[]>() },
    team: { findMany: jest.fn<Promise<unknown>, unknown[]>() },
  }
  const teamsService = {} as never
  const billingService = {} as never
  const service = new MotmService(prisma as never, teamsService, billingService)
  return { service, prisma }
}

describe('MotmService.getArchive', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns per-player and per-match aggregates for a populated season', async () => {
    const { service, prisma } = createService()

    prisma.membership.findFirst.mockResolvedValue({ id: 'm-1' })

    // Two finished fixtures: f1 (Hertha away, our team home), f2 (Union home).
    prisma.importedFixture.findMany.mockResolvedValue([
      {
        id: 'f1',
        kickoffAt: new Date('2025-09-14T13:00:00Z'),
        homeTeam: 'FC Lichtenberg',
        awayTeam: 'Hertha 03',
        teamId: 'team-1',
      },
      {
        id: 'f2',
        kickoffAt: new Date('2025-08-30T13:00:00Z'),
        homeTeam: 'Union 06',
        awayTeam: 'FC Lichtenberg',
        teamId: 'team-1',
      },
    ])

    // Poll for f1: Alex wins 2-1 over Sam. Poll for f2: Alex wins 1-0.
    prisma.poll.findMany.mockResolvedValue([
      {
        id: 'p1',
        question: 'motm:f1',
        votes: [
          {
            optionId: 'p1:user-alex',
            votedAt: new Date('2025-09-14T15:00:00Z'),
            user: { id: 'user-alex', name: 'Alex', avatarUrl: 'a.png' },
          },
          {
            optionId: 'p1:user-alex',
            votedAt: new Date('2025-09-14T15:05:00Z'),
            user: { id: 'user-alex', name: 'Alex', avatarUrl: 'a.png' },
          },
          {
            optionId: 'p1:user-sam',
            votedAt: new Date('2025-09-14T15:02:00Z'),
            user: { id: 'user-sam', name: 'Sam', avatarUrl: null },
          },
        ],
      },
      {
        id: 'p2',
        question: 'motm:f2',
        votes: [
          {
            optionId: 'p2:user-alex',
            votedAt: new Date('2025-08-30T15:00:00Z'),
            user: { id: 'user-alex', name: 'Alex', avatarUrl: 'a.png' },
          },
        ],
      },
    ])

    prisma.team.findMany.mockResolvedValue([
      { id: 'team-1', name: 'FC Lichtenberg' },
    ])

    const result = await service.getArchive('user-me', 'club-1', '2025-26')

    expect(result.season).toBe('2025-26')

    // Alex won both — top of the list with count 2.
    expect(result.topByPlayer).toEqual([
      { userId: 'user-alex', name: 'Alex', avatarUrl: 'a.png', count: 2 },
    ])

    // Match list mirrors fixture order (desc by kickoff) with computed opponent.
    expect(result.byMatch).toHaveLength(2)
    expect(result.byMatch[0]).toMatchObject({
      matchId: 'f1',
      opponentName: 'Hertha 03',
      motmUserId: 'user-alex',
      motmName: 'Alex',
    })
    expect(result.byMatch[1]).toMatchObject({
      matchId: 'f2',
      opponentName: 'Union 06',
      motmUserId: 'user-alex',
    })
  })

  it('returns an empty archive when no fixtures exist for the season', async () => {
    const { service, prisma } = createService()
    prisma.membership.findFirst.mockResolvedValue({ id: 'm-1' })
    prisma.importedFixture.findMany.mockResolvedValue([])

    const result = await service.getArchive('user-me', 'club-1', '2025-26')

    expect(result).toEqual({
      season: '2025-26',
      topByPlayer: [],
      byMatch: [],
    })
    // Avoids extra round trips once we know there are no fixtures.
    expect(prisma.poll.findMany).not.toHaveBeenCalled()
    expect(prisma.team.findMany).not.toHaveBeenCalled()
  })

  it('refuses non-members of the club', async () => {
    const { service, prisma } = createService()
    prisma.membership.findFirst.mockResolvedValue(null)

    await expect(
      service.getArchive('stranger', 'club-1', '2025-26'),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(prisma.importedFixture.findMany).not.toHaveBeenCalled()
  })

  it('falls back to the current season when none is provided', async () => {
    const { service, prisma } = createService()
    prisma.membership.findFirst.mockResolvedValue({ id: 'm-1' })
    prisma.importedFixture.findMany.mockResolvedValue([])

    const result = await service.getArchive('user-me', 'club-1')

    expect(result.season).toBe(currentSeason())
  })
})

describe('currentSeason', () => {
  it('places August through December into the new season', () => {
    expect(currentSeason(new Date('2025-08-15T12:00:00Z'))).toBe('2025-26')
    expect(currentSeason(new Date('2025-12-31T12:00:00Z'))).toBe('2025-26')
  })

  it('places January through July into the previous-year season', () => {
    expect(currentSeason(new Date('2026-01-15T12:00:00Z'))).toBe('2025-26')
    expect(currentSeason(new Date('2026-07-31T12:00:00Z'))).toBe('2025-26')
  })
})
