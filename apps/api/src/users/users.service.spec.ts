import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import {
  FreeAgentVisibility,
  MembershipRole,
  PlayerPosition,
  RegistrationRole,
} from '@anstoss/shared'
import {
  AUTH_IDENTITY_PROVIDER_CLERK,
  hashAuthSubject,
} from '../auth/auth-identity-tombstone'
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

describe('UsersService.getClubProfile', () => {
  function createService() {
    const prisma = {
      membership: {
        findUnique: jest.fn(),
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

  it('returns a member profile when the requester belongs to the same club', async () => {
    const { prisma, service } = createService()
    const targetMembership = {
      userId: 'target-1',
      clubId: 'club-1',
      user: {
        id: 'target-1',
        name: 'Tara Target',
        avatarUrl: null,
        teamMembers: [],
      },
    }
    prisma.membership.findUnique
      .mockResolvedValueOnce({ userId: 'requester-1' })
      .mockResolvedValueOnce(targetMembership)

    await expect(
      service.getClubProfile('requester-1', 'target-1', 'club-1'),
    ).resolves.toBe(targetMembership)

    expect(prisma.membership.findUnique).toHaveBeenNthCalledWith(1, {
      where: { userId_clubId: { userId: 'requester-1', clubId: 'club-1' } },
      select: { userId: true },
    })
    expect(prisma.membership.findUnique).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { userId_clubId: { userId: 'target-1', clubId: 'club-1' } },
      }),
    )
  })

  it('does not expose a club member profile to an outsider', async () => {
    const { prisma, service } = createService()
    prisma.membership.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        userId: 'target-1',
        clubId: 'club-1',
        user: { id: 'target-1', name: 'Tara Target' },
      })

    await expect(
      service.getClubProfile('outsider-1', 'target-1', 'club-1'),
    ).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('UsersService.deleteAccount', () => {
  function createService() {
    const deleteMany = () => jest.fn().mockResolvedValue({ count: 0 })
    const updateMany = () => jest.fn().mockResolvedValue({ count: 0 })
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue(undefined),
      $executeRaw: jest.fn().mockResolvedValue(0),
      authIdentityTombstone: { upsert: jest.fn().mockResolvedValue({}) },
      teamAccess: { deleteMany: deleteMany() },
      teamMember: { deleteMany: deleteMany() },
      channelMember: { deleteMany: deleteMany() },
      conversationParticipant: { deleteMany: deleteMany() },
      membership: { deleteMany: deleteMany() },
      joinRequest: { deleteMany: deleteMany() },
      messageReaction: { deleteMany: deleteMany() },
      messageReadReceipt: { deleteMany: deleteMany() },
      messageReport: { deleteMany: deleteMany() },
      userBlock: { deleteMany: deleteMany() },
      pollVote: { deleteMany: deleteMany() },
      rsvp: { deleteMany: deleteMany() },
      eventReminderPreference: { deleteMany: deleteMany() },
      eventCheckIn: { deleteMany: deleteMany() },
      messageTranslation: { deleteMany: deleteMany() },
      message: { updateMany: updateMany() },
      directMessageTranslation: { deleteMany: deleteMany() },
      directMessage: { updateMany: updateMany() },
      pushToken: { deleteMany: deleteMany() },
      notificationPreference: { deleteMany: deleteMany() },
      otpCode: { deleteMany: deleteMany() },
      guardianRelationship: { deleteMany: deleteMany() },
      parentalConsent: {
        deleteMany: deleteMany(),
        updateMany: updateMany(),
      },
      parentHandoff: { deleteMany: deleteMany(), updateMany: updateMany() },
      invite: { updateMany: updateMany() },
      rosterSlot: { updateMany: updateMany() },
      injuryReport: { deleteMany: deleteMany() },
      teamDutyAssignment: { deleteMany: deleteMany() },
      trialInvite: { deleteMany: deleteMany() },
      user: {
        updateMany: updateMany(),
        update: jest.fn().mockResolvedValue({ id: 'user-1' }),
      },
      freeAgentMedia: { deleteMany: deleteMany() },
      freeAgentExperience: { deleteMany: deleteMany() },
      freeAgentProfile: { delete: jest.fn().mockResolvedValue({}) },
      contributionAssignment: { updateMany: updateMany() },
      contributionReminder: { deleteMany: deleteMany() },
      auditLog: { updateMany: updateMany() },
      supportAction: { updateMany: updateMany() },
    }
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'Player@Example.com',
          clerkId: null,
          avatarUrl: null,
          freeAgentProfile: { id: 'profile-1' },
        }),
      },
      membership: { findMany: jest.fn().mockResolvedValue([{ clubId: 'club-1' }]) },
      teamAccess: { findMany: jest.fn().mockResolvedValue([]) },
      teamMember: { findMany: jest.fn().mockResolvedValue([]) },
      guardianRelationship: { findMany: jest.fn().mockResolvedValue([]) },
      parentalConsent: { findMany: jest.fn().mockResolvedValue([]) },
      message: { findMany: jest.fn().mockResolvedValue([]) },
      eventCheckIn: { findMany: jest.fn().mockResolvedValue([]) },
      injuryReport: { findMany: jest.fn().mockResolvedValue([]) },
      teamDutyAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      trialInvite: { findMany: jest.fn().mockResolvedValue([]) },
      contributionAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      contributionRecord: { findMany: jest.fn().mockResolvedValue([]) },
      contributionReminder: { findMany: jest.fn().mockResolvedValue([]) },
      invite: { findMany: jest.fn().mockResolvedValue([]) },
      notificationPreference: { findMany: jest.fn().mockResolvedValue([]) },
      rsvp: { findMany: jest.fn().mockResolvedValue([]) },
      eventReminderPreference: { findMany: jest.fn().mockResolvedValue([]) },
      freeAgentMedia: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    }

    const service = new UsersService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    )

    return { prisma, tx, service }
  }

  it('removes cached translations, direct-message content, and live participation rows before anonymizing the user', async () => {
    const { tx, service } = createService()

    await expect(service.deleteAccount('user-1')).resolves.toEqual({ success: true })

    expect(tx.messageTranslation.deleteMany).toHaveBeenCalledWith({
      where: { message: { is: { senderId: 'user-1' } } },
    })
    expect(tx.message.updateMany).toHaveBeenCalledWith({
      where: { senderId: 'user-1' },
      data: expect.objectContaining({
        content: '[deleted]',
        attachmentUrl: null,
      }),
    })
    expect(tx.directMessageTranslation.deleteMany).toHaveBeenCalledWith({
      where: { directMessage: { is: { senderId: 'user-1' } } },
    })
    expect(tx.directMessage.updateMany).toHaveBeenCalledWith({
      where: { senderId: 'user-1' },
      data: { content: '[deleted]' },
    })
    expect(tx.rsvp.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } })
    expect(tx.eventCheckIn.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    })
    expect(tx.parentHandoff.deleteMany).toHaveBeenCalledWith({
      where: { sourceUserId: 'user-1' },
    })
    expect(tx.rosterSlot.updateMany).toHaveBeenCalledWith({
      where: { claimedByUserId: 'user-1' },
      data: expect.objectContaining({
        fullName: 'Deleted player',
        phone: null,
        dateOfBirth: null,
        claimedByUserId: null,
      }),
    })
    expect(tx.supportAction.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { actorId: 'user-1' },
          { actorEmail: 'Player@Example.com' },
          { actorEmail: 'player@example.com' },
        ]),
      }),
      data: {
        actorId: 'deleted-user',
        actorEmail: 'deleted-user-1@anstoss.io',
      },
    })
    expect(tx.otpCode.deleteMany).toHaveBeenCalledWith({
      where: { email: 'player@example.com' },
    })
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: expect.objectContaining({
        deletedAt: expect.any(Date),
        clerkId: null,
        managedById: null,
        name: 'Deleted User',
        email: 'deleted-user-1@anstoss.io',
        avatarUrl: null,
        dateOfBirth: null,
      }),
    })
  })

  it('tombstones legacy Clerk subjects during deletion', async () => {
    const { prisma, tx, service } = createService()
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'player@example.com',
      clerkId: 'clerk-user-1',
      avatarUrl: null,
      freeAgentProfile: null,
    })

    await service.deleteAccount('user-1')

    expect(tx.$queryRaw).toHaveBeenCalled()
    expect(tx.authIdentityTombstone.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          deletedUserId: 'user-1',
          reason: 'account_deletion',
        }),
      }),
    )
  })

  it('deletes R2 objects referenced by account-owned media after the DB cleanup commits', async () => {
    const { prisma, service } = createService()
    const r2 = {
      objectKeyFromUrl: jest.fn((url: string) =>
        url.startsWith('https://assets.example/')
          ? url.replace('https://assets.example/', '')
          : null,
      ),
      deleteObjects: jest.fn().mockResolvedValue(undefined),
    }
    ;(service as any).r2 = r2
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'player@example.com',
      clerkId: null,
      avatarUrl: 'https://assets.example/users/user-1/avatar.png',
      freeAgentProfile: { id: 'profile-1' },
    })
    prisma.message.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { attachmentUrl: 'https://assets.example/chat/club-1/file.png' },
    ])
    prisma.freeAgentMedia.findMany.mockResolvedValue([
      {
        url: 'https://assets.example/users/user-1/free-agent/photo.png',
        thumbnailUrl: null,
      },
    ])

    await service.deleteAccount('user-1')

    expect(r2.deleteObjects).toHaveBeenCalledWith([
      'users/user-1/avatar.png',
      'chat/club-1/file.png',
      'users/user-1/free-agent/photo.png',
    ])
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
    const invitesService = {
      redeem: jest.fn(),
      validate: jest.fn().mockResolvedValue({ id: 'invite-1' }),
    }
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

  it('omits avatarUrl from the profile update when photoUrl is absent', async () => {
    const { prisma, clubsService, service } = createService()
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1b',
      registrationRole: RegistrationRole.CLUB_ADMIN,
    })
    prisma.user.update.mockResolvedValue({ id: 'user-1b' })
    clubsService.createClubWithTeam.mockResolvedValue({
      club: { id: 'club-2' },
      team: { id: 'team-2' },
    })

    const { photoUrl: _photoUrl, ...profileWithoutPhoto } = profile

    await service.completeOnboarding('user-1b', {
      registrationRole: RegistrationRole.CLUB_ADMIN,
      profile: profileWithoutPhoto,
      clubCreate: {
        name: 'FC NoPhoto',
        primaryColor: '#1E3A5F',
        firstTeamName: 'Erste',
      },
    })

    const updateCall = prisma.user.update.mock.calls[0][0]
    expect(updateCall.data).not.toHaveProperty('avatarUrl')
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

    expect(invitesService.redeem).toHaveBeenCalledWith('COACH123', 'user-2')
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

    expect(invitesService.redeem).toHaveBeenCalledWith('PLAY123', 'user-3')
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

    expect(invitesService.redeem).toHaveBeenCalledWith('APPROVE123', 'user-5')
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

  it('COACH with clubId (no inviteCode) — returns pending_club status', async () => {
    // Used to throw NotImplementedException, locking COACH/PLAYER signups
    // without an invite code. Now returns a pending payload so the wizard
    // finishes cleanly; the user lands on home with a "join a club" CTA.
    const { prisma, service } = createService()
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-7',
      registrationRole: RegistrationRole.COACH,
    })
    prisma.user.update.mockResolvedValue({ id: 'user-7' })

    const result = await service.completeOnboarding('user-7', {
      registrationRole: RegistrationRole.COACH,
      profile,
      join: { clubId: 'clx1234567890abcdef123456' },
    })

    expect(result).toMatchObject({
      status: 'pending_club',
      role: RegistrationRole.COACH,
    })
  })

  it('PARENT with childEmail (no approvalInviteCode) — returns pending_parent_link status', async () => {
    const { prisma, service } = createService()
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-8',
      registrationRole: RegistrationRole.PARENT,
    })
    prisma.user.update.mockResolvedValue({ id: 'user-8' })

    const result = await service.completeOnboarding('user-8', {
      registrationRole: RegistrationRole.PARENT,
      profile,
      parentLink: { childEmail: 'child@example.com' },
    })

    expect(result).toMatchObject({
      status: 'pending_parent_link',
      role: RegistrationRole.PARENT,
    })
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

