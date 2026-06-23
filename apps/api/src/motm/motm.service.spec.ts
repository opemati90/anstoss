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

function createVoteService() {
  const prisma = {
    importedFixture: { findUnique: jest.fn<Promise<unknown>, unknown[]>() },
    poll: { findFirst: jest.fn<Promise<unknown>, unknown[]>() },
    teamAccess: { findFirst: jest.fn<Promise<unknown>, unknown[]>() },
    pollOption: { upsert: jest.fn<Promise<unknown>, unknown[]>() },
    pollVote: {
      deleteMany: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
    },
  }
  const teamsService = { assertReadableAccess: jest.fn().mockResolvedValue(undefined) }
  const billingService = {
    getEntitlements: jest.fn().mockResolvedValue({ features: ['motm_archive'] }),
  }
  const service = new MotmService(prisma as never, teamsService as never, billingService as never)
  return { service, prisma }
}

describe('MotmService.vote integrity', () => {
  beforeEach(() => jest.clearAllMocks())

  const FINISHED = { id: 'fix-1', status: 'FINISHED', teamId: 'team-1', clubId: 'club-1' }
  const openPoll = { id: 'poll-1', closesAt: new Date(Date.now() + 3_600_000) }

  it('rejects voting before the final whistle', async () => {
    const { service, prisma } = createVoteService()
    prisma.importedFixture.findUnique.mockResolvedValue({ ...FINISHED, status: 'SCHEDULED' })
    await expect(service.vote('u-1', 'fix-1', 'u-2')).rejects.toThrow('final whistle')
  })

  it('rejects a self-vote', async () => {
    const { service, prisma } = createVoteService()
    prisma.importedFixture.findUnique.mockResolvedValue(FINISHED)
    prisma.poll.findFirst.mockResolvedValue(openPoll)
    await expect(service.vote('u-1', 'fix-1', 'u-1')).rejects.toThrow('cannot vote for yourself')
    expect(prisma.pollVote.create).not.toHaveBeenCalled()
  })

  it('rejects a candidate who is not an active roster player', async () => {
    const { service, prisma } = createVoteService()
    prisma.importedFixture.findUnique.mockResolvedValue(FINISHED)
    prisma.poll.findFirst.mockResolvedValue(openPoll)
    prisma.teamAccess.findFirst.mockResolvedValue(null)
    await expect(service.vote('u-1', 'fix-1', 'outsider')).rejects.toThrow("roster")
    expect(prisma.pollVote.create).not.toHaveBeenCalled()
  })

  it('rejects voting after the window has closed (before touching the roster)', async () => {
    const { service, prisma } = createVoteService()
    prisma.importedFixture.findUnique.mockResolvedValue(FINISHED)
    prisma.poll.findFirst.mockResolvedValue({ id: 'poll-1', closesAt: new Date(Date.now() - 1000) })
    await expect(service.vote('u-1', 'fix-1', 'u-2')).rejects.toThrow('voting has closed')
    expect(prisma.teamAccess.findFirst).not.toHaveBeenCalled()
    expect(prisma.pollVote.create).not.toHaveBeenCalled()
  })

  it('records a valid vote for a rostered player', async () => {
    const { service, prisma } = createVoteService()
    prisma.importedFixture.findUnique.mockResolvedValue(FINISHED)
    prisma.poll.findFirst.mockResolvedValue(openPoll)
    prisma.teamAccess.findFirst.mockResolvedValue({ user: { id: 'u-2', name: 'Sam' } })
    prisma.pollOption.upsert.mockResolvedValue({ id: 'poll-1:u-2' })
    jest.spyOn(service, 'getTally').mockResolvedValue({ fixtureId: 'fix-1' } as never)

    await service.vote('u-1', 'fix-1', 'u-2')

    expect(prisma.teamAccess.findFirst).toHaveBeenCalledWith({
      where: { teamId: 'team-1', userId: 'u-2', status: 'ACTIVE', role: 'PLAYER' },
      select: { user: { select: { id: true, name: true } } },
    })
    expect(prisma.pollVote.deleteMany).toHaveBeenCalledWith({
      where: { pollId: 'poll-1', userId: 'u-1' },
    })
    expect(prisma.pollVote.create).toHaveBeenCalledWith({
      data: { pollId: 'poll-1', optionId: 'poll-1:u-2', userId: 'u-1' },
    })
  })
})
