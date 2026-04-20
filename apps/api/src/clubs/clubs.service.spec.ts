import { ForbiddenException, NotFoundException } from '@nestjs/common'
import {
  DEFAULT_TEAM_GROUPS,
  MembershipRole,
  RegistrationRole,
  TeamAccessPhase,
  TeamAccessStatus,
  TeamRole,
} from '@anstoss/shared'
import { ClubsService } from './clubs.service'
import { tenantContext } from '../prisma/tenant.context'

jest.mock('../prisma/tenant.context', () => ({
  tenantContext: {
    run: jest.fn((store, callback) => callback()),
  },
}))

const mockedTenantContextRun = tenantContext.run as jest.Mock

describe('ClubsService.createClubWithTeam', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  function createService() {
    const tx = {
      club: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      membership: {
        create: jest.fn(),
      },
      teamGroup: {
        create: jest.fn(),
      },
      team: {
        create: jest.fn(),
      },
      teamAccess: {
        create: jest.fn(),
      },
      teamMember: {
        create: jest.fn(),
      },
    }

    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ registrationRole: RegistrationRole.CLUB_ADMIN }),
      },
    }

    const service = new ClubsService(prisma as never)

    return { prisma, service, tx }
  }

  it('allocates the next available slug when a club name already exists', async () => {
    const { service, tx } = createService()

    tx.club.findMany.mockResolvedValue([
      { slug: 'fc-lichtenberg' },
      { slug: 'fc-lichtenberg-2' },
    ])
    tx.club.create.mockResolvedValue({
      id: 'club-1',
      name: 'FC Lichtenberg',
      primaryColor: '#1E3A5F',
      badgeUrl: null,
    })
    tx.membership.create.mockResolvedValue({})
    tx.teamGroup.create.mockImplementation(async ({ data }: { data: { displayName: string; sortOrder: number } }) => ({
      id: `group-${data.sortOrder + 1}`,
      displayName: data.displayName,
    }))
    tx.team.create.mockResolvedValue({
      id: 'team-1',
      name: 'Herren III',
      ageGroup: 'Herren',
    })
    tx.teamAccess.create.mockResolvedValue({
      role: TeamRole.HEAD_COACH,
      phase: TeamAccessPhase.FULL,
      status: TeamAccessStatus.ACTIVE,
    })
    tx.teamMember.create.mockResolvedValue({})

    await service.createClubWithTeam(
      'user-1',
      {
        name: 'FC Lichtenberg',
        primaryColor: '#1E3A5F',
      },
      {
        name: 'Herren III',
        ageGroup: 'Herren',
      },
    )

    expect(tx.club.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          slug: 'fc-lichtenberg-3',
        }),
      }),
    )
    expect(mockedTenantContextRun).toHaveBeenCalledWith(
      { clubId: 'club-1', userId: 'user-1' },
      expect.any(Function),
    )
  })

  it('retries with a new slug when a concurrent slug collision occurs', async () => {
    const { service, tx } = createService()

    tx.club.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ slug: 'fc-test' }])
    tx.club.create
      .mockRejectedValueOnce({
        code: 'P2002',
        meta: { target: ['slug'] },
      })
      .mockResolvedValueOnce({
        id: 'club-1',
        name: 'FC Test',
        primaryColor: '#1E3A5F',
        badgeUrl: null,
      })
    tx.membership.create.mockResolvedValue({})
    tx.teamGroup.create.mockImplementation(async ({ data }: { data: { displayName: string; sortOrder: number } }) => ({
      id: `group-${data.sortOrder + 1}`,
      displayName: data.displayName,
    }))
    tx.team.create.mockResolvedValue({
      id: 'team-1',
      name: 'Erste',
      ageGroup: 'Herren',
    })
    tx.teamAccess.create.mockResolvedValue({
      role: TeamRole.HEAD_COACH,
      phase: TeamAccessPhase.FULL,
      status: TeamAccessStatus.ACTIVE,
    })
    tx.teamMember.create.mockResolvedValue({})

    await service.createClubWithTeam(
      'user-1',
      {
        name: 'FC Test',
        primaryColor: '#1E3A5F',
      },
      {
        name: 'Erste',
        ageGroup: 'Herren',
      },
    )

    expect(tx.club.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          slug: 'fc-test',
        }),
      }),
    )
    expect(tx.club.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          slug: 'fc-test-2',
        }),
      }),
    )
    expect(mockedTenantContextRun).toHaveBeenCalledWith(
      { clubId: 'club-1', userId: 'user-1' },
      expect.any(Function),
    )
  })

  describe('regression lock', () => {
    function setupHappyPathMocks(tx: ReturnType<typeof createService>['tx']) {
      tx.club.findMany.mockResolvedValue([])
      tx.club.create.mockResolvedValue({
        id: 'club-1',
        name: 'FC Regression',
        primaryColor: '#FFFFFF',
        badgeUrl: null,
      })
      tx.membership.create.mockResolvedValue({})
      tx.teamGroup.create.mockImplementation(
        async ({ data }: { data: { displayName: string; sortOrder: number } }) => ({
          id: `group-${data.sortOrder}`,
          displayName: data.displayName,
        }),
      )
      tx.team.create.mockResolvedValue({
        id: 'team-1',
        name: 'Erste',
        ageGroup: 'Herren',
      })
      tx.teamAccess.create.mockResolvedValue({
        role: TeamRole.HEAD_COACH,
        phase: TeamAccessPhase.FULL,
        status: TeamAccessStatus.ACTIVE,
      })
      tx.teamMember.create.mockResolvedValue({})
    }

    it('creates an OWNER membership for the creator', async () => {
      const { service, tx } = createService()
      setupHappyPathMocks(tx)

      await service.createClubWithTeam(
        'user-1',
        { name: 'FC Regression', primaryColor: '#FFFFFF' },
        { name: 'Erste', ageGroup: 'Herren' },
      )

      expect(tx.membership.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            clubId: 'club-1',
            role: MembershipRole.OWNER,
          }),
        }),
      )
    })

    it('creates a HEAD_COACH TeamAccess for the creator', async () => {
      const { service, tx } = createService()
      setupHappyPathMocks(tx)

      await service.createClubWithTeam(
        'user-1',
        { name: 'FC Regression', primaryColor: '#FFFFFF' },
        { name: 'Erste', ageGroup: 'Herren' },
      )

      expect(tx.teamAccess.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            role: TeamRole.HEAD_COACH,
            phase: TeamAccessPhase.FULL,
            status: TeamAccessStatus.ACTIVE,
          }),
        }),
      )
    })

    it('seeds DEFAULT_TEAM_GROUPS with ascending sortOrder starting at 0', async () => {
      const { service, tx } = createService()
      setupHappyPathMocks(tx)

      // ageGroup matches a DEFAULT_TEAM_GROUPS entry → no extra group created
      await service.createClubWithTeam(
        'user-1',
        { name: 'FC Regression', primaryColor: '#FFFFFF' },
        { name: 'Erste', ageGroup: 'Herren' },
      )

      expect(tx.teamGroup.create).toHaveBeenCalledTimes(DEFAULT_TEAM_GROUPS.length)

      DEFAULT_TEAM_GROUPS.forEach((group, index) => {
        expect(tx.teamGroup.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              displayName: group.displayName,
              sortOrder: index,
            }),
          }),
        )
      })
    })

    it('seeds DEFAULT_TEAM_GROUPS and adds one extra group when ageGroup is not in the defaults', async () => {
      const { service, tx } = createService()
      setupHappyPathMocks(tx)

      // ageGroup does NOT match any DEFAULT_TEAM_GROUPS entry → one extra group at the end
      await service.createClubWithTeam(
        'user-1',
        { name: 'FC Regression', primaryColor: '#FFFFFF' },
        { name: 'Alte Herren', ageGroup: 'Alte Herren' },
      )

      expect(tx.teamGroup.create).toHaveBeenCalledTimes(DEFAULT_TEAM_GROUPS.length + 1)

      expect(tx.teamGroup.create).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            displayName: 'Alte Herren',
            sortOrder: DEFAULT_TEAM_GROUPS.length,
          }),
        }),
      )
    })
  })

  describe('createClubWithTeam — registration role guard', () => {
    function setupHappyPathMocks(tx: ReturnType<typeof createService>['tx']) {
      tx.club.findMany.mockResolvedValue([])
      tx.club.create.mockResolvedValue({
        id: 'club-1',
        name: 'FC Guarded',
        primaryColor: '#FFFFFF',
        badgeUrl: null,
      })
      tx.membership.create.mockResolvedValue({})
      tx.teamGroup.create.mockImplementation(
        async ({ data }: { data: { displayName: string; sortOrder: number } }) => ({
          id: `group-${data.sortOrder}`,
          displayName: data.displayName,
        }),
      )
      tx.team.create.mockResolvedValue({
        id: 'team-1',
        name: 'Erste',
        ageGroup: 'Herren',
      })
      tx.teamAccess.create.mockResolvedValue({
        role: TeamRole.HEAD_COACH,
        phase: TeamAccessPhase.FULL,
        status: TeamAccessStatus.ACTIVE,
      })
      tx.teamMember.create.mockResolvedValue({})
    }

    it('rejects creation if caller is registered as PLAYER', async () => {
      const { service, prisma } = createService()
      prisma.user.findUnique.mockResolvedValue({
        registrationRole: RegistrationRole.PLAYER,
      })

      await expect(
        service.createClubWithTeam(
          'user-1',
          { name: 'FC Guarded', primaryColor: '#FFFFFF' },
          { name: 'Erste', ageGroup: 'Herren' },
        ),
      ).rejects.toThrow(ForbiddenException)

      await expect(
        service.createClubWithTeam(
          'user-1',
          { name: 'FC Guarded', primaryColor: '#FFFFFF' },
          { name: 'Erste', ageGroup: 'Herren' },
        ),
      ).rejects.toThrow(/CLUB_ADMIN/)
    })

    it.each([
      RegistrationRole.PLAYER,
      RegistrationRole.PARENT,
      RegistrationRole.COACH,
      RegistrationRole.FREE_AGENT,
    ])('rejects creation for registrationRole %s', async (role) => {
      const { service, prisma, tx } = createService()
      prisma.user.findUnique.mockResolvedValue({ registrationRole: role })

      await expect(
        service.createClubWithTeam(
          'user-1',
          { name: 'FC Guarded', primaryColor: '#FFFFFF' },
          { name: 'Erste', ageGroup: 'Herren' },
        ),
      ).rejects.toThrow(ForbiddenException)

      // Guard must short-circuit before any tx work happens.
      expect(tx.club.create).not.toHaveBeenCalled()
      expect(tx.membership.create).not.toHaveBeenCalled()
    })

    it('allows creation for a CLUB_ADMIN-registered user', async () => {
      const { service, prisma, tx } = createService()
      prisma.user.findUnique.mockResolvedValue({
        registrationRole: RegistrationRole.CLUB_ADMIN,
      })
      setupHappyPathMocks(tx)

      await expect(
        service.createClubWithTeam(
          'user-1',
          { name: 'FC Guarded', primaryColor: '#FFFFFF' },
          { name: 'Erste', ageGroup: 'Herren' },
        ),
      ).resolves.toBeDefined()
    })

    it('throws NotFoundException if the user row does not exist', async () => {
      const { service, prisma, tx } = createService()
      prisma.user.findUnique.mockResolvedValue(null)

      await expect(
        service.createClubWithTeam(
          'user-1',
          { name: 'FC Guarded', primaryColor: '#FFFFFF' },
          { name: 'Erste', ageGroup: 'Herren' },
        ),
      ).rejects.toThrow(NotFoundException)

      // Guard must short-circuit before any tx work happens.
      expect(tx.club.create).not.toHaveBeenCalled()
    })
  })

  describe('createClubWithTeam — welcomeText passthrough', () => {
    it('passes welcomeText to tx.club.create when provided', async () => {
      const { service, tx } = createService()

      tx.club.findMany.mockResolvedValue([])
      tx.club.create.mockResolvedValue({
        id: 'club-1',
        name: 'FC Welcome',
        primaryColor: '#FFFFFF',
        badgeUrl: null,
        welcomeText: 'Willkommen!',
      })
      tx.membership.create.mockResolvedValue({})
      tx.teamGroup.create.mockImplementation(
        async ({ data }: { data: { displayName: string; sortOrder: number } }) => ({
          id: `group-${data.sortOrder}`,
          displayName: data.displayName,
        }),
      )
      tx.team.create.mockResolvedValue({
        id: 'team-1',
        name: 'Erste',
        ageGroup: 'Herren',
      })
      tx.teamAccess.create.mockResolvedValue({
        role: TeamRole.HEAD_COACH,
        phase: TeamAccessPhase.FULL,
        status: TeamAccessStatus.ACTIVE,
      })
      tx.teamMember.create.mockResolvedValue({})

      await service.createClubWithTeam(
        'user-1',
        {
          name: 'FC Welcome',
          primaryColor: '#FFFFFF',
          welcomeText: 'Willkommen!',
        },
        { name: 'Erste', ageGroup: 'Herren' },
      )

      expect(tx.club.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            welcomeText: 'Willkommen!',
          }),
        }),
      )
    })
  })
})
