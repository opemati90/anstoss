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
      desiredRole: MembershipRole.ADMIN,
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
      membership: {
        findUnique: jest.fn().mockResolvedValue({ role: MembershipRole.OWNER }),
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
        role: MembershipRole.ADMIN,
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
    ).toThrow('official Fussball.de, DFB.de, or FuPa')
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
})
