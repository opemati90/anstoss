import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
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
      // Advisory lock for per-user setup serialization — no-op in tests.
      $executeRaw: jest.fn().mockResolvedValue(1),
      club: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      clubDirectoryEntry: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      membership: {
        // No existing OWNER membership by default — the idempotency guard
        // is a no-op unless a test opts in.
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      teamGroup: {
        create: jest.fn(),
      },
      team: {
        findFirst: jest.fn().mockResolvedValue(null),
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
    tx.clubDirectoryEntry.findMany.mockResolvedValue([])
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

  it('does not reuse an unclaimed directory slug during manual club setup', async () => {
    const { service, tx } = createService()

    tx.club.findMany.mockResolvedValue([])
    tx.clubDirectoryEntry.findMany.mockResolvedValue([{ slug: 'sv-directory' }])
    tx.club.create.mockResolvedValue({
      id: 'club-1',
      name: 'SV Directory',
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
        name: 'SV Directory',
        primaryColor: '#1E3A5F',
      },
      {
        name: 'Erste',
        ageGroup: 'Herren',
      },
    )

    expect(tx.club.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          slug: 'sv-directory-2',
        }),
      }),
    )
  })

  it('retries with a new slug when a concurrent slug collision occurs', async () => {
    const { service, tx } = createService()

    tx.club.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ slug: 'fc-test' }])
    tx.clubDirectoryEntry.findMany.mockResolvedValue([])
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
      tx.clubDirectoryEntry.findMany.mockResolvedValue([])
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
      tx.clubDirectoryEntry.findMany.mockResolvedValue([])
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
      tx.clubDirectoryEntry.findMany.mockResolvedValue([])
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

  describe('createClubWithTeam — directory linking', () => {
    function setupHappyPathMocks(tx: ReturnType<typeof createService>['tx']) {
      tx.club.findMany.mockResolvedValue([])
      tx.clubDirectoryEntry.findMany.mockResolvedValue([])
      tx.club.create.mockResolvedValue({
        id: 'club-1',
        name: 'SV Directory',
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

    it('links an unclaimed directory entry and carries its city onto the club', async () => {
      const { service, tx } = createService()
      setupHappyPathMocks(tx)
      tx.clubDirectoryEntry.findUnique.mockResolvedValue({
        id: 'dir-1',
        name: 'SV Directory',
        normalizedName: 'sv directory berlin',
        slug: 'sv-directory-berlin',
        city: 'Berlin',
        association: 'Berliner FV',
        activeClubId: null,
      })
      tx.clubDirectoryEntry.updateMany.mockResolvedValue({ count: 1 })

      await service.createClubWithTeam(
        'user-1',
        { name: 'SV Directory', primaryColor: '#FFFFFF' },
        { name: 'Erste', ageGroup: 'Herren' },
        'dir-1',
      )

      expect(tx.club.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            slug: 'sv-directory-berlin',
            name: 'SV Directory',
            city: 'Berlin',
            searchText: expect.stringContaining('berliner fv'),
          }),
        }),
      )
      expect(tx.clubDirectoryEntry.updateMany).toHaveBeenCalledWith({
        where: { id: 'dir-1', activeClubId: null },
        data: { activeClubId: 'club-1', lastSeenAt: expect.any(Date) },
      })
      expect(tx.clubDirectoryEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { not: 'dir-1' },
          }),
        }),
      )
    })

    it('uses the official directory name when a crafted setup payload changes the club name', async () => {
      const { service, tx } = createService()
      setupHappyPathMocks(tx)
      tx.clubDirectoryEntry.findUnique.mockResolvedValue({
        id: 'dir-1',
        name: 'Turn- und Sportverein Musterstadt 1899',
        normalizedName: 'turn und sportverein musterstadt 1899',
        slug: 'turn-und-sportverein-musterstadt-1899',
        city: 'Musterstadt',
        association: 'Berliner FV',
        activeClubId: null,
      })
      tx.clubDirectoryEntry.updateMany.mockResolvedValue({ count: 1 })

      await service.createClubWithTeam(
        'user-1',
        { name: 'FC Wrong', primaryColor: '#FFFFFF' },
        { name: 'Erste', ageGroup: 'Herren' },
        'dir-1',
      )

      expect(tx.club.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Turn- und Sportverein Musterstadt 1899',
            slug: 'turn-und-sportverein-musterstadt-1899',
            city: 'Musterstadt',
            searchText: expect.stringContaining(
              'turn und sportverein musterstadt 1899',
            ),
          }),
        }),
      )
    })

    it('rejects linking a directory entry that is already active', async () => {
      const { service, tx } = createService()
      tx.clubDirectoryEntry.findUnique.mockResolvedValue({
        id: 'dir-1',
        name: 'SV Directory',
        normalizedName: 'sv directory berlin',
        slug: 'sv-directory-berlin',
        city: 'Berlin',
        association: 'Berliner FV',
        activeClubId: 'club-existing',
      })

      await expect(
        service.createClubWithTeam(
          'user-1',
          { name: 'SV Directory', primaryColor: '#FFFFFF' },
          { name: 'Erste', ageGroup: 'Herren' },
          'dir-1',
        ),
      ).rejects.toThrow(ConflictException)

      expect(tx.club.create).not.toHaveBeenCalled()
    })

    it('rolls back when a concurrent setup claims the directory entry first', async () => {
      const { service, tx } = createService()
      setupHappyPathMocks(tx)
      tx.clubDirectoryEntry.findUnique.mockResolvedValue({
        id: 'dir-1',
        name: 'SV Directory',
        normalizedName: 'sv directory berlin',
        slug: 'sv-directory-berlin',
        city: 'Berlin',
        association: 'Berliner FV',
        activeClubId: null,
      })
      tx.clubDirectoryEntry.updateMany.mockResolvedValue({ count: 0 })

      await expect(
        service.createClubWithTeam(
          'user-1',
          { name: 'SV Directory', primaryColor: '#FFFFFF' },
          { name: 'Erste', ageGroup: 'Herren' },
          'dir-1',
        ),
      ).rejects.toThrow(ConflictException)
    })

    it('returns the existing club (idempotent) when the user already owns one', async () => {
      const { service, tx } = createService()
      ;(tx.membership.findFirst as jest.Mock).mockResolvedValue({
        clubId: 'club-existing',
      })
      ;(tx.club.findUnique as jest.Mock).mockResolvedValue({
        id: 'club-existing',
        name: 'FC Existing',
      })
      ;(tx.team.findFirst as jest.Mock).mockResolvedValue({
        id: 'team-existing',
        name: 'Erste',
      })

      const result = await service.createClubWithTeam(
        'user-1',
        { name: 'FC Second', primaryColor: '#FFFFFF' },
        { name: 'Erste', ageGroup: 'Herren' },
      )

      // No duplicate created; the existing club is returned as-is.
      expect(tx.club.create).not.toHaveBeenCalled()
      expect(result.club.id).toBe('club-existing')
      expect(result.team.id).toBe('team-existing')
    })
  })
})

