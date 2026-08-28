import { MembershipRole, TeamRole } from '@prisma/client'
import { ClubActivationService } from './club-activation.service'
import { ConflictException, ForbiddenException } from '@nestjs/common'
import { submitFirstClubClaimSchema } from '@anstoss/shared'

describe('ClubActivationService role independence', () => {
  it('keeps club admin authority while adding coach and player roles on the same team', async () => {
    const claim = {
      id: 'claim-1',
      kind: 'STAFF_CLAIM',
      clubId: 'club-1',
      claimantUserId: 'admin-player-1',
      desiredRole: MembershipRole.COACH,
      requestedTeamIds: ['team-1'],
      requestedTeamRoles: [TeamRole.HEAD_COACH, TeamRole.PLAYER],
      status: 'SUBMITTED',
      expiresAt: new Date(Date.now() + 60_000),
    }
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'reviewer-membership' }]),
      clubClaim: {
        findUnique: jest.fn().mockResolvedValue(claim),
        update: jest.fn().mockResolvedValue({ ...claim, status: 'APPROVED' }),
      },
      team: { findMany: jest.fn().mockResolvedValue([{ id: 'team-1' }]) },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'admin-player-1' }) },
      membership: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ role: MembershipRole.OWNER })
          .mockResolvedValueOnce({ role: MembershipRole.ADMIN }),
        upsert: jest.fn().mockResolvedValue({}),
      },
      teamAccess: { upsert: jest.fn().mockResolvedValue({}) },
      teamMember: { upsert: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    }
    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    }
    const service = new ClubActivationService(
      prisma as never,
      { log: jest.fn() } as never,
      {} as never,
      { assertCanActivatePlayer: jest.fn() } as never,
    )

    await service.reviewStaffRequest('owner-1', 'club-1', 'claim-1', {
      decision: 'APPROVE',
    })

    expect(tx.membership.upsert).toHaveBeenCalledWith({
      where: { userId_clubId: { userId: 'admin-player-1', clubId: 'club-1' } },
      create: {
        userId: 'admin-player-1',
        clubId: 'club-1',
        role: MembershipRole.COACH,
      },
      update: { role: MembershipRole.ADMIN },
    })
    expect(tx.teamAccess.upsert).toHaveBeenCalledTimes(2)
    expect(tx.teamAccess.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          teamId_userId_role: {
            teamId: 'team-1',
            userId: 'admin-player-1',
            role: TeamRole.HEAD_COACH,
          },
        },
      }),
    )
    expect(tx.teamAccess.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          teamId_userId_role: {
            teamId: 'team-1',
            userId: 'admin-player-1',
            role: TeamRole.PLAYER,
          },
        },
      }),
    )
    expect(tx.teamMember.upsert).toHaveBeenCalledTimes(1)
  })
})

