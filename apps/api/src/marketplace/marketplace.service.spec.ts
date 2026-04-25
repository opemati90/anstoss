import { ForbiddenException, NotFoundException } from '@nestjs/common'
import {
  FreeAgentVisibility,
  PlayerPosition,
  PreferredFoot,
  RegistrationRole,
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
})