describe('ClubsService.updateClub', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  function createService() {
    const prisma = {
      club: {
        update: jest.fn().mockImplementation(async ({ data }: { data: unknown }) => ({
          id: 'club-1',
          ...(data as object),
        })),
      },
    }
    const service = new ClubsService(prisma as never)
    return { prisma, service }
  }

  it('persists name and primaryColor', async () => {
    const { service, prisma } = createService()

    await service.updateClub('club-1', {
      name: 'FC Renamed',
      primaryColor: '#123ABC',
    })

    expect(prisma.club.update).toHaveBeenCalledWith({
      where: { id: 'club-1' },
      data: { name: 'FC Renamed', primaryColor: '#123ABC' },
    })
  })

  it('persists badgeUrl-only updates unchanged', async () => {
    const { service, prisma } = createService()

    await service.updateClub('club-1', { badgeUrl: null })

    expect(prisma.club.update).toHaveBeenCalledWith({
      where: { id: 'club-1' },
      data: { badgeUrl: null },
    })
  })
})

describe('ClubsService.leaveClub', () => {
  beforeEach(() => jest.clearAllMocks())

  function createService(membershipRole: string | null, ownerCount = 1) {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      channelMember: { deleteMany: jest.fn().mockResolvedValue({}) },
      conversationParticipant: { deleteMany: jest.fn().mockResolvedValue({}) },
      teamAccess: { deleteMany: jest.fn().mockResolvedValue({}) },
      teamMember: { deleteMany: jest.fn().mockResolvedValue({}) },
      rsvp: { deleteMany: jest.fn().mockResolvedValue({}) },
      eventReminderPreference: { deleteMany: jest.fn().mockResolvedValue({}) },
      eventCheckIn: { deleteMany: jest.fn().mockResolvedValue({}) },
      messageReaction: { deleteMany: jest.fn().mockResolvedValue({}) },
      messageReadReceipt: { deleteMany: jest.fn().mockResolvedValue({}) },
      messageReport: { deleteMany: jest.fn().mockResolvedValue({}) },
      pollVote: { deleteMany: jest.fn().mockResolvedValue({}) },
      notificationPreference: { deleteMany: jest.fn().mockResolvedValue({}) },
      guardianRelationship: { deleteMany: jest.fn().mockResolvedValue({}) },
      parentalConsent: {
        deleteMany: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({}),
      },
      injuryReport: { deleteMany: jest.fn().mockResolvedValue({}) },
      teamDutyAssignment: { deleteMany: jest.fn().mockResolvedValue({}) },
      contributionAssignment: { updateMany: jest.fn().mockResolvedValue({}) },
      contributionReminder: { deleteMany: jest.fn().mockResolvedValue({}) },
      joinRequest: { deleteMany: jest.fn().mockResolvedValue({}) },
      membership: {
        findUnique: jest
          .fn()
          .mockResolvedValue(membershipRole ? { role: membershipRole } : null),
        count: jest.fn().mockResolvedValue(ownerCount),
        deleteMany: jest.fn().mockResolvedValue({}),
      },
    }
    const prisma = {
      membership: {
        findUnique: jest
          .fn()
          .mockResolvedValue(membershipRole ? { role: membershipRole } : null),
        count: jest.fn().mockResolvedValue(ownerCount),
      },
      $transaction: jest.fn().mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx)),
    }
    const service = new ClubsService(prisma as never)
    return { prisma, tx, service }
  }

  it('throws when the caller is not a member', async () => {
    const { service } = createService(null)
    await expect(service.leaveClub('u-1', 'club-1')).rejects.toThrow('not a member')
  })

  it('blocks the last owner from leaving', async () => {
    const { service, tx } = createService('OWNER', 1)
    await expect(service.leaveClub('u-1', 'club-1')).rejects.toThrow(
      'Transfer ownership',
    )
    expect(tx.membership.deleteMany).not.toHaveBeenCalled()
  })

  it('lets an owner leave when another owner remains', async () => {
    const { service, tx } = createService('OWNER', 2)
    await service.leaveClub('u-1', 'club-1')
    expect(tx.membership.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u-1', clubId: 'club-1' },
    })
  })

  it('removes a player plus all club-scoped rows', async () => {
    const { service, tx } = createService('PLAYER')
    const res = await service.leaveClub('u-1', 'club-1')
    expect(res).toEqual({ left: true })
    expect(tx.$executeRaw).toHaveBeenCalled()
    expect(tx.channelMember.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u-1', channel: { is: { clubId: 'club-1' } } },
    })
    expect(tx.conversationParticipant.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u-1', conversation: { is: { clubId: 'club-1' } } },
    })
    expect(tx.teamAccess.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u-1', clubId: 'club-1' },
    })
    expect(tx.teamMember.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u-1', team: { is: { clubId: 'club-1' } } },
    })
    expect(tx.rsvp.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u-1', event: { is: { clubId: 'club-1' } } },
    })
    expect(tx.eventCheckIn.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u-1', clubId: 'club-1' },
    })
    expect(tx.notificationPreference.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u-1', clubId: 'club-1' },
    })
    expect(tx.guardianRelationship.deleteMany).toHaveBeenCalledWith({
      where: {
        clubId: 'club-1',
        OR: [{ parentUserId: 'u-1' }, { playerUserId: 'u-1' }],
      },
    })
    expect(tx.contributionAssignment.updateMany).toHaveBeenCalledWith({
      where: { clubId: 'club-1', memberUserId: 'u-1', endDate: null },
      data: { endDate: expect.any(Date) },
    })
    expect(tx.joinRequest.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u-1', clubId: 'club-1' },
    })
    expect(tx.membership.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u-1', clubId: 'club-1' },
    })
  })
})

