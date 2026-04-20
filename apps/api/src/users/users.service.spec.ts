import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common'
import {
  FreeAgentVisibility,
  MembershipRole,
  PlayerPosition,
  RegistrationRole,
} from '@anstoss/shared'
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

    const service = new UsersService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    )

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

    const service = new UsersService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    )
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

describe('UsersService.completeOnboarding', () => {
  function createService() {
    const prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    }
    const teamsService = {} as any
    const clubsService = { createClubWithTeam: jest.fn() }
    const invitesService = { redeem: jest.fn() }
    const marketplaceService = { createFreeAgentProfile: jest.fn() }

    const service = new UsersService(
      prisma as never,
      teamsService,
      clubsService as never,
      invitesService as never,
      marketplaceService as never,
    )

    return { prisma, clubsService, invitesService, marketplaceService, service }
  }

  const profile = {
    displayName: 'Max Mustermann',
    dateOfBirth: '1995-06-15',
    photoUrl: 'https://example.com/avatar.png',
  }

  it('CLUB_ADMIN happy path — creates club + team and updates profile', async () => {
    const { prisma, clubsService, service } = createService()
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      registrationRole: RegistrationRole.CLUB_ADMIN,
    })
    prisma.user.update.mockResolvedValue({ id: 'user-1' })
    clubsService.createClubWithTeam.mockResolvedValue({
      club: { id: 'club-1' },
      team: { id: 'team-1' },
    })

    await service.completeOnboarding('user-1', {
      registrationRole: RegistrationRole.CLUB_ADMIN,
      profile,
      clubCreate: {
        name: 'FC Onboard',
        primaryColor: '#1E3A5F',
        badgeUrl: 'https://example.com/badge.png',
        welcomeText: 'Willkommen!',
        firstTeamName: 'Erste',
      },
    })

    expect(clubsService.createClubWithTeam).toHaveBeenCalledWith(
      'user-1',
      {
        name: 'FC Onboard',
        primaryColor: '#1E3A5F',
        badgeUrl: 'https://example.com/badge.png',
        welcomeText: 'Willkommen!',
      },
      { name: 'Erste' },
    )

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          name: 'Max Mustermann',
          avatarUrl: 'https://example.com/avatar.png',
        }),
      }),
    )
  })

  it('COACH happy path — redeems invite code', async () => {
    const { prisma, invitesService, service } = createService()
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-2',
      registrationRole: RegistrationRole.COACH,
    })
    prisma.user.update.mockResolvedValue({ id: 'user-2' })
    invitesService.redeem.mockResolvedValue({ ok: true })

    await service.completeOnboarding('user-2', {
      registrationRole: RegistrationRole.COACH,
      profile,
      join: { inviteCode: 'COACH123' },
    })

    expect(invitesService.redeem).toHaveBeenCalledWith('COACH123', 'user-2', {})
  })

  it('PLAYER happy path — redeems invite code', async () => {
    const { prisma, invitesService, service } = createService()
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-3',
      registrationRole: RegistrationRole.PLAYER,
    })
    prisma.user.update.mockResolvedValue({ id: 'user-3' })
    invitesService.redeem.mockResolvedValue({ ok: true })

    await service.completeOnboarding('user-3', {
      registrationRole: RegistrationRole.PLAYER,
      profile,
      join: { inviteCode: 'PLAY123' },
    })

    expect(invitesService.redeem).toHaveBeenCalledWith('PLAY123', 'user-3', {})
  })

  it('FREE_AGENT happy path — translates payload to profile write input', async () => {
    const { prisma, marketplaceService, service } = createService()
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-4',
      registrationRole: RegistrationRole.FREE_AGENT,
    })
    prisma.user.update.mockResolvedValue({ id: 'user-4' })
    marketplaceService.createFreeAgentProfile.mockResolvedValue({ id: 'fa-1' })

    await service.completeOnboarding('user-4', {
      registrationRole: RegistrationRole.FREE_AGENT,
      profile,
      freeAgent: {
        position: ['MID'],
        experienceYears: 5,
        location: 'Berlin',
        availableForTrials: true,
        bio: 'Ball-playing midfielder',
      },
    })

    expect(marketplaceService.createFreeAgentProfile).toHaveBeenCalledWith(
      'user-4',
      expect.objectContaining({
        position: PlayerPosition.MID,
        city: 'Berlin',
        bio: 'Ball-playing midfielder',
        isOnTransferList: true,
        visibility: FreeAgentVisibility.PUBLIC,
      }),
    )
  })

  it('PARENT happy path — redeems approval invite code', async () => {
    const { prisma, invitesService, service } = createService()
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-5',
      registrationRole: RegistrationRole.PARENT,
    })
    prisma.user.update.mockResolvedValue({ id: 'user-5' })
    invitesService.redeem.mockResolvedValue({ ok: true })

    await service.completeOnboarding('user-5', {
      registrationRole: RegistrationRole.PARENT,
      profile,
      parentLink: { approvalInviteCode: 'APPROVE123' },
    })

    expect(invitesService.redeem).toHaveBeenCalledWith(
      'APPROVE123',
      'user-5',
      {},
    )
  })

  it('rejects when payload registrationRole does not match user record', async () => {
    const { prisma, service } = createService()
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-6',
      registrationRole: RegistrationRole.PLAYER,
    })

    await expect(
      service.completeOnboarding('user-6', {
        registrationRole: RegistrationRole.CLUB_ADMIN,
        profile,
        clubCreate: {
          name: 'FC Mismatch',
          primaryColor: '#1E3A5F',
          firstTeamName: 'Erste',
        },
      }),
    ).rejects.toThrow(/registrationRole/)
  })

  it('rejects with NotFoundException when user is missing', async () => {
    const { prisma, service } = createService()
    prisma.user.findUnique.mockResolvedValue(null)

    await expect(
      service.completeOnboarding('missing-user', {
        registrationRole: RegistrationRole.COACH,
        profile,
        join: { inviteCode: 'COACH123' },
      }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('COACH with clubId (no inviteCode) — throws NotImplementedException', async () => {
    const { prisma, service } = createService()
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-7',
      registrationRole: RegistrationRole.COACH,
    })
    prisma.user.update.mockResolvedValue({ id: 'user-7' })

    await expect(
      service.completeOnboarding('user-7', {
        registrationRole: RegistrationRole.COACH,
        profile,
        join: { clubId: 'clx1234567890abcdef123456' },
      }),
    ).rejects.toBeInstanceOf(NotImplementedException)
  })

  it('PARENT with childEmail (no approvalInviteCode) — throws NotImplementedException', async () => {
    const { prisma, service } = createService()
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-8',
      registrationRole: RegistrationRole.PARENT,
    })
    prisma.user.update.mockResolvedValue({ id: 'user-8' })

    await expect(
      service.completeOnboarding('user-8', {
        registrationRole: RegistrationRole.PARENT,
        profile,
        parentLink: { childEmail: 'child@example.com' },
      }),
    ).rejects.toBeInstanceOf(NotImplementedException)
  })

  it('FREE_AGENT with all invalid positions — rejects with BadRequestException', async () => {
    const { prisma, service } = createService()
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-9',
      registrationRole: RegistrationRole.FREE_AGENT,
    })
    prisma.user.update.mockResolvedValue({ id: 'user-9' })

    await expect(
      service.completeOnboarding('user-9', {
        registrationRole: RegistrationRole.FREE_AGENT,
        profile,
        freeAgent: {
          position: ['GOALIE'],
          experienceYears: 3,
          location: 'Hamburg',
          availableForTrials: false,
          bio: '',
        },
      }),
    ).rejects.toThrow(/GK, DEF, MID, FWD/)
  })
})