describe('club authority governance boundaries', () => {
  it('rejects a malformed staff claim that attempts to grant ownership', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'reviewer-membership' }]),
      membership: {
        findUnique: jest.fn().mockResolvedValue({ role: MembershipRole.OWNER }),
        upsert: jest.fn(),
      },
      clubClaim: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'claim-owner',
          kind: 'STAFF_CLAIM',
          clubId: 'club-1',
          claimantUserId: 'candidate-1',
          desiredRole: MembershipRole.OWNER,
          requestedTeamIds: [],
          requestedTeamRoles: [],
          status: 'SUBMITTED',
          expiresAt: new Date(Date.now() + 60_000),
        }),
      },
    }
    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    }
    const service = new ClubActivationService(
      prisma as never,
      { log: jest.fn() } as never,
      {} as never,
      {} as never,
    )

    await expect(
      service.reviewStaffRequest('owner-1', 'club-1', 'claim-owner', {
        decision: 'APPROVE',
      }),
    ).rejects.toThrow('ownership transfer')
    expect(tx.membership.upsert).not.toHaveBeenCalled()
  })

  it.each([MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.COACH])(
    'rejects a coach staff claim when %s authority appears after the initial check',
    async (role) => {
      const tx = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        membership: { findUnique: jest.fn().mockResolvedValue({ role }) },
        clubClaim: {
          findMany: jest.fn().mockResolvedValue([]),
          updateMany: jest.fn(),
          findFirst: jest.fn(),
          create: jest.fn(),
        },
      }
      const prisma = {
        clubDirectoryEntry: { findFirst: jest.fn().mockResolvedValue({ id: 'directory-1' }) },
        membership: { findUnique: jest.fn().mockResolvedValue(null) },
        team: { count: jest.fn().mockResolvedValue(1) },
        clubClaim: { findFirst: jest.fn().mockResolvedValue(null) },
        $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
      }
      const service = new ClubActivationService(
        prisma as never,
        { log: jest.fn() } as never,
        {} as never,
        {} as never,
      )

      await expect(
        service.submitStaffRequest(`${role.toLowerCase()}-1`, 'club-1', {
          desiredRole: 'COACH',
          requestedTeamIds: ['team-1'],
          teamRoles: ['ASSISTANT_COACH'],
        }),
      ).rejects.toBeInstanceOf(ConflictException)
      expect(tx.$executeRaw).toHaveBeenCalledTimes(1)
      expect(tx.clubClaim.create).not.toHaveBeenCalled()
    },
  )

  it('does not demote an existing owner when approving a legacy coach staff claim', async () => {
    const claim = {
      id: 'claim-coach',
      kind: 'STAFF_CLAIM',
      clubId: 'club-1',
      claimantUserId: 'owner-2',
      desiredRole: MembershipRole.COACH,
      requestedTeamIds: ['team-1'],
      requestedTeamRoles: [TeamRole.ASSISTANT_COACH],
      status: 'SUBMITTED',
      expiresAt: new Date(Date.now() + 60_000),
    }
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'reviewer-membership' }]),
      membership: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ role: MembershipRole.ADMIN })
          .mockResolvedValueOnce({ role: MembershipRole.OWNER }),
        upsert: jest.fn(),
      },
      clubClaim: { findUnique: jest.fn().mockResolvedValue(claim) },
      team: { findMany: jest.fn().mockResolvedValue([{ id: 'team-1' }]) },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'owner-2' }) },
      teamAccess: { upsert: jest.fn() },
      teamMember: { upsert: jest.fn() },
    }
    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    }
    const service = new ClubActivationService(
      prisma as never,
      { log: jest.fn() } as never,
      {} as never,
      {} as never,
    )

    await expect(
      service.reviewStaffRequest('admin-1', 'club-1', claim.id, {
        decision: 'APPROVE',
      }),
    ).rejects.toThrow('ownership transfer')
    expect(tx.$executeRaw).toHaveBeenCalledTimes(3)
    expect(tx.membership.upsert).not.toHaveBeenCalled()
    expect(tx.teamAccess.upsert).not.toHaveBeenCalled()
  })

  it('rechecks current reviewer authority inside the locked staff decision transaction', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'reviewer-membership' }]),
      membership: {
        findUnique: jest.fn().mockResolvedValue({ role: MembershipRole.ADMIN }),
      },
      clubClaim: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'claim-admin',
          kind: 'STAFF_CLAIM',
          clubId: 'club-1',
          claimantUserId: 'candidate-1',
          desiredRole: MembershipRole.ADMIN,
          requestedTeamIds: [],
          requestedTeamRoles: [],
          status: 'SUBMITTED',
          expiresAt: new Date(Date.now() + 60_000),
        }),
      },
    }
    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    }
    const service = new ClubActivationService(
      prisma as never,
      { log: jest.fn() } as never,
      {} as never,
      {} as never,
    )

    await expect(
      service.reviewStaffRequest('former-owner', 'club-1', 'claim-admin', {
        decision: 'APPROVE',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('refuses to approve staff access for a deleted claimant', async () => {
    const claim = {
      id: 'claim-deleted',
      kind: 'STAFF_CLAIM',
      clubId: 'club-1',
      claimantUserId: 'deleted-user',
      desiredRole: MembershipRole.COACH,
      requestedTeamIds: [],
      requestedTeamRoles: [],
      status: 'SUBMITTED',
      expiresAt: new Date(Date.now() + 60_000),
    }
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'reviewer-membership' }]),
      clubClaim: { findUnique: jest.fn().mockResolvedValue(claim) },
      membership: {
        findUnique: jest.fn().mockResolvedValue({ role: MembershipRole.OWNER }),
        upsert: jest.fn(),
      },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
    }
    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    }
    const service = new ClubActivationService(
      prisma as never,
      { log: jest.fn() } as never,
      {} as never,
      {} as never,
    )

    await expect(
      service.reviewStaffRequest('owner-1', 'club-1', claim.id, { decision: 'APPROVE' }),
    ).rejects.toThrow('claimant account is no longer active')
    expect(tx.membership.upsert).not.toHaveBeenCalled()
  })

  it('refuses to activate a club for a deleted first claimant', async () => {
    const claim = {
      id: 'first-deleted',
      kind: 'FIRST_CLAIM',
      clubId: null,
      claimantUserId: 'deleted-user',
      status: 'SUBMITTED',
      expiresAt: new Date(Date.now() + 60_000),
      directoryEntry: { id: 'directory-1', activeClubId: null },
    }
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      clubClaim: { findUnique: jest.fn().mockResolvedValue(claim) },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      club: { create: jest.fn() },
    }
    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    }
    const service = new ClubActivationService(
      prisma as never,
      { log: jest.fn() } as never,
      {} as never,
      {} as never,
    )

    await expect(
      service.reviewFirstClaim('platform-1', claim.id, { decision: 'APPROVE' }),
    ).rejects.toThrow('claimant account is no longer active')
    expect(tx.club.create).not.toHaveBeenCalled()
  })

  it('does not let the platform bypass the club review window for a fresh staff claim', async () => {
    const prisma = {
      clubClaim: {
        findUnique: jest.fn().mockResolvedValue({
          kind: 'STAFF_CLAIM',
          clubId: 'club-1',
          createdAt: new Date(),
        }),
      },
    }
    const service = new ClubActivationService(
      prisma as never,
      { log: jest.fn() } as never,
      {} as never,
      {} as never,
    )

    await expect(
      service.reviewPlatformClaim('platform-1', 'claim-fresh', { decision: 'APPROVE' }),
    ).rejects.toThrow('has not escalated')
  })

  it('lets the platform approve a staff claim after seven unanswered days', async () => {
    const createdAt = new Date(Date.now() - 8 * 86400000)
    const claim = {
      id: 'claim-escalated',
      kind: 'STAFF_CLAIM',
      clubId: 'club-1',
      claimantUserId: 'coach-1',
      desiredRole: MembershipRole.COACH,
      requestedTeamIds: ['team-1'],
      requestedTeamRoles: [TeamRole.ASSISTANT_COACH],
      status: 'SUBMITTED',
      createdAt,
      expiresAt: new Date(Date.now() + 86400000),
    }
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      clubClaim: {
        findUnique: jest.fn().mockResolvedValue(claim),
        update: jest.fn().mockResolvedValue({ ...claim, status: 'APPROVED' }),
      },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'coach-1' }) },
      team: { findMany: jest.fn().mockResolvedValue([{ id: 'team-1' }]) },
      membership: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
      teamAccess: { upsert: jest.fn().mockResolvedValue({}) },
      teamMember: { upsert: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    }
    const prisma = {
      clubClaim: {
        findUnique: jest.fn().mockResolvedValue({
          kind: 'STAFF_CLAIM',
          clubId: 'club-1',
          createdAt,
        }),
      },
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    }
    const service = new ClubActivationService(
      prisma as never,
      { log: jest.fn() } as never,
      {} as never,
      { assertCanActivatePlayer: jest.fn() } as never,
    )

    await service.reviewPlatformClaim('platform-1', claim.id, { decision: 'APPROVE' })

    expect(tx.membership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ role: MembershipRole.COACH }) }),
    )
    expect(tx.clubClaim.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED' }) }),
    )
  })

  it('requires fresh factor authentication, not a freshly refreshed session', async () => {
    const prisma = { membership: { findUnique: jest.fn() } }
    const service = new ClubActivationService(
      prisma as never,
      { log: jest.fn() } as never,
      {} as never,
      {} as never,
    )

    await expect(
      service.startOwnershipTransfer(
        { id: 'owner-1', authenticatedAt: Math.floor(Date.now() / 1000) - 601 },
        'club-1',
        { toUserId: 'member-1' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(prisma.membership.findUnique).not.toHaveBeenCalled()
  })

  it('serializes rejection with approval using the same per-claim lock', async () => {
    const claim = {
      id: 'claim-1',
      kind: 'FIRST_CLAIM',
      clubId: null,
      status: 'SUBMITTED',
      expiresAt: new Date(Date.now() + 60_000),
    }
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      clubClaim: {
        findFirst: jest.fn().mockResolvedValue(claim),
        update: jest.fn().mockResolvedValue({ ...claim, status: 'REJECTED' }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    }
    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    }
    const service = new ClubActivationService(
      prisma as never,
      { log: jest.fn() } as never,
      {} as never,
      {} as never,
    )

    await service.reviewFirstClaim('platform-1', 'claim-1', { decision: 'REJECT' })

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1)
    expect(tx.clubClaim.findFirst).toHaveBeenCalledTimes(1)
    expect(tx.clubClaim.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'claim-1' } }),
    )
  })

  it('requires a recognized official team URL on first-owner claims', () => {
    const base = {
      directoryEntryId: 'directory-1',
      teamName: 'First Team',
      teamRoles: [],
    }
    expect(() => submitFirstClubClaimSchema.parse(base)).toThrow()
    expect(() =>
      submitFirstClubClaimSchema.parse({ ...base, externalTeamUrl: 'https://evil.example/team' }),
    ).toThrow('direct HTTPS team link from Fussball.de, DFB.de, or FuPa')
    expect(
      submitFirstClubClaimSchema.parse({
        ...base,
        externalTeamUrl: 'https://www.fussball.de/mannschaft/example',
      }).externalTeamUrl,
    ).toContain('fussball.de')
  })

  it('blocks acceptance of a pending transfer while a dispute is frozen', async () => {
    const tx = {
      ownershipTransfer: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'transfer-1',
          clubId: 'club-1',
          fromUserId: 'owner-1',
          toUserId: 'member-1',
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 60_000),
        }),
      },
      clubDispute: { findFirst: jest.fn().mockResolvedValue({ id: 'dispute-1' }) },
      membership: { findFirst: jest.fn(), update: jest.fn() },
      $executeRaw: jest.fn().mockResolvedValue(1),
    }
    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    }
    const service = new ClubActivationService(
      prisma as never,
      { log: jest.fn() } as never,
      {} as never,
      {} as never,
    )

    await expect(
      service.acceptOwnershipTransfer(
        { id: 'member-1', authenticatedAt: Math.floor(Date.now() / 1000) },
        'transfer-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(tx.membership.update).not.toHaveBeenCalled()
  })

  it('atomically resolves a dispute by transferring ownership to an existing member', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      clubDispute: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'dispute-1',
          clubId: 'club-1',
          status: 'FROZEN',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'dispute-1', status: 'RESOLVED' }),
      },
      membership: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'membership-new-owner',
          userId: 'new-owner',
          role: MembershipRole.ADMIN,
        }),
        findMany: jest.fn().mockResolvedValue([{ userId: 'old-owner' }]),
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 1 }),
      },
      ownershipTransfer: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    }
    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    }
    const service = new ClubActivationService(
      prisma as never,
      { log: jest.fn() } as never,
      {} as never,
      {} as never,
    )

    await expect(
      service.resolvePlatformDispute('platform-1', 'dispute-1', {
        resolution: 'Verified the replacement owner with the club.',
        newOwnerUserId: 'new-owner',
      }),
    ).resolves.toMatchObject({ status: 'RESOLVED' })

    expect(tx.membership.updateMany).toHaveBeenNthCalledWith(1, {
      where: { clubId: 'club-1', role: 'OWNER', userId: { not: 'new-owner' } },
      data: { role: 'ADMIN' },
    })
    expect(tx.membership.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'membership-new-owner', clubId: 'club-1' },
      data: { role: 'OWNER' },
    })
    expect(tx.ownershipTransfer.updateMany).toHaveBeenCalledWith({
      where: { clubId: 'club-1', status: 'PENDING' },
      data: { status: 'CANCELLED', cancelledAt: expect.any(Date) },
    })
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1)
  })

  it('rolls back dispute resolution when the selected owner is not a club member', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      clubDispute: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'dispute-1',
          clubId: 'club-1',
          status: 'OPEN',
        }),
        updateMany: jest.fn(),
      },
      membership: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([{ userId: 'old-owner' }]),
        updateMany: jest.fn(),
      },
      ownershipTransfer: { updateMany: jest.fn() },
      auditLog: { create: jest.fn() },
    }
    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    }
    const service = new ClubActivationService(
      prisma as never,
      { log: jest.fn() } as never,
      {} as never,
      {} as never,
    )

    await expect(
      service.resolvePlatformDispute('platform-1', 'dispute-1', {
        resolution: 'The submitted replacement was not a current member.',
        newOwnerUserId: 'outsider',
      }),
    ).rejects.toBeInstanceOf(ConflictException)

    expect(tx.membership.updateMany).not.toHaveBeenCalled()
    expect(tx.clubDispute.updateMany).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })
})
