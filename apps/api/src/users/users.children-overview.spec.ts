import { ForbiddenException } from '@nestjs/common'
import { childrenOverviewQuerySchema } from '@anstoss/shared'
import { UsersService } from './users.service'

// home revamp: GET /me/children-overview (parent home duties + announcements).
describe('UsersService.getChildrenOverview', () => {
  const now = new Date('2026-09-24T10:00:00.000Z')

  function createService() {
    const prisma = {
      membership: { findFirst: jest.fn() },
      guardianRelationship: { findMany: jest.fn() },
      teamAccess: { findMany: jest.fn() },
      teamDutyAssignment: { findMany: jest.fn() },
      message: { findMany: jest.fn() },
    }
    const service = new UsersService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    )
    return { prisma, service }
  }

  function seedFamily(prisma: ReturnType<typeof createService>['prisma']) {
    prisma.membership.findFirst.mockResolvedValue({ role: 'PARENT' })
    prisma.guardianRelationship.findMany.mockResolvedValue([
      {
        clubId: 'club-1',
        teamId: 'team-u15',
        playerUserId: 'leo',
        childName: 'Leo Becker',
        player: { name: 'Leo Becker' },
        team: { id: 'team-u15', name: 'U15', displayName: 'U15 I', clubId: 'club-1' },
      },
      {
        // Mia has no upcoming events but must still appear in the header.
        clubId: 'club-1',
        teamId: 'team-u11',
        playerUserId: 'mia',
        childName: null,
        player: { name: 'Mia Becker' },
        team: { id: 'team-u11', name: 'U11', displayName: 'U11', clubId: 'club-1' },
      },
    ])
    prisma.teamAccess.findMany.mockResolvedValue([
      { userId: 'leo', teamId: 'team-u15', team: { id: 'team-u15', name: 'U15', displayName: 'U15 I' } },
      // Leo also plays up in the U17 — every team of a child is listed.
      { userId: 'leo', teamId: 'team-u17', team: { id: 'team-u17', name: 'U17', displayName: 'U17' } },
      { userId: 'mia', teamId: 'team-u11', team: { id: 'team-u11', name: 'U11', displayName: 'U11' } },
    ])
  }

  function duty(overrides: Record<string, unknown>) {
    return {
      id: 'duty-1',
      clubId: 'club-1',
      teamId: 'team-u15',
      assignedUserId: 'leo',
      createdById: 'coach-1',
      kind: 'JERSEY_CLEANUP',
      status: 'PENDING',
      dueDate: new Date('2026-09-27T10:00:00.000Z'),
      notes: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      assignedUser: { id: 'leo', name: 'Leo Becker', avatarUrl: null },
      team: { name: 'U15', displayName: 'U15 I' },
      ...overrides,
    }
  }

  it('rejects a caller who is not a member of the club', async () => {
    const { prisma, service } = createService()
    prisma.membership.findFirst.mockResolvedValue(null)

    await expect(service.getChildrenOverview('parent-1', 'club-other')).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(prisma.guardianRelationship.findMany).not.toHaveBeenCalled()
  })

  it('lists every linked child with all their teams, even without events', async () => {
    const { prisma, service } = createService()
    seedFamily(prisma)
    prisma.teamDutyAssignment.findMany.mockResolvedValue([])
    prisma.message.findMany.mockResolvedValue([])

    const result = await service.getChildrenOverview('parent-1', 'club-1')

    expect(result.children).toEqual([
      {
        userId: 'leo',
        name: 'Leo Becker',
        teams: [
          { id: 'team-u15', name: 'U15', displayName: 'U15 I' },
          { id: 'team-u17', name: 'U17', displayName: 'U17' },
        ],
      },
      { userId: 'mia', name: 'Mia Becker', teams: [{ id: 'team-u11', name: 'U11', displayName: 'U11' }] },
    ])
    // Team reach is scoped to the requested club.
    expect(prisma.teamAccess.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: { in: ['leo', 'mia'] }, clubId: 'club-1' }),
      }),
    )
  })

  it("returns children's duties on their own teams plus the parent's own duties", async () => {
    const { prisma, service } = createService()
    seedFamily(prisma)
    prisma.teamDutyAssignment.findMany.mockResolvedValue([
      duty({}),
      duty({
        id: 'duty-own',
        assignedUserId: 'parent-1',
        kind: 'LOCKER_ROOM',
        teamId: 'team-u11',
        assignedUser: { id: 'parent-1', name: 'Nina Becker', avatarUrl: null },
        team: { name: 'U11', displayName: 'U11' },
      }),
    ])
    prisma.message.findMany.mockResolvedValue([])

    const result = await service.getChildrenOverview('parent-1', 'club-1')

    const where = prisma.teamDutyAssignment.findMany.mock.calls[0][0].where
    expect(where.clubId).toBe('club-1')
    expect(where.status).toBe('PENDING')
    // Guardian-link check: a child's duty only counts on a team the child is on.
    expect(where.OR).toEqual([
      { assignedUserId: 'parent-1' },
      { assignedUserId: 'leo', teamId: 'team-u15' },
      { assignedUserId: 'leo', teamId: 'team-u17' },
      { assignedUserId: 'mia', teamId: 'team-u11' },
    ])
    expect(result.duties).toEqual([
      expect.objectContaining({
        id: 'duty-1',
        kind: 'JERSEY_CLEANUP',
        dueDate: '2026-09-27T10:00:00.000Z',
        teamName: 'U15 I',
        childUserId: 'leo',
      }),
      expect.objectContaining({ id: 'duty-own', teamName: 'U11', childUserId: null }),
    ])
  })

  it("reads announcements only from the children's teams and the club, within visibility", async () => {
    const { prisma, service } = createService()
    seedFamily(prisma)
    prisma.teamDutyAssignment.findMany.mockResolvedValue([])
    prisma.message.findMany.mockResolvedValue([
      {
        id: 'msg-1',
        content: 'Sommerfest am Samstag\n\nAb 14 Uhr am Vereinsheim.',
        createdAt: now,
        channel: { teamId: 'team-u15' },
      },
      { id: 'msg-2', content: 'Platz gesperrt', createdAt: now, channel: { teamId: null } },
    ])

    const result = await service.getChildrenOverview('parent-1', 'club-1', 2)

    const args = prisma.message.findMany.mock.calls[0][0]
    expect(args.take).toBe(2)
    expect(args.where.clubId).toBe('club-1')
    expect(args.where.channel.kind).toBe('ANNOUNCEMENTS')
    // A plain parent never reads coach- or admin-only channels.
    expect(args.where.channel.visibility).toEqual({ in: ['MEMBERS', 'PARENTS_ONLY'] })
    expect(args.where.channel.OR).toEqual([
      { teamId: null },
      { teamId: { in: ['team-u15', 'team-u17', 'team-u11'] } },
    ])
    expect(result.announcements).toEqual([
      {
        id: 'msg-1',
        title: 'Sommerfest am Samstag',
        body: 'Ab 14 Uhr am Vereinsheim.',
        createdAt: now.toISOString(),
        teamId: 'team-u15',
        teamName: 'U15 I',
      },
      {
        id: 'msg-2',
        title: 'Platz gesperrt',
        body: '',
        createdAt: now.toISOString(),
        teamId: null,
        teamName: null,
      },
    ])
  })

  it('skips a registered child who is not on any team in this club', async () => {
    const { prisma, service } = createService()
    prisma.membership.findFirst.mockResolvedValue({ role: 'PARENT' })
    prisma.guardianRelationship.findMany.mockResolvedValue([
      {
        clubId: 'club-2',
        teamId: 'team-x',
        playerUserId: 'kid-elsewhere',
        childName: 'Ben',
        player: { name: 'Ben' },
        team: { id: 'team-x', name: 'E1', displayName: 'E1', clubId: 'club-2' },
      },
    ])
    prisma.teamAccess.findMany.mockResolvedValue([])
    prisma.teamDutyAssignment.findMany.mockResolvedValue([])
    prisma.message.findMany.mockResolvedValue([])

    const result = await service.getChildrenOverview('parent-1', 'club-1')

    expect(result.children).toEqual([])
    expect(prisma.teamDutyAssignment.findMany.mock.calls[0][0].where.OR).toEqual([
      { assignedUserId: 'parent-1' },
    ])
    expect(prisma.message.findMany.mock.calls[0][0].where.channel.OR).toEqual([{ teamId: null }])
  })

  it('validates the query', () => {
    expect(() => childrenOverviewQuerySchema.parse({})).toThrow()
    expect(childrenOverviewQuerySchema.parse({ clubId: 'club-1', limit: '3' })).toEqual({
      clubId: 'club-1',
      limit: 3,
    })
  })
})
