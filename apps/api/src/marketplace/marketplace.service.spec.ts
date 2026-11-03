import '../../test/future-capabilities'

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import {
  FreeAgentVisibility,
  PlayerPosition,
  PreferredFoot,
  RegistrationRole,
  TrialInviteStatus,
  type FreeAgentProfileWriteInput,
} from '@anstoss/shared'
import { MarketplaceService } from './marketplace.service'

describe('MarketplaceService — free-agent profile', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  function createService() {
    const user = { findUnique: jest.fn() }
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      user,
      trialInvite: { findMany: jest.fn().mockResolvedValue([]) },
      freeAgentProfile: {
        update: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      freeAgentExperience: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    }

    const prisma = {
      user,
      freeAgentProfile: {
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      freeAgentExperience: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      // Wechselbörse review: open trials are closed before a delete (M3),
      // club staff is resolved via admin membership / coach access (H3).
      trialInvite: { findMany: jest.fn().mockResolvedValue([]) },
      membership: { findFirst: jest.fn().mockResolvedValue(null) },
      teamAccess: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    }

    const push = {
      sendToUser: jest.fn().mockResolvedValue(undefined),
    }

    const service = new MarketplaceService(prisma as never, push as never)

    return { prisma, push, service, tx }
  }

  function buildWriteInput(
    overrides: Partial<FreeAgentProfileWriteInput> = {},
  ): FreeAgentProfileWriteInput {
    return {
      position: PlayerPosition.FWD,
      preferredFoot: PreferredFoot.RIGHT,
      city: 'Berlin',
      bio: 'Keen to find a team',
      isOnTransferList: true,
      visibility: FreeAgentVisibility.PUBLIC,
      experience: [],
      ...overrides,
    }
  }

  function buildSavedProfile() {
    return {
      id: 'profile-1',
      userId: 'user-1',
      position: PlayerPosition.FWD,
      preferredFoot: PreferredFoot.RIGHT,
      city: 'Berlin',
      bio: 'Keen to find a team',
      isOnTransferList: true,
      visibility: FreeAgentVisibility.PUBLIC,
      experience: [],
      createdAt: new Date('2026-04-01T00:00:00Z'),
      updatedAt: new Date('2026-04-01T00:00:00Z'),
      user: {
        id: 'user-1',
        name: 'Test Player',
        avatarUrl: null,
        dateOfBirth: new Date('1998-05-15'),
        registrationRole: RegistrationRole.FREE_AGENT,
        deletedAt: null,
      },
    }
  }

  describe('createFreeAgentProfile — registration role guard', () => {
    it.each([
      RegistrationRole.PLAYER,
      RegistrationRole.PARENT,
      RegistrationRole.COACH,
      RegistrationRole.CLUB_ADMIN,
    ])('rejects creation for registrationRole %s with ForbiddenException', async (role) => {
      const { service, prisma, tx } = createService()
      prisma.user.findUnique.mockResolvedValue({ registrationRole: role })

      await expect(service.createFreeAgentProfile('user-1', buildWriteInput())).rejects.toThrow(
        ForbiddenException,
      )

      // Guard must short-circuit before any tx work happens.
      expect(tx.freeAgentProfile.create).not.toHaveBeenCalled()
      expect(tx.freeAgentProfile.update).not.toHaveBeenCalled()
    })

    it('throws NotFoundException if the user row does not exist', async () => {
      const { service, prisma, tx } = createService()
      prisma.user.findUnique.mockResolvedValue(null)

      await expect(service.createFreeAgentProfile('user-1', buildWriteInput())).rejects.toThrow(
        NotFoundException,
      )

      expect(tx.freeAgentProfile.create).not.toHaveBeenCalled()
    })

    it('allows creation for a FREE_AGENT-registered user', async () => {
      const { service, prisma, tx } = createService()
      prisma.user.findUnique.mockResolvedValue({
        registrationRole: RegistrationRole.FREE_AGENT,
      })
      prisma.freeAgentProfile.findUnique.mockResolvedValue(null)
      tx.freeAgentProfile.create.mockResolvedValue({ id: 'profile-1' })
      tx.freeAgentProfile.findUnique.mockResolvedValueOnce(null).mockResolvedValue(buildSavedProfile())

      await expect(
        service.createFreeAgentProfile('user-1', buildWriteInput()),
      ).resolves.toMatchObject({ id: 'profile-1', userId: 'user-1' })

      expect(tx.freeAgentProfile.create).toHaveBeenCalledTimes(1)
    })
  })

  describe('updateFreeAgentProfile — registration role guard', () => {
    it.each([
      RegistrationRole.PLAYER,
      RegistrationRole.PARENT,
      RegistrationRole.COACH,
      RegistrationRole.CLUB_ADMIN,
    ])('rejects update for registrationRole %s with ForbiddenException', async (role) => {
      const { service, prisma, tx } = createService()
      prisma.user.findUnique.mockResolvedValue({ registrationRole: role })

      await expect(service.updateFreeAgentProfile('user-1', buildWriteInput())).rejects.toThrow(
        ForbiddenException,
      )

      expect(tx.freeAgentProfile.update).not.toHaveBeenCalled()
    })

    it('allows update for a FREE_AGENT-registered user', async () => {
      const { service, prisma, tx } = createService()
      prisma.user.findUnique.mockResolvedValue({
        registrationRole: RegistrationRole.FREE_AGENT,
      })
      prisma.freeAgentProfile.findUnique.mockResolvedValue({ id: 'profile-1' })
      tx.freeAgentProfile.update.mockResolvedValue({ id: 'profile-1' })
      tx.freeAgentProfile.findUnique.mockResolvedValueOnce({ id: 'profile-1' }).mockResolvedValue(buildSavedProfile())

      await expect(
        service.updateFreeAgentProfile('user-1', buildWriteInput()),
      ).resolves.toMatchObject({ id: 'profile-1', userId: 'user-1' })

      expect(tx.freeAgentProfile.update).toHaveBeenCalledTimes(1)
    })

    it('throws NotFoundException when no profile exists to update', async () => {
      const { service, prisma } = createService()
      prisma.user.findUnique.mockResolvedValue({
        registrationRole: RegistrationRole.FREE_AGENT,
      })
      prisma.freeAgentProfile.findUnique.mockResolvedValue(null)

      await expect(service.updateFreeAgentProfile('user-1', buildWriteInput())).rejects.toThrow(
        NotFoundException,
      )
    })
  })

  describe('deleteFreeAgentProfile', () => {
    it('throws NotFoundException when no profile exists', async () => {
      const { service, prisma } = createService()
      prisma.user.findUnique.mockResolvedValue({
        registrationRole: RegistrationRole.FREE_AGENT,
      })
      prisma.freeAgentProfile.findUnique.mockResolvedValue(null)

      await expect(service.deleteFreeAgentProfile('user-1')).rejects.toThrow(NotFoundException)
    })

    it('hard-deletes the profile (and experience rows) when present', async () => {
      const { service, prisma, tx } = createService()
      prisma.user.findUnique.mockResolvedValue({
        registrationRole: RegistrationRole.FREE_AGENT,
      })
      prisma.freeAgentProfile.findUnique.mockResolvedValue({ id: 'profile-1' })
      tx.freeAgentProfile.findUnique.mockResolvedValue({ id: 'profile-1', media: [] })
      tx.freeAgentProfile.delete.mockResolvedValue({ id: 'profile-1' })

      await expect(service.deleteFreeAgentProfile('user-1')).resolves.toBeUndefined()

      expect(tx.freeAgentExperience.deleteMany).toHaveBeenCalledWith({
        where: { profileId: 'profile-1' },
      })
      expect(tx.freeAgentProfile.delete).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      })
    })

    it.each([
      RegistrationRole.PLAYER,
      RegistrationRole.PARENT,
      RegistrationRole.COACH,
      RegistrationRole.CLUB_ADMIN,
    ])('lets the owner delete their profile whatever their role now (%s, GDPR)', async (role) => {
      const { service, prisma, tx } = createService()
      prisma.user.findUnique.mockResolvedValue({ registrationRole: role })
      prisma.freeAgentProfile.findUnique.mockResolvedValue({ id: 'profile-1' })
      tx.freeAgentProfile.findUnique.mockResolvedValue({ id: 'profile-1', media: [] })

      await expect(service.deleteFreeAgentProfile('user-1')).resolves.toBeUndefined()

      expect(tx.freeAgentProfile.delete).toHaveBeenCalledWith({ where: { userId: 'user-1' } })
    })
  })

  describe('getPublicFreeAgentProfile — visibility regression lock', () => {
    it('throws NotFoundException when the profile is PRIVATE', async () => {
      const { service, prisma } = createService()
      prisma.freeAgentProfile.findUnique.mockResolvedValue({
        ...buildSavedProfile(),
        visibility: FreeAgentVisibility.PRIVATE,
      })

      await expect(service.getPublicFreeAgentProfile('profile-1')).rejects.toThrow(
        NotFoundException,
      )
    })

    it('throws NotFoundException when the profile does not exist', async () => {
      const { service, prisma } = createService()
      prisma.freeAgentProfile.findUnique.mockResolvedValue(null)

      await expect(service.getPublicFreeAgentProfile('profile-1')).rejects.toThrow(
        NotFoundException,
      )
    })

    it('shows a "Vereine" profile to club staff but not to an outsider', async () => {
      const { service, prisma } = createService()
      const clubOnly = { ...buildSavedProfile(), visibility: FreeAgentVisibility.CLUB_ONLY }
      prisma.freeAgentProfile.findUnique.mockResolvedValue(clubOnly)
      prisma.membership.findFirst.mockResolvedValue({ id: 'm-1' })

      await expect(service.getPublicFreeAgentProfile('profile-1', 'coach-1')).resolves.toMatchObject({
        id: 'profile-1',
        age: expect.any(Number),
      })

      prisma.membership.findFirst.mockResolvedValue(null)
      await expect(service.getPublicFreeAgentProfile('profile-1', 'stranger')).rejects.toThrow(
        NotFoundException,
      )
    })

    it('returns the profile when PUBLIC', async () => {
      const { service, prisma } = createService()
      prisma.freeAgentProfile.findUnique.mockResolvedValue(buildSavedProfile())

      await expect(service.getPublicFreeAgentProfile('profile-1')).resolves.toMatchObject({
        id: 'profile-1',
        visibility: FreeAgentVisibility.PUBLIC,
      })
    })
  })

  describe('listFreeAgents — audience', () => {
    function listService(hasMembership: boolean) {
      const prisma = {
        membership: {
          findFirst: jest.fn().mockResolvedValue(hasMembership ? { id: 'm-1' } : null),
        },
        teamAccess: { findFirst: jest.fn().mockResolvedValue(null) },
        freeAgentProfile: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        },
      }
      return { prisma, service: new MarketplaceService(prisma as never, {} as never) }
    }

    const query = { page: 1, pageSize: 12, sort: 'recent' as const }

    it('shows "Vereine" (CLUB_ONLY) profiles to club admins', async () => {
      const { prisma, service } = listService(true)
      await service.listFreeAgents(query, 'coach-1')
      const where = prisma.freeAgentProfile.findMany.mock.calls[0][0].where
      expect(where.visibility).toEqual({
        in: [FreeAgentVisibility.PUBLIC, FreeAgentVisibility.CLUB_ONLY],
      })
      expect(where.isOnTransferList).toBe(true)
    })

    it('hides CLUB_ONLY profiles from callers without a club', async () => {
      const { prisma, service } = listService(false)
      await service.listFreeAgents(query, 'someone')
      expect(prisma.freeAgentProfile.findMany.mock.calls[0][0].where.visibility).toEqual({
        in: [FreeAgentVisibility.PUBLIC],
      })
    })

    it('filters by PLZ region, league and position', async () => {
      const { prisma, service } = listService(true)
      await service.listFreeAgents(
        {
          ...query,
          postalCode: '14482',
          radiusKm: 25,
          league: 'BEZIRKSLIGA',
          position: PlayerPosition.GK,
        },
        'coach-1',
      )
      const where = prisma.freeAgentProfile.findMany.mock.calls[0][0].where
      expect(where.postalCode).toEqual({ startsWith: '14' })
      expect(where.highestLeague).toBe('BEZIRKSLIGA')
      expect(where.position).toBe(PlayerPosition.GK)
    })
  })

  // Shared invite fixture for the pipeline tests below.
  function buildInvite(overrides: Record<string, unknown> = {}) {
    return {
      id: 'invite-1',
      clubId: 'club-1',
      teamId: 'team-1',
      freeAgentProfileId: 'profile-1',
      sentByUserId: 'coach-1',
      message: 'Komm Dienstag zum Training',
      status: TrialInviteStatus.PENDING,
      expiresAt: new Date('2099-01-01T00:00:00Z'),
      respondedAt: null,
      createdAt: new Date('2026-09-01T00:00:00Z'),
      initiatedBy: 'CLUB',
      playerSearchId: null,
      sessionEventIds: ['event-1'],
      feedback: 'Stark im Zweikampf',
      rating: 4,
      attended: true,
      decisionMessage: null,
      decidedAt: null,
      joinRequest: null,
      freeAgentProfile: {
        id: 'profile-1',
        userId: 'user-1',
        position: PlayerPosition.MID,
        preferredFoot: PreferredFoot.RIGHT,
        highestLeague: 'BEZIRKSLIGA',
        user: { id: 'user-1', name: 'Amir Kaya', avatarUrl: null, dateOfBirth: null },
      },
      club: {
        id: 'club-1',
        name: 'SV Albatros',
        badgeUrl: null,
        primaryColor: '#1B4F9C',
      },
      team: { id: 'team-1', displayName: 'Herren II', group: null, leagueName: 'Kreisliga A' },
      sender: { id: 'coach-1', name: 'Mara Schulz' },
      ...overrides,
    }
  }

  describe('respondToTrialInvite — a Probetraining is not joining', () => {
    function createTrialService() {
      const trialTx = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        user: { findFirst: jest.fn().mockResolvedValue({ id: 'user-1' }) },
        membership: { upsert: jest.fn().mockResolvedValue({}) },
        teamAccess: {
          findFirst: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockResolvedValue({}),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        teamMember: { upsert: jest.fn().mockResolvedValue({}) },
        joinRequest: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
        trialInvite: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'invite-1',
            clubId: 'club-1',
            teamId: 'team-1',
            status: TrialInviteStatus.PENDING,
            sessionEventIds: ['event-1'],
          }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: jest.fn().mockImplementation(async () =>
            buildInvite({ status: TrialInviteStatus.ACCEPTED, respondedAt: new Date() }),
          ),
        },
      }

      const prisma = {
        trialInvite: {
          findUnique: jest.fn(),
          update: jest.fn().mockImplementation(async ({ data }: { data: any }) =>
            buildInvite({ status: data.status }),
          ),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        event: { findMany: jest.fn().mockResolvedValue([]) },
        $transaction: jest.fn(async (callback: (client: typeof trialTx) => Promise<unknown>) =>
          callback(trialTx),
        ),
      }

      const push = { sendToUserLocalized: jest.fn().mockResolvedValue(undefined) }
      const entitlements = { assertCanActivatePlayer: jest.fn().mockResolvedValue(undefined) }
      const service = new MarketplaceService(prisma as never, push as never, entitlements as never)
      return { prisma, push, service, trialTx, entitlements }
    }

    it('accepting grants TRIAL team access only: no Membership, no roster row, no seat', async () => {
      const { service, prisma, trialTx, entitlements, push } = createTrialService()
      prisma.trialInvite.findUnique.mockResolvedValue(buildInvite())

      const result = await service.respondToTrialInvite(
        'invite-1',
        'user-1',
        TrialInviteStatus.ACCEPTED,
      )

      expect(result.status).toBe(TrialInviteStatus.ACCEPTED)
      expect(push.sendToUserLocalized).not.toHaveBeenCalled()
      expect(trialTx.membership.upsert).not.toHaveBeenCalled()
      expect(trialTx.teamMember.upsert).not.toHaveBeenCalled()
      expect(entitlements.assertCanActivatePlayer).not.toHaveBeenCalled()
      expect(trialTx.teamAccess.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { teamId_userId_role: { teamId: 'team-1', userId: 'user-1', role: 'PLAYER' } },
          update: { phase: 'TRIAL', status: 'ACTIVE' },
          create: expect.objectContaining({ clubId: 'club-1', phase: 'TRIAL', status: 'ACTIVE' }),
        }),
      )
      expect(trialTx.trialInvite.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'invite-1',
            status: { in: [TrialInviteStatus.PENDING] },
            expiresAt: { gt: expect.any(Date) },
          },
          data: expect.objectContaining({ status: TrialInviteStatus.ACCEPTED }),
        }),
      )
    })

    it('never downgrades a player who already has full access to the team', async () => {
      const { service, prisma, trialTx } = createTrialService()
      prisma.trialInvite.findUnique.mockResolvedValue(buildInvite())
      trialTx.teamAccess.findFirst.mockResolvedValue({ id: 'ta', phase: 'FULL', status: 'ACTIVE' })

      await service.respondToTrialInvite('invite-1', 'user-1', TrialInviteStatus.ACCEPTED)

      expect(trialTx.teamAccess.upsert).not.toHaveBeenCalled()
    })

    it('hides the club-internal feedback from the player view', async () => {
      const { service, prisma } = createTrialService()
      prisma.trialInvite.findUnique.mockResolvedValue(buildInvite())

      const result = await service.respondToTrialInvite(
        'invite-1',
        'user-1',
        TrialInviteStatus.ACCEPTED,
      )

      expect(result).not.toHaveProperty('feedback')
      expect(result).not.toHaveProperty('rating')
      expect(result.player.name).toBe('Amir Kaya')
    })

    it('declining marks the invite DECLINED and ends any trial access', async () => {
      const { service, prisma, trialTx } = createTrialService()
      prisma.trialInvite.findUnique.mockResolvedValue(buildInvite())
      trialTx.trialInvite.findUniqueOrThrow.mockResolvedValue(
        buildInvite({ status: TrialInviteStatus.DECLINED, respondedAt: new Date() }),
      )

      const result = await service.respondToTrialInvite(
        'invite-1',
        'user-1',
        TrialInviteStatus.DECLINED,
      )

      expect(result.status).toBe(TrialInviteStatus.DECLINED)
      expect(trialTx.teamAccess.upsert).not.toHaveBeenCalled()
      expect(trialTx.teamAccess.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ teamId: 'team-1', userId: 'user-1', phase: 'TRIAL' }),
          data: { status: 'REVOKED' },
        }),
      )
    })

    it('lets the player withdraw a request that the club has not answered yet', async () => {
      const { service, prisma, trialTx } = createTrialService()
      prisma.trialInvite.findUnique.mockResolvedValue(
        buildInvite({ status: TrialInviteStatus.REQUESTED, initiatedBy: 'PLAYER' }),
      )

      await service.respondToTrialInvite('invite-1', 'user-1', TrialInviteStatus.WITHDRAWN)

      expect(trialTx.trialInvite.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'invite-1',
          status: {
            in: [
              TrialInviteStatus.REQUESTED,
              TrialInviteStatus.PENDING,
              TrialInviteStatus.ACCEPTED,
            ],
          },
        },
        data: { status: TrialInviteStatus.WITHDRAWN, respondedAt: expect.any(Date) },
      })
    })

    it('ACCEPT_OFFER keeps the offer open and only records the answer', async () => {
      const { service, prisma, trialTx } = createTrialService()
      prisma.trialInvite.findUnique.mockResolvedValue(
        buildInvite({ status: TrialInviteStatus.OFFERED }),
      )

      await service.respondToTrialInvite('invite-1', 'user-1', 'ACCEPT_OFFER')

      expect(trialTx.trialInvite.updateMany).toHaveBeenCalledWith({
        where: { id: 'invite-1', status: { in: [TrialInviteStatus.OFFERED] } },
        data: { respondedAt: expect.any(Date) },
      })
      expect(trialTx.teamAccess.upsert).not.toHaveBeenCalled()
    })

    it('rejects a losing mixed decision instead of overwriting the winner', async () => {
      const { service, prisma, trialTx } = createTrialService()
      prisma.trialInvite.findUnique.mockResolvedValue(buildInvite())
      trialTx.trialInvite.updateMany.mockResolvedValue({ count: 0 })

      await expect(
        service.respondToTrialInvite('invite-1', 'user-1', TrialInviteStatus.DECLINED),
      ).rejects.toThrow('Trial invite has already been handled')
      expect(trialTx.trialInvite.findUniqueOrThrow).not.toHaveBeenCalled()
    })

    it('cannot recreate access for an account deleted before the lifecycle lock', async () => {
      const { service, prisma, trialTx } = createTrialService()
      prisma.trialInvite.findUnique.mockResolvedValue(buildInvite())
      trialTx.user.findFirst.mockResolvedValue(null)

      await expect(
        service.respondToTrialInvite('invite-1', 'user-1', TrialInviteStatus.ACCEPTED),
      ).rejects.toThrow('This account is no longer active')

      expect(trialTx.$executeRaw).toHaveBeenCalledTimes(1)
      expect(trialTx.trialInvite.findFirst).not.toHaveBeenCalled()
      expect(trialTx.teamAccess.upsert).not.toHaveBeenCalled()
    })

    it('revalidates that the invite is still open and route-bound after locking', async () => {
      const { service, prisma, trialTx } = createTrialService()
      prisma.trialInvite.findUnique.mockResolvedValue(buildInvite())
      trialTx.trialInvite.findFirst.mockResolvedValue(null)

      await expect(
        service.respondToTrialInvite('invite-1', 'user-1', TrialInviteStatus.ACCEPTED),
      ).rejects.toThrow('Trial invite is no longer available')

      expect(trialTx.trialInvite.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'invite-1',
          clubId: 'club-1',
          teamId: 'team-1',
          status: { in: [TrialInviteStatus.PENDING] },
          expiresAt: { gt: expect.any(Date) },
          freeAgentProfile: { userId: 'user-1' },
        },
        select: { id: true, clubId: true, teamId: true, status: true, sessionEventIds: true },
      })
      expect(trialTx.teamAccess.upsert).not.toHaveBeenCalled()
    })

    it('rejects an expired invite (marks EXPIRED, grants nothing)', async () => {
      const { service, prisma, trialTx } = createTrialService()
      prisma.trialInvite.findUnique.mockResolvedValue(
        buildInvite({ expiresAt: new Date('2000-01-01T00:00:00Z') }),
      )

      await expect(
        service.respondToTrialInvite('invite-1', 'user-1', TrialInviteStatus.ACCEPTED),
      ).rejects.toThrow(BadRequestException)

      expect(prisma.trialInvite.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'invite-1',
          clubId: 'club-1',
          status: { in: [TrialInviteStatus.REQUESTED, TrialInviteStatus.PENDING] },
        },
        data: { status: TrialInviteStatus.EXPIRED },
      })
      expect(prisma.$transaction).not.toHaveBeenCalled()
      expect(trialTx.teamAccess.upsert).not.toHaveBeenCalled()
    })

    it('rejects an already-decided invite with BadRequestException', async () => {
      const { service, prisma, trialTx } = createTrialService()
      prisma.trialInvite.findUnique.mockResolvedValue(
        buildInvite({ status: TrialInviteStatus.ACCEPTED }),
      )

      await expect(
        service.respondToTrialInvite('invite-1', 'user-1', TrialInviteStatus.ACCEPTED),
      ).rejects.toThrow(BadRequestException)
      expect(trialTx.teamAccess.upsert).not.toHaveBeenCalled()
    })

    it('only the invited user may respond; other users get NotFoundException', async () => {
      const { service, prisma } = createTrialService()
      prisma.trialInvite.findUnique.mockResolvedValue(buildInvite())

      await expect(
        service.respondToTrialInvite('invite-1', 'user-2', TrialInviteStatus.ACCEPTED),
      ).rejects.toThrow(NotFoundException)
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })
  })

  describe('club pipeline — coaches run Probetraining', () => {
    function createClubService(opts: { role?: string; coachedTeams?: string[] } = {}) {
      const tx: any = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        $queryRaw: jest.fn().mockResolvedValue([]),
        user: { findFirst: jest.fn().mockResolvedValue({ id: 'coach-1' }) },
        trialInvite: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: jest.fn(),
          count: jest.fn().mockResolvedValue(0),
        },
        teamAccess: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        joinRequest: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      }
      const prisma = {
        membership: {
          findUnique: jest.fn().mockResolvedValue({ role: opts.role ?? 'COACH' }),
        },
        teamAccess: {
          findMany: jest
            .fn()
            .mockResolvedValue((opts.coachedTeams ?? ['team-1']).map((teamId) => ({ teamId }))),
        },
        freeAgentProfile: { findUnique: jest.fn() },
        team: { findFirst: jest.fn().mockResolvedValue({ id: 'team-1' }) },
        playerSearch: { findFirst: jest.fn() },
        event: { findMany: jest.fn() },
        trialInvite: {
          findFirst: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          create: jest.fn(),
        },
        $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
        ),
      }
      // createTrialInvite runs the open-thread check + create under the thread lock (M7).
      tx.trialInvite.findFirst = prisma.trialInvite.findFirst
      tx.trialInvite.create = prisma.trialInvite.create
      tx.freeAgentProfile = prisma.freeAgentProfile
      tx.membership = prisma.membership
      tx.teamAccess.findMany = prisma.teamAccess.findMany
      const push = { sendToUserLocalized: jest.fn().mockResolvedValue(undefined) }
      const service = new MarketplaceService(prisma as never, push as never)
      return { prisma, tx, push, service }
    }

    const listedProfile = {
      id: 'profile-1',
      isOnTransferList: true,
      visibility: FreeAgentVisibility.CLUB_ONLY,
      user: {
        id: 'user-1',
        name: 'Amir Kaya',
        deletedAt: null,
        dateOfBirth: null,
        registrationRole: RegistrationRole.FREE_AGENT,
      },
    }
    const training = {
      id: 'event-1',
      title: 'Training',
      date: new Date('2099-09-29T17:30:00Z'),
      location: 'Kunstrasen',
      cancelledAt: null,
    }

    it('does not create a club trial if erasure wins before the account lock', async () => {
      const { service, prisma, tx } = createClubService()
      prisma.freeAgentProfile.findUnique.mockResolvedValueOnce(listedProfile).mockResolvedValueOnce(null)
      prisma.event.findMany.mockResolvedValue([training])
      await expect(service.createTrialInvite('club-1', 'coach-1', {
        freeAgentProfileId: 'profile-1', teamId: 'team-1', sessionEventIds: ['event-1'],
      })).rejects.toThrow('Free agent profile not found')
      expect(tx.$executeRaw.mock.calls.map((call: unknown[]) => call[1])).toEqual(expect.arrayContaining(['user-1', 'coach-1']))
      expect(prisma.trialInvite.create).not.toHaveBeenCalled()
    })

    it('rechecks staff authority after acquiring lifecycle and scope locks', async () => {
      const { service, prisma, tx } = createClubService()
      prisma.membership.findUnique.mockResolvedValueOnce({ role: 'COACH' }).mockResolvedValueOnce(null)
      prisma.freeAgentProfile.findUnique.mockResolvedValue(listedProfile)
      prisma.event.findMany.mockResolvedValue([training])
      await expect(service.createTrialInvite('club-1', 'coach-1', {
        freeAgentProfileId: 'profile-1', teamId: 'team-1', sessionEventIds: ['event-1'],
      })).rejects.toThrow('Not a member')
      expect(tx.trialInvite.create).not.toHaveBeenCalled()
    })

    it('does not apply a trial action after staff membership is revoked', async () => {
      const { service, prisma, tx } = createClubService()
      prisma.membership.findUnique.mockResolvedValueOnce({ role: 'COACH' }).mockResolvedValueOnce(null)
      prisma.trialInvite.findFirst.mockResolvedValue(buildInvite({ status: TrialInviteStatus.ACCEPTED }))
      await expect(service.applyClubTrialAction('club-1', 'invite-1', 'coach-1', {
        action: 'offer', message: 'Offer',
      })).rejects.toThrow('Not a member')
      expect(tx.trialInvite.updateMany).not.toHaveBeenCalled()
    })

    it('lets the coach of the team invite to up to three upcoming trainings', async () => {
      const { service, prisma, push } = createClubService()
      prisma.freeAgentProfile.findUnique.mockResolvedValue(listedProfile)
      prisma.event.findMany.mockResolvedValue([training])
      prisma.trialInvite.findFirst.mockResolvedValue(null)
      prisma.trialInvite.create.mockImplementation(async ({ data }: any) =>
        buildInvite({ ...data, status: TrialInviteStatus.PENDING }),
      )

      const invite = await service.createTrialInvite('club-1', 'coach-1', {
        freeAgentProfileId: 'profile-1',
        teamId: 'team-1',
        sessionEventIds: ['event-1'],
      })

      expect(prisma.teamAccess.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ phase: 'FULL', status: 'ACTIVE' }),
      }))

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['event-1'] },
            clubId: 'club-1',
            teamId: 'team-1',
            type: 'TRAINING',
            cancelledAt: null,
          }),
        }),
      )
      const data = prisma.trialInvite.create.mock.calls[0][0].data
      expect(data).toMatchObject({
        status: TrialInviteStatus.PENDING,
        initiatedBy: 'CLUB',
        sessionEventIds: ['event-1'],
      })
      // Invites lapse no later than the first session.
      expect(data.expiresAt.getTime()).toBeLessThanOrEqual(training.date.getTime())
      expect(invite.sessions).toHaveLength(1)
      expect(invite.rating).toBe(4)
      expect(push.sendToUserLocalized).toHaveBeenCalledWith(
        'user-1',
        'TRIAL_INVITE',
        expect.anything(),
        expect.anything(),
        expect.anything(),
      )
    })

    it('refuses sessions that are not upcoming trainings of that team', async () => {
      const { service, prisma } = createClubService()
      prisma.freeAgentProfile.findUnique.mockResolvedValue(listedProfile)
      prisma.event.findMany.mockResolvedValue([])

      await expect(
        service.createTrialInvite('club-1', 'coach-1', {
          freeAgentProfileId: 'profile-1',
          teamId: 'team-1',
          sessionEventIds: ['match-1'],
        }),
      ).rejects.toThrow(BadRequestException)
      expect(prisma.trialInvite.create).not.toHaveBeenCalled()
    })

    it('keeps a coach inside their own teams', async () => {
      const { service, prisma } = createClubService({ coachedTeams: ['team-7'] })

      await expect(
        service.createTrialInvite('club-1', 'coach-1', {
          freeAgentProfileId: 'profile-1',
          teamId: 'team-1',
          sessionEventIds: ['event-1'],
        }),
      ).rejects.toThrow(NotFoundException)
      expect(prisma.freeAgentProfile.findUnique).not.toHaveBeenCalled()
    })

    it('forbids plain players from inviting', async () => {
      const { service } = createClubService({ role: 'PLAYER', coachedTeams: [] })

      await expect(service.listClubTrialInvites('club-1', 'player-1')).rejects.toThrow(
        ForbiddenException,
      )
    })

    it('does not invite a player who is hidden or not searching', async () => {
      const { service, prisma } = createClubService()
      prisma.freeAgentProfile.findUnique.mockResolvedValue({
        ...listedProfile,
        visibility: FreeAgentVisibility.PRIVATE,
      })

      await expect(
        service.createTrialInvite('club-1', 'coach-1', {
          freeAgentProfileId: 'profile-1',
          teamId: 'team-1',
          sessionEventIds: ['event-1'],
        }),
      ).rejects.toThrow(BadRequestException)
    })

    it('offers a place after the Probetraining and tells the player', async () => {
      const { service, prisma, tx, push } = createClubService({ role: 'ADMIN' })
      prisma.trialInvite.findFirst.mockResolvedValue(
        buildInvite({ status: TrialInviteStatus.ACCEPTED }),
      )
      prisma.event.findMany.mockResolvedValue([])
      tx.trialInvite.findUniqueOrThrow.mockResolvedValue(
        buildInvite({ status: TrialInviteStatus.OFFERED, decidedAt: new Date() }),
      )

      const result = await service.applyClubTrialAction('club-1', 'invite-1', 'admin-1', {
        action: 'offer',
        message: 'Wir würden dich gern im Kader sehen.',
      })

      expect(tx.trialInvite.updateMany).toHaveBeenCalledWith({
        where: { id: 'invite-1', clubId: 'club-1', teamId: 'team-1', freeAgentProfileId: 'profile-1', status: { in: [TrialInviteStatus.ACCEPTED] } },
        data: expect.objectContaining({
          status: TrialInviteStatus.OFFERED,
          decidedByUserId: 'admin-1',
          decisionMessage: 'Wir würden dich gern im Kader sehen.',
        }),
      })
      expect(result.status).toBe(TrialInviteStatus.OFFERED)
      expect(push.sendToUserLocalized).toHaveBeenCalledWith(
        'user-1',
        'TRIAL_OFFER',
        expect.anything(),
        expect.anything(),
        expect.anything(),
      )
    })

    it('rejecting closes the trial and revokes trial access', async () => {
      const { service, prisma, tx } = createClubService()
      prisma.trialInvite.findFirst.mockResolvedValue(
        buildInvite({ status: TrialInviteStatus.ACCEPTED }),
      )
      prisma.event.findMany.mockResolvedValue([])
      tx.trialInvite.findUniqueOrThrow.mockResolvedValue(
        buildInvite({ status: TrialInviteStatus.REJECTED }),
      )

      await service.applyClubTrialAction('club-1', 'invite-1', 'coach-1', { action: 'reject' })

      expect(tx.teamAccess.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ teamId: 'team-1', userId: 'user-1', phase: 'TRIAL' }),
          data: { status: 'REVOKED' },
        }),
      )
    })

    it('records feedback without moving the stage', async () => {
      const { service, prisma, tx } = createClubService()
      prisma.trialInvite.findFirst.mockResolvedValue(
        buildInvite({ status: TrialInviteStatus.ACCEPTED }),
      )
      prisma.event.findMany.mockResolvedValue([])
      tx.trialInvite.findUniqueOrThrow.mockResolvedValue(buildInvite({ status: 'ACCEPTED' }))

      await service.applyClubTrialAction('club-1', 'invite-1', 'coach-1', {
        action: 'feedback',
        rating: 5,
        feedback: 'Sehr gutes Passspiel',
        attended: true,
      })

      expect(tx.trialInvite.updateMany).toHaveBeenCalledWith({
        where: expect.anything(),
        data: { rating: 5, feedback: 'Sehr gutes Passspiel', attended: true },
      })
    })

    it('refuses steps that do not fit the stage', async () => {
      const { service, prisma, tx } = createClubService()
      prisma.trialInvite.findFirst.mockResolvedValue(
        buildInvite({ status: TrialInviteStatus.REQUESTED }),
      )

      await expect(
        service.applyClubTrialAction('club-1', 'invite-1', 'coach-1', { action: 'offer' }),
      ).rejects.toThrow(BadRequestException)
      expect(tx.trialInvite.updateMany).not.toHaveBeenCalled()
    })

    it('turns a player request into an invitation for concrete sessions', async () => {
      const { service, prisma, tx } = createClubService()
      prisma.trialInvite.findFirst.mockResolvedValue(
        buildInvite({ status: TrialInviteStatus.REQUESTED, sessionEventIds: [] }),
      )
      prisma.event.findMany.mockResolvedValue([training])
      tx.trialInvite.findUniqueOrThrow.mockResolvedValue(
        buildInvite({ status: TrialInviteStatus.PENDING }),
      )

      await service.applyClubTrialAction('club-1', 'invite-1', 'coach-1', {
        action: 'invite',
        sessionEventIds: ['event-1'],
      })

      expect(tx.trialInvite.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'invite-1',
          clubId: 'club-1',
          teamId: 'team-1',
          freeAgentProfileId: 'profile-1',
          status: { in: [TrialInviteStatus.REQUESTED, TrialInviteStatus.PENDING] },
        },
        data: expect.objectContaining({
          status: TrialInviteStatus.PENDING,
          sessionEventIds: ['event-1'],
        }),
      })
    })
  })

  describe('createTrialRequest — "Probetraining anfragen"', () => {
    function requestService() {
      const user = {
        findUnique: jest.fn().mockResolvedValue({ registrationRole: RegistrationRole.FREE_AGENT }),
        findFirst: jest.fn().mockResolvedValue({ id: 'coach-9' }),
      }
      const freeAgentProfile = {
        findUnique: jest.fn().mockResolvedValue({
          id: 'profile-1',
          user: { id: 'user-1', name: 'Amir Kaya' },
        }),
      }
      const tx = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        $queryRaw: jest.fn().mockResolvedValue([]),
        user,
        freeAgentProfile,
        membership: { findUnique: jest.fn().mockResolvedValue({ role: 'COACH' }) },
        teamAccess: { findMany: jest.fn().mockResolvedValue([{ teamId: 'team-2' }]) },
        playerSearch: { findFirst: jest.fn().mockResolvedValue({
          id: 'search-1', clubId: 'club-1', teamId: 'team-2', createdByUserId: 'coach-9',
          expiresAt: null, team: { id: 'team-2' },
        }) },
        trialInvite: {
          findFirst: jest.fn().mockResolvedValue(null),
          count: jest.fn().mockResolvedValue(0),
          create: jest.fn().mockImplementation(async ({ data }: any) =>
            buildInvite({ ...data, feedback: null, rating: null }),
          ),
        },
      }
      const prisma = {
        user,
        freeAgentProfile,
        playerSearch: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'search-1',
            clubId: 'club-1',
            teamId: 'team-2',
            createdByUserId: 'coach-9',
            expiresAt: null,
            team: { id: 'team-2', displayName: 'Herren II' },
          }),
        },
        $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
        ),
      }
      const push = { sendToUserLocalized: jest.fn().mockResolvedValue(undefined) }
      return { tx, prisma, push, service: new MarketplaceService(prisma as never, push as never) }
    }

    it('opens a REQUESTED thread with the coach who posted the Gesuch', async () => {
      const { service, tx, push } = requestService()

      await service.createTrialRequest('search-1', 'user-1', { message: 'Spiele Torwart seit 8 Jahren' })

      expect(tx.trialInvite.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            clubId: 'club-1',
            teamId: 'team-2',
            status: TrialInviteStatus.REQUESTED,
            initiatedBy: 'PLAYER',
            playerSearchId: 'search-1',
            sentByUserId: 'coach-9',
            sessionEventIds: [],
          }),
        }),
      )
      expect(push.sendToUserLocalized).not.toHaveBeenCalled()
    })

    it('allows only one open trial per club', async () => {
      const { service, tx } = requestService()
      tx.trialInvite.findFirst.mockResolvedValue({ id: 'invite-open' })

      await expect(service.createTrialRequest('search-1', 'user-1', {})).rejects.toThrow(
        BadRequestException,
      )
      expect(tx.trialInvite.create).not.toHaveBeenCalled()
    })

    it('does not create a player request if erasure wins before the account lock', async () => {
      const { service, tx } = requestService()
      tx.user.findUnique.mockResolvedValueOnce({ registrationRole: RegistrationRole.FREE_AGENT })
        .mockResolvedValueOnce({ registrationRole: RegistrationRole.FREE_AGENT, deletedAt: new Date() })
      await expect(service.createTrialRequest('search-1', 'user-1', {})).rejects.toThrow('User not found')
      expect(tx.$executeRaw.mock.calls.map((call: unknown[]) => call[1]).slice(0, 2)).toEqual(['coach-9', 'user-1'])
      expect(tx.trialInvite.create).not.toHaveBeenCalled()
    })

    it('rejects a search closed while the request waited for account locks', async () => {
      const { service, tx } = requestService()
      tx.playerSearch.findFirst.mockResolvedValue(null)
      await expect(service.createTrialRequest('search-1', 'user-1', {})).rejects.toThrow('no longer open')
      expect(tx.trialInvite.create).not.toHaveBeenCalled()
    })

    it('rejects a request when the search creator was erased before locking', async () => {
      const { service, tx } = requestService()
      tx.user.findFirst.mockResolvedValue(null)
      await expect(service.createTrialRequest('search-1', 'user-1', {})).rejects.toThrow('no longer active')
      expect(tx.trialInvite.create).not.toHaveBeenCalled()
    })

    it('does not create or notify when the creator is no longer staff', async () => {
      const { service, tx, push } = requestService()
      tx.membership.findUnique.mockResolvedValue(null)
      await expect(service.createTrialRequest('search-1', 'user-1', {})).rejects.toThrow('Not a member')
      expect(tx.trialInvite.create).not.toHaveBeenCalled()
      expect(push.sendToUserLocalized).not.toHaveBeenCalled()
    })

    it('refuses a closed or expired Gesuch', async () => {
      const { service, prisma } = requestService()
      prisma.playerSearch.findFirst.mockResolvedValue(null)

      await expect(service.createTrialRequest('search-1', 'user-1', {})).rejects.toThrow(
        NotFoundException,
      )
    })
  })
})
