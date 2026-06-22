import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
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
    const tx = {
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
      user: {
        findUnique: jest.fn(),
      },
      freeAgentProfile: {
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      freeAgentExperience: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
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
      },
    }
  }

  describe('createFreeAgentProfile — registration role guard', () => {
    it.each([
      RegistrationRole.PLAYER,
      RegistrationRole.PARENT,
      RegistrationRole.COACH,
      RegistrationRole.CLUB_ADMIN,
    ])(
      'rejects creation for registrationRole %s with ForbiddenException',
      async (role) => {
        const { service, prisma, tx } = createService()
        prisma.user.findUnique.mockResolvedValue({ registrationRole: role })

        await expect(
          service.createFreeAgentProfile('user-1', buildWriteInput()),
        ).rejects.toThrow(ForbiddenException)

        // Guard must short-circuit before any tx work happens.
        expect(tx.freeAgentProfile.create).not.toHaveBeenCalled()
        expect(tx.freeAgentProfile.update).not.toHaveBeenCalled()
      },
    )

    it('throws NotFoundException if the user row does not exist', async () => {
      const { service, prisma, tx } = createService()
      prisma.user.findUnique.mockResolvedValue(null)

      await expect(
        service.createFreeAgentProfile('user-1', buildWriteInput()),
      ).rejects.toThrow(NotFoundException)

      expect(tx.freeAgentProfile.create).not.toHaveBeenCalled()
    })

    it('allows creation for a FREE_AGENT-registered user', async () => {
      const { service, prisma, tx } = createService()
      prisma.user.findUnique.mockResolvedValue({
        registrationRole: RegistrationRole.FREE_AGENT,
      })
      prisma.freeAgentProfile.findUnique.mockResolvedValue(null)
      tx.freeAgentProfile.create.mockResolvedValue({ id: 'profile-1' })
      tx.freeAgentProfile.findUnique.mockResolvedValue(buildSavedProfile())

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
    ])(
      'rejects update for registrationRole %s with ForbiddenException',
      async (role) => {
        const { service, prisma, tx } = createService()
        prisma.user.findUnique.mockResolvedValue({ registrationRole: role })

        await expect(
          service.updateFreeAgentProfile('user-1', buildWriteInput()),
        ).rejects.toThrow(ForbiddenException)

        expect(tx.freeAgentProfile.update).not.toHaveBeenCalled()
      },
    )

    it('allows update for a FREE_AGENT-registered user', async () => {
      const { service, prisma, tx } = createService()
      prisma.user.findUnique.mockResolvedValue({
        registrationRole: RegistrationRole.FREE_AGENT,
      })
      prisma.freeAgentProfile.findUnique.mockResolvedValue({ id: 'profile-1' })
      tx.freeAgentProfile.update.mockResolvedValue({ id: 'profile-1' })
      tx.freeAgentProfile.findUnique.mockResolvedValue(buildSavedProfile())

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

      await expect(
        service.updateFreeAgentProfile('user-1', buildWriteInput()),
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('deleteFreeAgentProfile', () => {
    it('throws NotFoundException when no profile exists', async () => {
      const { service, prisma } = createService()
      prisma.user.findUnique.mockResolvedValue({
        registrationRole: RegistrationRole.FREE_AGENT,
      })
      prisma.freeAgentProfile.findUnique.mockResolvedValue(null)

      await expect(
        service.deleteFreeAgentProfile('user-1'),
      ).rejects.toThrow(NotFoundException)
    })

    it('hard-deletes the profile (and experience rows) when present', async () => {
      const { service, prisma, tx } = createService()
      prisma.user.findUnique.mockResolvedValue({
        registrationRole: RegistrationRole.FREE_AGENT,
      })
      prisma.freeAgentProfile.findUnique.mockResolvedValue({ id: 'profile-1' })
      tx.freeAgentProfile.delete.mockResolvedValue({ id: 'profile-1' })

      await expect(
        service.deleteFreeAgentProfile('user-1'),
      ).resolves.toBeUndefined()

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
    ])(
      'rejects delete for registrationRole %s with ForbiddenException',
      async (role) => {
        const { service, prisma, tx } = createService()
        prisma.user.findUnique.mockResolvedValue({ registrationRole: role })

        await expect(
          service.deleteFreeAgentProfile('user-1'),
        ).rejects.toThrow(ForbiddenException)

        expect(tx.freeAgentProfile.delete).not.toHaveBeenCalled()
      },
    )
  })

  describe('getPublicFreeAgentProfile — visibility regression lock', () => {
    it('throws NotFoundException when the profile is PRIVATE', async () => {
      const { service, prisma } = createService()
      prisma.freeAgentProfile.findUnique.mockResolvedValue({
        ...buildSavedProfile(),
        visibility: FreeAgentVisibility.PRIVATE,
      })

      await expect(
        service.getPublicFreeAgentProfile('profile-1'),
      ).rejects.toThrow(NotFoundException)
    })

    it('throws NotFoundException when the profile does not exist', async () => {
      const { service, prisma } = createService()
      prisma.freeAgentProfile.findUnique.mockResolvedValue(null)

      await expect(
        service.getPublicFreeAgentProfile('profile-1'),
      ).rejects.toThrow(NotFoundException)
    })

    it('returns the profile when PUBLIC', async () => {
      const { service, prisma } = createService()
      prisma.freeAgentProfile.findUnique.mockResolvedValue(buildSavedProfile())

      await expect(
        service.getPublicFreeAgentProfile('profile-1'),
      ).resolves.toMatchObject({
        id: 'profile-1',
        visibility: FreeAgentVisibility.PUBLIC,
      })
    })
  })

  describe('respondToTrialInvite — accept/decline grants membership', () => {
    // Tx surface used by acceptTrialInvite (membership grant path).
    function createTrialService() {
      const trialTx = {
        membership: { upsert: jest.fn().mockResolvedValue({}) },
        teamAccess: { upsert: jest.fn().mockResolvedValue({}) },
        teamMember: { upsert: jest.fn().mockResolvedValue({}) },
        trialInvite: {
          update: jest
            .fn()
            .mockImplementation(async ({ data }: { data: any }) =>
              buildInvite({
                status: data.status,
                respondedAt: data.respondedAt ?? null,
              }),
            ),
        },
      }

      const prisma = {
        trialInvite: {
          findUnique: jest.fn(),
          update: jest
            .fn()
            .mockImplementation(async ({ data }: { data: any }) =>
              buildInvite({
                status: data.status,
                respondedAt: data.respondedAt ?? null,
              }),
            ),
        },
        $transaction: jest.fn(
          async (callback: (client: typeof trialTx) => Promise<unknown>) =>
            callback(trialTx),
        ),
      }

      const push = {
        sendToUserLocalized: jest.fn().mockResolvedValue(undefined),
      }

      const service = new MarketplaceService(prisma as never, push as never)

      return { prisma, push, service, trialTx }
    }

    function buildInvite(overrides: Record<string, unknown> = {}) {
      return {
        id: 'invite-1',
        clubId: 'club-1',
        teamId: 'team-1',
        freeAgentProfileId: 'profile-1',
        sentByUserId: 'coach-1',
        message: 'Come train with us',
        status: TrialInviteStatus.PENDING,
        expiresAt: new Date('2099-01-01T00:00:00Z'),
        respondedAt: null,
        createdAt: new Date('2026-04-01T00:00:00Z'),
        freeAgentProfile: {
          userId: 'user-1',
          user: { id: 'user-1', name: 'Test Player' },
        },
        club: {
          id: 'club-1',
          name: 'FC Test',
          badgeUrl: null,
          primaryColor: '#000000',
        },
        team: { id: 'team-1', displayName: 'First Team', group: null },
        sender: { id: 'coach-1', name: 'Coach Test' },
        ...overrides,
      }
    }

    it('accepting upserts a PLAYER Membership and a TRIAL/ACTIVE TeamAccess', async () => {
      const { service, prisma, trialTx } = createTrialService()
      prisma.trialInvite.findUnique.mockResolvedValue(buildInvite())

      const result = await service.respondToTrialInvite(
        'invite-1',
        'user-1',
        TrialInviteStatus.ACCEPTED,
      )

      expect(result.status).toBe(TrialInviteStatus.ACCEPTED)

      // Membership granted for the invited user, role PLAYER.
      expect(trialTx.membership.upsert).toHaveBeenCalledTimes(1)
      expect(trialTx.membership.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_clubId: { userId: 'user-1', clubId: 'club-1' } },
          create: expect.objectContaining({
            userId: 'user-1',
            clubId: 'club-1',
            role: 'PLAYER',
          }),
        }),
      )

      // TeamAccess upsert carries phase TRIAL + status ACTIVE on both branches.
      expect(trialTx.teamAccess.upsert).toHaveBeenCalledTimes(1)
      expect(trialTx.teamAccess.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            teamId_userId_role: {
              teamId: 'team-1',
              userId: 'user-1',
              role: 'PLAYER',
            },
          },
          update: expect.objectContaining({
            phase: 'TRIAL',
            status: 'ACTIVE',
          }),
          create: expect.objectContaining({
            clubId: 'club-1',
            teamId: 'team-1',
            userId: 'user-1',
            role: 'PLAYER',
            phase: 'TRIAL',
            status: 'ACTIVE',
          }),
        }),
      )

      // TeamMember row created and the invite flipped to ACCEPTED.
      expect(trialTx.teamMember.upsert).toHaveBeenCalledTimes(1)
      expect(trialTx.trialInvite.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'invite-1' },
          data: expect.objectContaining({
            status: TrialInviteStatus.ACCEPTED,
          }),
        }),
      )
    })

    it('declining marks the invite DECLINED and creates NO membership', async () => {
      const { service, prisma, trialTx } = createTrialService()
      prisma.trialInvite.findUnique.mockResolvedValue(buildInvite())

      const result = await service.respondToTrialInvite(
        'invite-1',
        'user-1',
        TrialInviteStatus.DECLINED,
      )

      expect(result.status).toBe(TrialInviteStatus.DECLINED)

      // Decline path never enters the membership-grant transaction.
      expect(prisma.$transaction).not.toHaveBeenCalled()
      expect(trialTx.membership.upsert).not.toHaveBeenCalled()
      expect(trialTx.teamAccess.upsert).not.toHaveBeenCalled()
      expect(trialTx.teamMember.upsert).not.toHaveBeenCalled()

      expect(prisma.trialInvite.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'invite-1' },
          data: expect.objectContaining({
            status: TrialInviteStatus.DECLINED,
          }),
        }),
      )
    })

    it('rejects an expired PENDING invite (marks EXPIRED, no membership)', async () => {
      const { service, prisma, trialTx } = createTrialService()
      prisma.trialInvite.findUnique.mockResolvedValue(
        buildInvite({
          status: TrialInviteStatus.PENDING,
          expiresAt: new Date('2000-01-01T00:00:00Z'),
        }),
      )

      await expect(
        service.respondToTrialInvite(
          'invite-1',
          'user-1',
          TrialInviteStatus.ACCEPTED,
        ),
      ).rejects.toThrow(BadRequestException)

      // Invite flipped to EXPIRED; no membership granted.
      expect(prisma.trialInvite.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'invite-1' },
          data: expect.objectContaining({
            status: TrialInviteStatus.EXPIRED,
          }),
        }),
      )
      expect(prisma.$transaction).not.toHaveBeenCalled()
      expect(trialTx.membership.upsert).not.toHaveBeenCalled()
    })

    it('rejects an already-decided invite (ACCEPTED) with BadRequestException', async () => {
      const { service, prisma, trialTx } = createTrialService()
      prisma.trialInvite.findUnique.mockResolvedValue(
        buildInvite({ status: TrialInviteStatus.ACCEPTED }),
      )

      await expect(
        service.respondToTrialInvite(
          'invite-1',
          'user-1',
          TrialInviteStatus.ACCEPTED,
        ),
      ).rejects.toThrow(BadRequestException)

      expect(trialTx.membership.upsert).not.toHaveBeenCalled()
    })

    it('only the invited user may respond — other users get NotFoundException', async () => {
      const { service, prisma, trialTx } = createTrialService()
      // Invite belongs to user-1; an attacker (user-2) attempts to accept it.
      prisma.trialInvite.findUnique.mockResolvedValue(buildInvite())

      await expect(
        service.respondToTrialInvite(
          'invite-1',
          'user-2',
          TrialInviteStatus.ACCEPTED,
        ),
      ).rejects.toThrow(NotFoundException)

      expect(prisma.$transaction).not.toHaveBeenCalled()
      expect(trialTx.membership.upsert).not.toHaveBeenCalled()
    })
  })
})
