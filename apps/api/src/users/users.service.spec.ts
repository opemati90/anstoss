import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { MembershipRole } from '@anstoss/shared'
import { UsersService } from './users.service'

describe('UsersService.updateClubMemberRole', () => {
  function createService() {
    const prisma = {
      membership: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      teamAccess: {
        findMany: jest.fn(),
      },
    }

    const service = new UsersService(prisma as never, {} as never)

    return { prisma, service }
  }

  it('allows an owner to promote a member to admin', async () => {
    const { prisma, service } = createService()

    prisma.membership.findUnique
      .mockResolvedValueOnce({
        userId: 'owner-user',
        clubId: 'club-1',
        role: MembershipRole.OWNER,
      })
      .mockResolvedValueOnce({
        userId: 'member-user',
        clubId: 'club-1',
        role: MembershipRole.COACH,
        user: {
          id: 'member-user',
          name: 'Alex Admin',
          email: 'alex@example.com',
          avatarUrl: null,
        },
      })
    prisma.teamAccess.findMany.mockResolvedValue([])
    prisma.membership.update.mockResolvedValue({
      userId: 'member-user',
      clubId: 'club-1',
      role: MembershipRole.ADMIN,
      user: {
        id: 'member-user',
        name: 'Alex Admin',
        email: 'alex@example.com',
        avatarUrl: null,
      },
    })

    const result = await service.updateClubMemberRole(
      'club-1',
      'owner-user',
      'member-user',
      MembershipRole.ADMIN,
    )

    expect(result.role).toBe(MembershipRole.ADMIN)
    expect(prisma.membership.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { role: MembershipRole.ADMIN },
      }),
    )
  })

  it('prevents admins from assigning admin role', async () => {
    const { prisma, service } = createService()

    prisma.membership.findUnique
      .mockResolvedValueOnce({
        userId: 'admin-user',
        clubId: 'club-1',
        role: MembershipRole.ADMIN,
      })
      .mockResolvedValueOnce({
        userId: 'member-user',
        clubId: 'club-1',
        role: MembershipRole.PLAYER,
        user: {
          id: 'member-user',
          name: 'Pat Player',
          email: 'pat@example.com',
          avatarUrl: null,
        },
      })

    await expect(
      service.updateClubMemberRole(
        'club-1',
        'admin-user',
        'member-user',
        MembershipRole.ADMIN,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('blocks demoting an active squad coach into a non-staff role', async () => {
    const { prisma, service } = createService()

    prisma.membership.findUnique
      .mockResolvedValueOnce({
        userId: 'owner-user',
        clubId: 'club-1',
        role: MembershipRole.OWNER,
      })
      .mockResolvedValueOnce({
        userId: 'coach-user',
        clubId: 'club-1',
        role: MembershipRole.COACH,
        user: {
          id: 'coach-user',
          name: 'Casey Coach',
          email: 'casey@example.com',
          avatarUrl: null,
        },
      })
    prisma.teamAccess.findMany.mockResolvedValue([{ id: 'ta_1' }])

    await expect(
      service.updateClubMemberRole(
        'club-1',
        'owner-user',
        'coach-user',
        MembershipRole.PLAYER,
      ),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('blocks changing your own role', async () => {
    const { prisma, service } = createService()

    prisma.membership.findUnique
      .mockResolvedValueOnce({
        userId: 'admin-user',
        clubId: 'club-1',
        role: MembershipRole.ADMIN,
      })
      .mockResolvedValueOnce({
        userId: 'admin-user',
        clubId: 'club-1',
        role: MembershipRole.ADMIN,
        user: {
          id: 'admin-user',
          name: 'Ari Admin',
          email: 'ari@example.com',
          avatarUrl: null,
        },
      })

    await expect(
      service.updateClubMemberRole(
        'club-1',
        'admin-user',
        'admin-user',
        MembershipRole.COACH,
      ),
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})

describe('UsersService.getChildrenEvents', () => {
  function createService() {
    const prisma = {
      membership: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      teamAccess: {
        findMany: jest.fn(),
      },
      guardianRelationship: {
        findMany: jest.fn(),
      },
      event: {
        findMany: jest.fn(),
      },
    }

    const service = new UsersService(prisma as never, {} as never)
    return { prisma, service }
  }

  it('returns empty array when parent has no guardian relationships', async () => {
    const { prisma, service } = createService()
    prisma.guardianRelationship.findMany.mockResolvedValue([])

    const result = await service.getChildrenEvents('parent-1')

    expect(result).toEqual([])
  })

  it('returns cross-team events for children', async () => {
    const { prisma, service } = createService()

    prisma.guardianRelationship.findMany.mockResolvedValue([
      { playerUserId: 'child-1', childName: 'Max Jr' },
    ])
    prisma.teamAccess.findMany.mockResolvedValue([
      {
        teamId: 'team-1',
        team: { id: 'team-1', name: 'U13', group: { displayName: 'Jugend' } },
      },
    ])
    prisma.event.findMany.mockResolvedValue([
      {
        id: 'evt-1',
        title: 'Training',
        type: 'TRAINING',
        date: new Date('2026-04-01'),
        location: 'Pitch A',
        notes: null,
        teamId: 'team-1',
        clubId: 'club-1',
        createdById: 'coach-1',
        createdAt: new Date('2026-03-01'),
        _count: { rsvps: 5 },
        rsvps: [],
      },
    ])

    const result = await service.getChildrenEvents('parent-1')

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'evt-1',
      title: 'Training',
      teamId: 'team-1',
      teamName: 'U13',
      teamDisplayName: 'Jugend — U13',
    })
  })

  it('returns empty when children have no active team access', async () => {
    const { prisma, service } = createService()

    prisma.guardianRelationship.findMany.mockResolvedValue([
      { playerUserId: 'child-1', childName: 'Max Jr' },
    ])
    prisma.teamAccess.findMany.mockResolvedValue([])

    const result = await service.getChildrenEvents('parent-1')

    expect(result).toEqual([])
    expect(prisma.event.findMany).not.toHaveBeenCalled()
  })

  it('deduplicates teamIds from multiple children on the same team', async () => {
    const { prisma, service } = createService()

    prisma.guardianRelationship.findMany.mockResolvedValue([
      { playerUserId: 'child-1', childName: 'Max Jr' },
      { playerUserId: 'child-2', childName: 'Mia Jr' },
    ])
    prisma.teamAccess.findMany.mockResolvedValue([
      {
        teamId: 'team-1',
        team: { id: 'team-1', name: 'U13', group: { displayName: 'Jugend' } },
      },
      {
        teamId: 'team-1',
        team: { id: 'team-1', name: 'U13', group: { displayName: 'Jugend' } },
      },
    ])
    prisma.event.findMany.mockResolvedValue([])

    await service.getChildrenEvents('parent-1')

    const call = prisma.event.findMany.mock.calls[0][0]
    expect(call.where.teamId.in).toEqual(['team-1'])
  })

  it('passes dateFrom and dateTo filters to event query', async () => {
    const { prisma, service } = createService()

    prisma.guardianRelationship.findMany.mockResolvedValue([
      { playerUserId: 'child-1', childName: 'Max Jr' },
    ])
    prisma.teamAccess.findMany.mockResolvedValue([
      {
        teamId: 'team-1',
        team: { id: 'team-1', name: 'U13', group: { displayName: 'Jugend' } },
      },
    ])
    prisma.event.findMany.mockResolvedValue([])

    await service.getChildrenEvents('parent-1', {
      dateFrom: '01.04.2026',
      dateTo: '30.06.2026',
    })

    const call = prisma.event.findMany.mock.calls[0][0]
    const gte = call.where.date.gte as Date
    const lte = call.where.date.lte as Date

    expect(gte.getFullYear()).toBe(2026)
    expect(gte.getMonth()).toBe(3)
    expect(gte.getDate()).toBe(1)
    expect(gte.getHours()).toBe(0)
    expect(gte.getMinutes()).toBe(0)

    expect(lte.getFullYear()).toBe(2026)
    expect(lte.getMonth()).toBe(5)
    expect(lte.getDate()).toBe(30)
    expect(lte.getHours()).toBe(23)
    expect(lte.getMinutes()).toBe(59)
  })
})