describe('UsersService.removeUnderageAccountInTransaction', () => {
  it('locks and tombstones the Clerk subject before anonymizing the underage user', async () => {
    const service = new UsersService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    )
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      authIdentityTombstone: {
        upsert: jest.fn().mockResolvedValue({ id: 'tombstone-1' }),
      },
      user: {
        update: jest.fn().mockResolvedValue({ id: 'child-1' }),
      },
    }

    await (service as any).removeUnderageAccountInTransaction(
      tx,
      'child-1',
      'clerk_child_1',
    )

    expect(tx.$queryRaw).toHaveBeenCalled()
    expect(tx.authIdentityTombstone.upsert).toHaveBeenCalledWith({
      where: {
        provider_subjectHash: {
          provider: AUTH_IDENTITY_PROVIDER_CLERK,
          subjectHash: hashAuthSubject('clerk_child_1'),
        },
      },
      update: {
        deletedUserId: 'child-1',
        reason: 'underage_parent_handoff',
      },
      create: {
        provider: AUTH_IDENTITY_PROVIDER_CLERK,
        subjectHash: hashAuthSubject('clerk_child_1'),
        deletedUserId: 'child-1',
        reason: 'underage_parent_handoff',
      },
    })
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'child-1' },
      data: {
        deletedAt: expect.any(Date),
        clerkId: null,
        name: 'Deleted Underage User',
        email: 'deleted-underage-child-1@anstoss.io',
        dateOfBirth: null,
      },
    })
  })
})
