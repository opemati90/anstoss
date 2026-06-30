import { StreaksService } from './streaks.service'

function createService() {
  const prisma = {
    event: { findMany: jest.fn<Promise<unknown>, unknown[]>() },
    membership: { findMany: jest.fn<Promise<unknown>, unknown[]>() },
    importedFixture: { findMany: jest.fn<Promise<unknown>, unknown[]>() },
    poll: { findMany: jest.fn<Promise<unknown>, unknown[]>() },
  }
  const service = new StreaksService(prisma as never)
  return { service, prisma }
}

// Three consecutive ISO weeks: W37, W38, W39 of 2025.
const W1 = new Date('2025-09-08T18:00:00Z') // 2025-W37
const W2 = new Date('2025-09-15T18:00:00Z') // 2025-W38
const W3 = new Date('2025-09-22T18:00:00Z') // 2025-W39

describe('StreaksService.getStreaks', () => {
  beforeEach(() => jest.clearAllMocks())

  it('computes real attendance + MOTM streaks and a ranked leaderboard', async () => {
    const { service, prisma } = createService()

    prisma.event.findMany.mockResolvedValue([
      { date: W1, rsvps: [{ userId: 'u-1' }, { userId: 'u-2' }, { userId: 'u-3' }] },
      { date: W2, rsvps: [{ userId: 'u-1' }, { userId: 'u-2' }] }, // u-3 missed
      { date: W3, rsvps: [{ userId: 'u-1' }, { userId: 'u-2' }, { userId: 'u-3' }] },
    ])
    prisma.membership.findMany.mockResolvedValue([
      { userId: 'u-1', user: { id: 'u-1', name: 'Me', avatarUrl: null } },
      { userId: 'u-2', user: { id: 'u-2', name: 'Sam', avatarUrl: null } },
      { userId: 'u-3', user: { id: 'u-3', name: 'Lee', avatarUrl: null } },
    ])
    // One finished fixture in W2 where u-1 wins MOTM (2 votes vs 1).
    prisma.importedFixture.findMany.mockResolvedValue([{ id: 'fix-1', kickoffAt: W2 }])
    prisma.poll.findMany.mockResolvedValue([
      {
        question: 'motm:fix-1',
        votes: [
          { optionId: 'p:u-1', votedAt: new Date('2025-09-15T20:00:00Z'), user: { id: 'u-1' } },
          { optionId: 'p:u-1', votedAt: new Date('2025-09-15T20:01:00Z'), user: { id: 'u-1' } },
          { optionId: 'p:u-2', votedAt: new Date('2025-09-15T20:02:00Z'), user: { id: 'u-2' } },
        ],
      },
    ])

    const res = await service.getStreaks('club-1', 'u-1')

    // u-1 attended all three event-weeks → current 3, longest 3.
    expect(res.me.attendanceWeeks).toBe(3)
    expect(res.me.attendanceLongest).toBe(3)
    // u-1 won the single MOTM week → current 1, longest 1.
    expect(res.me.motmWeeks).toBe(1)
    expect(res.me.motmLongest).toBe(1)
    expect(res.me.lastActivityAt).toBe(W3.toISOString())

    // Leaderboard includes the caller (so the client can highlight their own
    // row), ranked by MOTM streak first then attendance. u-1 leads on the
    // single MOTM week; u-2 and u-3 tie on MOTM (0) so attendance breaks it.
    expect(res.leaderboard).toEqual([
      { userId: 'u-1', name: 'Me', avatarUrl: null, attendanceWeeks: 3, motmWeeks: 1 },
      { userId: 'u-2', name: 'Sam', avatarUrl: null, attendanceWeeks: 3, motmWeeks: 0 },
      // Lee missed W2, so only the trailing W3 counts → current 1.
      { userId: 'u-3', name: 'Lee', avatarUrl: null, attendanceWeeks: 1, motmWeeks: 0 },
    ])
  })

  it('returns zeroed streaks with no events or fixtures', async () => {
    const { service, prisma } = createService()
    prisma.event.findMany.mockResolvedValue([])
    prisma.membership.findMany.mockResolvedValue([
      { userId: 'u-1', user: { id: 'u-1', name: 'Me', avatarUrl: null } },
    ])
    prisma.importedFixture.findMany.mockResolvedValue([])

    const res = await service.getStreaks('club-1', 'u-1')

    expect(res.me.attendanceWeeks).toBe(0)
    expect(res.me.motmWeeks).toBe(0)
    // The caller is now included in the leaderboard, at zero.
    expect(res.leaderboard).toEqual([
      { userId: 'u-1', name: 'Me', avatarUrl: null, attendanceWeeks: 0, motmWeeks: 0 },
    ])
    expect(prisma.poll.findMany).not.toHaveBeenCalled()
  })
})