describe('ClubsService.removeMemberFromClub', () => {
  beforeEach(() => jest.clearAllMocks())

  function createService(actorRole: string | null, targetRole: string | null) {
    const tx = {
      channelMember: { deleteMany: jest.fn().mockResolvedValue({}) },
      conversationParticipant: { deleteMany: jest.fn().mockResolvedValue({}) },
      teamAccess: { deleteMany: jest.fn().mockResolvedValue({}) },
      teamMember: { deleteMany: jest.fn().mockResolvedValue({}) },
      rsvp: { deleteMany: jest.fn().mockResolvedValue({}) },
      eventReminderPreference: { deleteMany: jest.fn().mockResolvedValue({}) },
      eventCheckIn: { deleteMany: jest.fn().mockResolvedValue({}) },
      messageReaction: { deleteMany: jest.fn().mockResolvedValue({}) },
      messageReadReceipt: { deleteMany: jest.fn().mockResolvedValue({}) },
      messageReport: { deleteMany: jest.fn().mockResolvedValue({}) },
      pollVote: { deleteMany: jest.fn().mockResolvedValue({}) },
      notificationPreference: { deleteMany: jest.fn().mockResolvedValue({}) },
      guardianRelationship: { deleteMany: jest.fn().mockResolvedValue({}) },
      parentalConsent: {
        deleteMany: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({}),
      },
      injuryReport: { deleteMany: jest.fn().mockResolvedValue({}) },
      teamDutyAssignment: { deleteMany: jest.fn().mockResolvedValue({}) },
      contributionAssignment: { updateMany: jest.fn().mockResolvedValue({}) },
      contributionReminder: { deleteMany: jest.fn().mockResolvedValue({}) },
      joinRequest: { deleteMany: jest.fn().mockResolvedValue({}) },
      membership: { deleteMany: jest.fn().mockResolvedValue({}) },
    }
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(actorRole ? { role: actorRole } : null)
      .mockResolvedValueOnce(targetRole ? { role: targetRole } : null)
    const prisma = {
      membership: { findUnique },
      $transaction: jest.fn().mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx)),
    }
    return { prisma, tx, service: new ClubsService(prisma as never) }
  }

  it('rejects a non-admin actor', async () => {
    const { service, tx } = createService('COACH', 'PLAYER')
    await expect(
      service.removeMemberFromClub('coach', 'club-1', 'p-1'),
    ).rejects.toThrow('owners or admins')
    expect(tx.membership.deleteMany).not.toHaveBeenCalled()
  })

  it('refuses to remove yourself (use leave instead)', async () => {
    const { service } = createService('ADMIN', null)
    await expect(
      service.removeMemberFromClub('same', 'club-1', 'same'),
    ).rejects.toThrow('Use leave')
  })

  it('refuses to remove an owner', async () => {
    const { service, tx } = createService('ADMIN', 'OWNER')
    await expect(
      service.removeMemberFromClub('admin', 'club-1', 'owner'),
    ).rejects.toThrow('owner cannot be removed')
    expect(tx.membership.deleteMany).not.toHaveBeenCalled()
  })

  it('removes a player and their club-scoped rows', async () => {
    const { service, tx } = createService('OWNER', 'PLAYER')
    const res = await service.removeMemberFromClub('owner', 'club-1', 'p-1')
    expect(res).toEqual({ removed: true })
    expect(tx.membership.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'p-1', clubId: 'club-1' },
    })
    expect(tx.channelMember.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'p-1', channel: { is: { clubId: 'club-1' } } },
    })
    expect(tx.conversationParticipant.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'p-1', conversation: { is: { clubId: 'club-1' } } },
    })
    expect(tx.rsvp.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'p-1', event: { is: { clubId: 'club-1' } } },
    })
  })
})
