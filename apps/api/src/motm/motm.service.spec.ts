import { ForbiddenException } from '@nestjs/common'
import { MotmService, currentSeason } from './motm.service'

function createService() {
  const prisma = {
    user: { findMany: jest.fn().mockResolvedValue([
      { id: 'user-alex', name: 'Alex', avatarUrl: 'a.png' },
      { id: 'user-sam', name: 'Sam', avatarUrl: null },
    ]) },
    membership: { findFirst: jest.fn<Promise<unknown>, unknown[]>() },
    importedFixture: { findMany: jest.fn<Promise<unknown>, unknown[]>() },
    poll: { findMany: jest.fn<Promise<unknown>, unknown[]>() },
    team: {
      findMany: jest.fn<Promise<unknown>, unknown[]>(),
      findFirst: jest.fn<Promise<unknown>, unknown[]>(),
    },
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
    $transaction: jest.fn(async (run: (tx: unknown) => Promise<unknown>): Promise<unknown> => run(prisma)),
    $executeRaw: jest.fn().mockResolvedValue(0),
    $queryRaw: jest.fn().mockResolvedValue([]),
    user: { findFirst: jest.fn().mockResolvedValue({ dateOfBirth: new Date('1990-01-01') }) },
    importedFixture: { findUnique: jest.fn<Promise<unknown>, unknown[]>() },
    poll: { findFirst: jest.fn<Promise<unknown>, unknown[]>() },
    teamAccess: { findFirst: jest.fn<Promise<unknown>, unknown[]>() },
    membership: { findFirst: jest.fn<Promise<unknown>, unknown[]>().mockResolvedValue({ role: 'ADMIN' }) },
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
      where: {
        clubId: 'club-1',
        teamId: 'team-1',
        userId: 'u-2',
        status: 'ACTIVE',
        phase: 'FULL',
        role: 'PLAYER',
        user: expect.objectContaining({ deletedAt: null, dateOfBirth: { lte: expect.any(Date) } }),
        OR: [{ loanEndDate: null }, { loanEndDate: { gt: expect.any(Date) } }],
      },
      select: { user: { select: { id: true, name: true } } },
    })
    expect(prisma.pollVote.deleteMany).toHaveBeenCalledWith({
      where: { pollId: 'poll-1', userId: 'u-1' },
    })
    expect(prisma.pollVote.create).toHaveBeenCalledWith({
      data: { pollId: 'poll-1', optionId: 'poll-1:u-2', userId: 'u-1' },
    })
    expect(prisma.$executeRaw.mock.calls.map((call) => String(call[1]))).toEqual([
      'u-1',
      'u-2',
      'owner:club-1',
      'motm-fixture:fix-1',
    ])
  })

  it('requires FULL roster access for a candidate', async () => {
    const { service, prisma } = createVoteService()
    prisma.importedFixture.findUnique.mockResolvedValue(FINISHED)
    prisma.poll.findFirst.mockResolvedValue(openPoll)
    // Prisma applies the FULL predicate, so a TRIAL-only row is absent.
    prisma.teamAccess.findFirst.mockResolvedValue(null)

    await expect(service.vote('u-1', 'fix-1', 'trial-player')).rejects.toThrow('roster')
    expect(prisma.teamAccess.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ phase: 'FULL' }),
    }))
    expect(prisma.pollVote.create).not.toHaveBeenCalled()
  })

  it('does not use a TRIAL coach as the synthetic poll sender', async () => {
    const { service, prisma } = createVoteService()
    prisma.teamAccess.findFirst.mockResolvedValue(null)
    prisma.membership.findFirst.mockResolvedValue({ userId: 'owner' })

    await expect(
      (service as unknown as {
        systemSender: (clubId: string, teamId: string, client: typeof prisma) => Promise<{ id: string }>
      }).systemSender('club-1', 'team-1', prisma),
    ).resolves.toEqual({ id: 'owner' })
    expect(prisma.teamAccess.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ phase: 'FULL' }),
    }))
  })

  it('serializes first-poll creation for concurrent disjoint voters and candidates', async () => {
    let poll: { id: string; closesAt: Date } | null = null
    const votes: Array<{ pollId: string; userId: string; optionId: string }> = []
    const fixtureLocks: string[] = []
    let fixtureTail = Promise.resolve()
    const prisma: any = {
      user: { findFirst: jest.fn().mockResolvedValue({ dateOfBirth: new Date('1990-01-01') }) },
      importedFixture: { findUnique: jest.fn().mockResolvedValue(FINISHED) },
      poll: {
        findFirst: jest.fn(async () => poll),
        create: jest.fn(async () => (poll = { id: 'poll-created-once', closesAt: new Date(Date.now() + 3_600_000) })),
      },
      message: { create: jest.fn().mockResolvedValue({ id: 'anchor' }) },
      teamAccess: {
        findFirst: jest.fn(async ({ where }: any) =>
          where.role === 'PLAYER'
            ? { user: { id: where.userId, name: where.userId } }
            : { userId: 'full-coach' }),
      },
      membership: { findFirst: jest.fn().mockResolvedValue({ userId: 'owner' }) },
      pollOption: { upsert: jest.fn(async ({ create }: any) => ({ id: create.id })) },
      pollVote: {
        deleteMany: jest.fn(async ({ where }: any) => {
          for (let index = votes.length - 1; index >= 0; index -= 1) {
            if (votes[index].pollId === where.pollId && votes[index].userId === where.userId) votes.splice(index, 1)
          }
        }),
        create: jest.fn(async ({ data }: any) => { votes.push(data); return data }),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    }
    prisma.$transaction = jest.fn(async (run: (tx: any) => Promise<unknown>) => {
      let releaseFixture: (() => void) | undefined
      const tx = {
        ...prisma,
        $executeRaw: jest.fn(async (_query: unknown, key: string) => {
          if (!String(key).startsWith('motm-fixture:')) return 0
          fixtureLocks.push(String(key))
          const previous = fixtureTail
          fixtureTail = new Promise<void>((resolve) => { releaseFixture = resolve })
          await previous
          return 0
        }),
      }
      try { return await run(tx) } finally { releaseFixture?.() }
    })
    const service = new MotmService(
      prisma,
      { assertReadableAccess: jest.fn().mockResolvedValue(undefined) } as never,
      { getEntitlements: jest.fn().mockResolvedValue({ features: ['motm_archive'] }) } as never,
    )
    jest.spyOn(service, 'getTally').mockResolvedValue({ fixtureId: 'fix-1' } as never)

    await Promise.all([
      service.vote('voter-a', 'fix-1', 'candidate-a'),
      service.vote('voter-b', 'fix-1', 'candidate-b'),
    ])

    expect(prisma.poll.create).toHaveBeenCalledTimes(1)
    expect(prisma.message.create).toHaveBeenCalledTimes(1)
    expect(votes).toEqual(expect.arrayContaining([
      expect.objectContaining({ pollId: 'poll-created-once', userId: 'voter-a' }),
      expect.objectContaining({ pollId: 'poll-created-once', userId: 'voter-b' }),
    ]))
    expect(fixtureLocks).toEqual(['motm-fixture:fix-1', 'motm-fixture:fix-1'])
  })
})

// Kader Statistik: team-scoped MOTM archive.
describe('MotmService.getArchive with a team scope', () => {
  it('filters fixtures to the team and echoes the scope', async () => {
    const { service, prisma } = createService()
    prisma.membership.findFirst.mockResolvedValue({ id: 'm-1' })
    prisma.team.findFirst.mockResolvedValue({ id: 'team-1' })
    prisma.importedFixture.findMany.mockResolvedValue([])

    const result = await service.getArchive('user-me', 'club-1', '2025-26', 'team-1')

    expect(prisma.importedFixture.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ clubId: 'club-1', teamId: 'team-1' }) }),
    )
    expect(result.teamId).toBe('team-1')
  })

  it('404s for a team outside the club', async () => {
    const { service, prisma } = createService()
    prisma.membership.findFirst.mockResolvedValue({ id: 'm-1' })
    prisma.team.findFirst.mockResolvedValue(null)
    await expect(service.getArchive('user-me', 'club-1', '2025-26', 'other')).rejects.toThrow('Team not found')
    expect(prisma.importedFixture.findMany).not.toHaveBeenCalled()
  })
})
