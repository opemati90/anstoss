import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import {
  MembershipRole,
  ParentalConsentStatus,
  TeamAccessDeniedError,
  TeamAccessPhase,
  TeamAccessStatus,
  TeamGroupType,
  TeamRole,
} from '@anstoss/shared'
import { Prisma } from '@prisma/client'
import { TeamsService } from './teams.service'
import * as joinCodeUtil from './team-join-code.util'

describe('TeamsService family access', () => {
  function createService() {
    const prisma = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      teamAccess: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      guardianRelationship: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      parentalConsent: {
        findMany: jest.fn(),
      },
    }

    const service = new TeamsService(prisma as never)
    jest.spyOn(service as any, 'assertManageAccess').mockResolvedValue({
      team: {
        id: 'team-1',
        displayName: 'Herren 1',
        group: {
          id: 'group-1',
          displayName: 'Herren',
        },
      },
    })

    return { prisma, service }
  }

  it('maps the team family snapshot for coaches', async () => {
    const { prisma, service } = createService()

    prisma.teamAccess.findMany.mockResolvedValue([
      {
        user: {
          id: 'player-1',
          name: 'Lena Spielerin',
          avatarUrl: null,
        },
      },
    ])
    prisma.guardianRelationship.findMany.mockResolvedValue([
      {
        id: 'rel-1',
        teamId: 'team-1',
        childName: 'Lena Spielerin',
        createdAt: new Date('2026-03-24T10:00:00.000Z'),
        updatedAt: new Date('2026-03-24T11:00:00.000Z'),
        parent: {
          id: 'parent-1',
          name: 'Mara Spieler',
          email: 'mara@example.com',
          avatarUrl: null,
          teamAccess: [
            {
              id: 'access-1',
              phase: TeamAccessPhase.FULL,
              status: TeamAccessStatus.ACTIVE,
            },
          ],
        },
        player: {
          id: 'player-1',
          name: 'Lena Spielerin',
          avatarUrl: null,
        },
      },
    ])
    prisma.parentalConsent.findMany.mockResolvedValue([
      {
        id: 'consent-1',
        guardianEmail: 'guardian@example.com',
        status: ParentalConsentStatus.PENDING,
        requestedAt: new Date('2026-03-24T12:00:00.000Z'),
        approvedAt: null,
        player: {
          id: 'player-2',
          name: 'Tom Jugend',
          avatarUrl: null,
        },
        guardian: null,
      },
    ])

    const result = await service.listTeamFamilyAccess('club-1', 'team-1', 'coach-1')

    expect(result.team.displayName).toBe('Herren 1')
    expect(result.players).toHaveLength(1)
    expect(result.relationships[0]?.parent.email).toBe('mara@example.com')
    expect(result.pendingConsents[0]?.guardianEmail).toBe('guardian@example.com')
  })

  it('blocks linking a parent to a player outside the squad', async () => {
    const { prisma, service } = createService()

    prisma.guardianRelationship.findFirst.mockResolvedValue({
      id: 'rel-1',
      clubId: 'club-1',
      teamId: 'team-1',
      playerUserId: null,
      childName: null,
      player: null,
    })
    prisma.teamAccess.findFirst.mockResolvedValue(null)

    await expect(
      service.updateGuardianRelationship('club-1', 'team-1', 'rel-1', 'coach-1', {
        playerUserId: 'player-404',
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('defaults the child name to the linked player name', async () => {
    const { prisma, service } = createService()

    prisma.guardianRelationship.findFirst.mockResolvedValue({
      id: 'rel-1',
      clubId: 'club-1',
      teamId: 'team-1',
      playerUserId: null,
      childName: null,
      player: null,
    })
    prisma.teamAccess.findFirst.mockResolvedValue({
      userId: 'player-1',
      user: {
        name: 'Lena Spielerin',
      },
    })
    prisma.guardianRelationship.update.mockResolvedValue({
      id: 'rel-1',
      teamId: 'team-1',
      childName: 'Lena Spielerin',
      createdAt: new Date('2026-03-24T10:00:00.000Z'),
      updatedAt: new Date('2026-03-24T11:00:00.000Z'),
      parent: {
        id: 'parent-1',
        name: 'Mara Spieler',
        email: 'mara@example.com',
        avatarUrl: null,
        teamAccess: [],
      },
      player: {
        id: 'player-1',
        name: 'Lena Spielerin',
        avatarUrl: null,
      },
    })

    const result = await service.updateGuardianRelationship(
      'club-1',
      'team-1',
      'rel-1',
      'coach-1',
      { playerUserId: 'player-1' },
    )

    expect(prisma.guardianRelationship.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          playerUserId: 'player-1',
          childName: 'Lena Spielerin',
        }),
      }),
    )
    expect(result.player?.id).toBe('player-1')
  })
})

describe('TeamsService club authority boundary', () => {
  it('does not let a coach create a new club team group', async () => {
    const prisma = {
      membership: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'membership-1',
          clubId: 'club-1',
          userId: 'coach-1',
          role: MembershipRole.COACH,
        }),
      },
      teamGroup: { count: jest.fn(), create: jest.fn() },
    }
    const service = new TeamsService(prisma as never)

    await expect(
      service.createTeamGroup('club-1', 'coach-1', {
        type: TeamGroupType.SENIOR,
        displayName: 'Herren',
      }),
    ).rejects.toBeInstanceOf(TeamAccessDeniedError)
    expect(prisma.teamGroup.create).not.toHaveBeenCalled()
  })
})

// ── Sprint 2 Tests ───────────────────────────────────────────────

describe('TeamsService.decideTrialAccess', () => {
  function createService() {
    const prisma: any = {
      teamAccess: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      membership: {
        findUnique: jest.fn().mockResolvedValue({ id: 'membership-1' }),
      },
      // Wechselbörse review L2: no open trial invite for these rows.
      trialInvite: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
    }
    prisma.$transaction = jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma))
    const service = new TeamsService(prisma as never)
    jest.spyOn(service as any, 'assertManageAccess').mockResolvedValue({})
    return { prisma, service }
  }

  it('throws NotFoundException when teamAccess not found', async () => {
    const { prisma, service } = createService()
    prisma.teamAccess.findFirst.mockResolvedValue(null)

    await expect(
      service.decideTrialAccess('club-1', 'ta-missing', 'user-1', {
        decision: 'ACCEPT',
      }),
    ).rejects.toThrow(NotFoundException)
  })

  it('throws BadRequestException when phase is not TRIAL', async () => {
    const { prisma, service } = createService()
    prisma.teamAccess.findFirst.mockResolvedValue({
      id: 'ta-1',
      clubId: 'club-1',
      teamId: 'team-1',
      phase: TeamAccessPhase.FULL,
      team: { id: 'team-1' },
    })

    await expect(
      service.decideTrialAccess('club-1', 'ta-1', 'user-1', {
        decision: 'ACCEPT',
      }),
    ).rejects.toThrow(BadRequestException)
  })

  it('sets phase to FULL and status to ACTIVE on ACCEPT', async () => {
    const { prisma, service } = createService()
    prisma.teamAccess.findFirst.mockResolvedValue({
      id: 'ta-1',
      clubId: 'club-1',
      teamId: 'team-1',
      phase: TeamAccessPhase.TRIAL,
      team: { id: 'team-1' },
    })
    prisma.teamAccess.update.mockResolvedValue({ id: 'ta-1' })

    await service.decideTrialAccess('club-1', 'ta-1', 'user-1', {
      decision: 'ACCEPT',
    })

    expect(prisma.teamAccess.update).toHaveBeenCalledWith({
      where: { id: 'ta-1' },
      data: {
        phase: TeamAccessPhase.FULL,
        status: TeamAccessStatus.ACTIVE,
      },
    })
  })

  it('refuses to accept a Probetraining player who has no club membership yet', async () => {
    const { prisma, service } = createService()
    prisma.teamAccess.findFirst.mockResolvedValue({
      id: 'ta-1',
      clubId: 'club-1',
      teamId: 'team-1',
      userId: 'free-agent-1',
      phase: TeamAccessPhase.TRIAL,
      team: { id: 'team-1' },
    })
    prisma.membership.findUnique.mockResolvedValue(null)

    await expect(
      service.decideTrialAccess('club-1', 'ta-1', 'user-1', { decision: 'ACCEPT' }),
    ).rejects.toThrow(BadRequestException)
    expect(prisma.teamAccess.update).not.toHaveBeenCalled()
  })

  it('sets status to REJECTED on REJECT', async () => {
    const { prisma, service } = createService()
    prisma.teamAccess.findFirst.mockResolvedValue({
      id: 'ta-1',
      clubId: 'club-1',
      teamId: 'team-1',
      phase: TeamAccessPhase.TRIAL,
      team: { id: 'team-1' },
    })
    prisma.teamAccess.update.mockResolvedValue({ id: 'ta-1' })

    await service.decideTrialAccess('club-1', 'ta-1', 'user-1', {
      decision: 'REJECT',
    })

    expect(prisma.teamAccess.update).toHaveBeenCalledWith({
      where: { id: 'ta-1' },
      data: { status: TeamAccessStatus.REJECTED },
    })
  })
})

describe('TeamsService.createPlayerLoan', () => {
  function createService() {
    const prisma = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'player-1' }) },
      team: { findUnique: jest.fn() },
      teamAccess: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
    }
    Object.assign(prisma, {
      $transaction: jest.fn(async (callback: (tx: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
      ),
    })
    const service = new TeamsService(prisma as never)
    jest.spyOn(service as any, 'assertLoanManageAccess').mockResolvedValue({})
    return { prisma, service }
  }

  const input = {
    playerUserId: 'player-1',
    targetTeamId: 'team-2',
  }

  it('rejects when target team not in same club', async () => {
    const { prisma, service } = createService()
    prisma.team.findUnique.mockResolvedValue({ id: 'team-2', clubId: 'other-club' })

    await expect(service.createPlayerLoan('club-1', 'team-1', 'coach-1', input)).rejects.toThrow(
      BadRequestException,
    )
  })

  it('rejects loaning to the same team', async () => {
    const { prisma, service } = createService()
    prisma.team.findUnique.mockResolvedValue({ id: 'team-1', clubId: 'club-1' })

    await expect(
      service.createPlayerLoan('club-1', 'team-1', 'coach-1', {
        ...input,
        targetTeamId: 'team-1',
      }),
    ).rejects.toThrow(BadRequestException)
  })

  it('rejects an invalid or expired loan end date', async () => {
    const { prisma, service } = createService()
    prisma.team.findUnique.mockResolvedValue({ id: 'team-2', clubId: 'club-1' })

    await expect(
      service.createPlayerLoan('club-1', 'team-1', 'coach-1', {
        ...input,
        loanEndDate: '2020-01-01',
      }),
    ).rejects.toThrow('Loan end date must be in the future.')
  })

  it('rejects when player has no active access on source team', async () => {
    const { prisma, service } = createService()
    prisma.team.findUnique.mockResolvedValue({ id: 'team-2', clubId: 'club-1' })
    prisma.teamAccess.findFirst.mockResolvedValue(null)

    await expect(service.createPlayerLoan('club-1', 'team-1', 'coach-1', input)).rejects.toThrow(
      BadRequestException,
    )
  })

  it('rejects chaining a second loan from a temporary source team', async () => {
    const { prisma, service } = createService()
    prisma.team.findUnique.mockResolvedValue({ id: 'team-2', clubId: 'club-1' })
    prisma.teamAccess.findFirst.mockResolvedValue({
      id: 'source-loan',
      loanedFromTeamId: 'original-team',
    })

    await expect(service.createPlayerLoan('club-1', 'team-1', 'coach-1', input)).rejects.toThrow(
      'A loaned player cannot be loaned to another team.',
    )
    expect(prisma.teamAccess.findUnique).not.toHaveBeenCalled()
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(3)
  })

  it('rejects when player already has access on target team', async () => {
    const { prisma, service } = createService()
    prisma.team.findUnique.mockResolvedValue({ id: 'team-2', clubId: 'club-1' })
    prisma.teamAccess.findFirst.mockResolvedValue({ id: 'source-access' })
    prisma.teamAccess.findUnique.mockResolvedValue({
      id: 'existing-target',
      status: TeamAccessStatus.ACTIVE,
    })

    await expect(service.createPlayerLoan('club-1', 'team-1', 'coach-1', input)).rejects.toThrow(
      BadRequestException,
    )
  })

  it('creates loan with correct data on success', async () => {
    const { prisma, service } = createService()
    prisma.team.findUnique.mockResolvedValue({ id: 'team-2', clubId: 'club-1' })
    prisma.teamAccess.findFirst.mockResolvedValue({ id: 'source-access' })
    prisma.teamAccess.findUnique.mockResolvedValue(null)
    prisma.teamAccess.create.mockResolvedValue({ id: 'loan-1', team: { id: 'team-2' } })

    const result = await service.createPlayerLoan('club-1', 'team-1', 'coach-1', input)

    expect(prisma.teamAccess.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clubId: 'club-1',
        teamId: 'team-2',
        userId: 'player-1',
        role: TeamRole.PLAYER,
        phase: TeamAccessPhase.FULL,
        status: TeamAccessStatus.ACTIVE,
        loanedFromTeamId: 'team-1',
      }),
      include: { team: true },
    })
    expect(result?.id).toBe('loan-1')
  })

  it('atomically reactivates a previously revoked loan row', async () => {
    const { prisma, service } = createService()
    prisma.team.findUnique.mockResolvedValue({ id: 'team-2', clubId: 'club-1' })
    prisma.teamAccess.findFirst.mockResolvedValue({ id: 'source-access' })
    prisma.teamAccess.findUnique
      .mockResolvedValueOnce({ id: 'old-loan', status: TeamAccessStatus.REVOKED })
      .mockResolvedValueOnce({ id: 'old-loan' })
    prisma.teamAccess.updateMany.mockResolvedValue({ count: 1 })

    await service.createPlayerLoan('club-1', 'team-1', 'coach-1', input)

    expect(prisma.teamAccess.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'old-loan',
        status: { in: [TeamAccessStatus.REJECTED, TeamAccessStatus.REVOKED] },
      },
      data: expect.objectContaining({
        status: TeamAccessStatus.ACTIVE,
        loanedFromTeamId: 'team-1',
        loanStartDate: expect.any(Date),
      }),
    })
  })

  it('turns a concurrent unique activation into a safe conflict', async () => {
    const { prisma, service } = createService()
    prisma.team.findUnique.mockResolvedValue({ id: 'team-2', clubId: 'club-1' })
    prisma.teamAccess.findFirst.mockResolvedValue({ id: 'source-access' })
    prisma.teamAccess.findUnique.mockResolvedValue(null)
    prisma.teamAccess.create.mockRejectedValue({ code: 'P2002' })

    await expect(service.createPlayerLoan('club-1', 'team-1', 'coach-1', input)).rejects.toThrow(
      'Player already has access to the target team.',
    )
  })

  it('does not create a loan for an account deleted before its lifecycle lock', async () => {
    const { prisma, service } = createService()
    prisma.team.findUnique.mockResolvedValue({ id: 'team-2', clubId: 'club-1' })
    prisma.user.findFirst.mockResolvedValue(null)

    await expect(service.createPlayerLoan('club-1', 'team-1', 'coach-1', input)).rejects.toThrow(
      'Player account is no longer active.',
    )

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1)
    expect(prisma.teamAccess.findFirst).not.toHaveBeenCalled()
    expect(prisma.teamAccess.create).not.toHaveBeenCalled()
  })
})

describe('TeamsService coach assignment lifecycle', () => {
  it('locks target users in stable order and rejects deleted staff before activating access', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      membership: { findMany: jest.fn().mockResolvedValue([]) },
      teamAccess: { updateMany: jest.fn(), upsert: jest.fn() },
    }
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    }
    const service = new TeamsService(prisma as never)

    await expect(
      (service as any).syncCoachAssignments('club-1', 'team-1', {
        headCoachUserId: 'user-z',
        assistantCoachUserIds: ['user-a'],
      }),
    ).rejects.toThrow('Assigned coaches must be active members of the club staff')

    expect(tx.$executeRaw).toHaveBeenCalledTimes(2)
    expect(tx.membership.findMany).toHaveBeenCalledWith({
      where: {
        clubId: 'club-1',
        userId: { in: ['user-a', 'user-z'] },
        user: { deletedAt: null },
      },
      select: { userId: true, role: true },
    })
    expect(tx.teamAccess.upsert).not.toHaveBeenCalled()
  })
})

describe('TeamsService loan authorization expiry', () => {
  it('only includes unexpired active access in team authorization context', async () => {
    const prisma = {
      team: {
        findUnique: jest.fn().mockResolvedValue({ id: 'team-1', clubId: 'club-1', group: null }),
      },
      membership: { findUnique: jest.fn().mockResolvedValue(null) },
      teamAccess: { findMany: jest.fn().mockResolvedValue([]) },
    }
    const service = new TeamsService(prisma as never)

    await (service as any).getTeamContext('player-1', 'team-1')

    expect(prisma.teamAccess.findMany).toHaveBeenCalledWith({
      where: {
        teamId: 'team-1',
        userId: 'player-1',
        status: TeamAccessStatus.ACTIVE,
        OR: [{ loanEndDate: null }, { loanEndDate: { gt: expect.any(Date) } }],
      },
      orderBy: [{ createdAt: 'asc' }],
    })
  })

  it('does not grant a club COACH loan authority without source-team assignment', async () => {
    const prisma = {
      team: {
        findUnique: jest.fn().mockResolvedValue({ id: 'team-1', clubId: 'club-1', group: null }),
      },
      membership: {
        findUnique: jest.fn().mockResolvedValue({ role: MembershipRole.COACH }),
      },
      teamAccess: { findMany: jest.fn().mockResolvedValue([]) },
    }
    const service = new TeamsService(prisma as never)

    await expect(
      (service as any).assertLoanManageAccess('coach-1', 'club-1', 'team-1'),
    ).rejects.toThrow(TeamAccessDeniedError)
  })

  it('requires a linked child to retain live access for guardian authorization', async () => {
    const prisma = {
      team: {
        findUnique: jest.fn().mockResolvedValue({ id: 'team-1', clubId: 'club-1', group: null }),
      },
      membership: { findUnique: jest.fn().mockResolvedValue(null) },
      teamAccess: { findMany: jest.fn().mockResolvedValue([]) },
      guardianRelationship: { findFirst: jest.fn().mockResolvedValue(null) },
    }
    const service = new TeamsService(prisma as never)

    await expect(service.assertReadableAccess('parent-1', 'team-1')).rejects.toThrow(
      TeamAccessDeniedError,
    )
    expect(prisma.guardianRelationship.findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        parentUserId: 'parent-1',
        teamId: 'team-1',
        OR: [
          { playerUserId: null },
          {
            player: {
              teamAccess: {
                some: {
                  teamId: 'team-1',
                  status: TeamAccessStatus.ACTIVE,
                  OR: [{ loanEndDate: null }, { loanEndDate: { gt: expect.any(Date) } }],
                },
              },
              memberships: { some: { clubId: expect.any(String) } },
            },
          },
        ],
      },
      select: { id: true },
    })
  })
})

describe('TeamsService.recallPlayerLoan', () => {
  function createService() {
    const events = { emit: jest.fn() }
    const prisma = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      teamAccess: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      guardianRelationship: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
      membership: { findUnique: jest.fn() },
    }
    Object.assign(prisma, {
      $transaction: jest.fn(async (callback: (tx: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
      ),
    })
    const service = new TeamsService(prisma as never, events as never)
    jest.spyOn(service as any, 'assertLoanManageAccess').mockResolvedValue({})
    return { prisma, service, events }
  }

  it('throws NotFoundException when loan not found', async () => {
    const { prisma, service } = createService()
    prisma.teamAccess.findUnique.mockResolvedValue(null)

    await expect(
      service.recallPlayerLoan('club-1', 'team-1', 'ta-missing', 'coach-1'),
    ).rejects.toThrow(NotFoundException)
  })

  it('throws NotFoundException when clubId mismatches', async () => {
    const { prisma, service } = createService()
    prisma.teamAccess.findUnique.mockResolvedValue({
      id: 'ta-1',
      clubId: 'other-club',
      loanedFromTeamId: 'team-1',
      status: TeamAccessStatus.ACTIVE,
    })

    await expect(service.recallPlayerLoan('club-1', 'team-1', 'ta-1', 'coach-1')).rejects.toThrow(
      NotFoundException,
    )
  })

  it('idempotently repairs guardian access when the loan was already recalled', async () => {
    const { prisma, service } = createService()
    prisma.teamAccess.findUnique.mockResolvedValue({
      id: 'ta-1',
      clubId: 'club-1',
      teamId: 'target-1',
      userId: 'player-1',
      loanedFromTeamId: 'team-1',
      status: TeamAccessStatus.REVOKED,
    })

    await expect(
      service.recallPlayerLoan('club-1', 'team-1', 'ta-1', 'coach-1'),
    ).resolves.toMatchObject({ status: TeamAccessStatus.REVOKED })
    expect(prisma.guardianRelationship.findMany).toHaveBeenCalled()
  })

  it('does not recall a new loan that reactivated an old revoked row', async () => {
    const { prisma, service, events } = createService()
    const base = {
      id: 'ta-1',
      clubId: 'club-1',
      teamId: 'target-1',
      userId: 'player-1',
      loanedFromTeamId: 'team-1',
    }
    prisma.teamAccess.findUnique
      .mockResolvedValueOnce({ ...base, status: TeamAccessStatus.REVOKED })
      .mockResolvedValueOnce({ ...base, status: TeamAccessStatus.ACTIVE })

    await expect(service.recallPlayerLoan('club-1', 'team-1', 'ta-1', 'coach-1')).rejects.toThrow(
      'Loan was reactivated before it could be recalled.',
    )
    expect(prisma.teamAccess.updateMany).not.toHaveBeenCalled()
    expect(events.emit).not.toHaveBeenCalled()
  })

  it('sets status to REVOKED on success', async () => {
    const { prisma, service } = createService()
    prisma.teamAccess.findUnique.mockResolvedValue({
      id: 'ta-1',
      clubId: 'club-1',
      loanedFromTeamId: 'team-1',
      status: TeamAccessStatus.ACTIVE,
    })
    prisma.teamAccess.updateMany.mockResolvedValue({ count: 1 })

    await service.recallPlayerLoan('club-1', 'team-1', 'ta-1', 'coach-1')

    expect(prisma.teamAccess.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'ta-1',
        clubId: 'club-1',
        loanedFromTeamId: 'team-1',
        status: TeamAccessStatus.ACTIVE,
      },
      data: { status: TeamAccessStatus.REVOKED },
    })
  })

  it('does not revoke a loan that changed source during recall', async () => {
    const { prisma, service } = createService()
    prisma.teamAccess.findUnique.mockResolvedValue({
      id: 'ta-1',
      clubId: 'club-1',
      userId: 'player-1',
      loanedFromTeamId: 'team-1',
      status: TeamAccessStatus.ACTIVE,
    })
    prisma.teamAccess.updateMany.mockResolvedValue({ count: 0 })

    await expect(service.recallPlayerLoan('club-1', 'team-1', 'ta-1', 'coach-1')).rejects.toThrow(
      'Loan changed before it could be recalled.',
    )
  })

  it('disconnects and revokes a guardian when their last linked loan is recalled', async () => {
    const { prisma, service, events } = createService()
    const loanAccess = {
      id: 'ta-1',
      clubId: 'club-1',
      teamId: 'target-1',
      userId: 'player-1',
      loanedFromTeamId: 'team-1',
      status: TeamAccessStatus.ACTIVE,
    }
    prisma.teamAccess.findUnique
      .mockResolvedValueOnce(loanAccess)
      .mockResolvedValueOnce(loanAccess)
      .mockResolvedValueOnce({ id: 'parent-access', status: TeamAccessStatus.ACTIVE })
    prisma.teamAccess.updateMany.mockResolvedValue({ count: 1 })
    prisma.teamAccess.findFirst.mockResolvedValue(null)
    prisma.teamAccess.findMany.mockResolvedValue([])
    prisma.guardianRelationship.findMany
      .mockResolvedValueOnce([{ parentUserId: 'parent-1' }])
      .mockResolvedValueOnce([{ playerUserId: 'player-1' }])
    prisma.guardianRelationship.findFirst.mockResolvedValue(null)
    prisma.membership.findUnique.mockResolvedValue(null)

    await service.recallPlayerLoan('club-1', 'team-1', 'ta-1', 'coach-1')

    expect(prisma.teamAccess.updateMany).toHaveBeenCalledWith({
      where: { id: 'parent-access', status: TeamAccessStatus.ACTIVE },
      data: { status: TeamAccessStatus.REVOKED },
    })
    expect(events.emit).toHaveBeenCalledWith('realtime.access.changed', {
      userId: 'parent-1',
    })
  })

  it('keeps a guardian connected when another linked child still has target access', async () => {
    const { prisma, service, events } = createService()
    const otherLoanEnd = new Date('2027-02-01T00:00:00.000Z')
    const loanAccess = {
      id: 'ta-1',
      clubId: 'club-1',
      teamId: 'target-1',
      userId: 'player-1',
      loanedFromTeamId: 'team-1',
      status: TeamAccessStatus.ACTIVE,
    }
    prisma.teamAccess.findUnique
      .mockResolvedValueOnce(loanAccess)
      .mockResolvedValueOnce(loanAccess)
      .mockResolvedValueOnce({ id: 'parent-access', status: TeamAccessStatus.ACTIVE })
    prisma.teamAccess.updateMany.mockResolvedValue({ count: 1 })
    prisma.teamAccess.findFirst.mockResolvedValue(null)
    prisma.teamAccess.findMany.mockResolvedValue([{ loanEndDate: otherLoanEnd }])
    prisma.guardianRelationship.findMany
      .mockResolvedValueOnce([{ parentUserId: 'parent-1' }])
      .mockResolvedValueOnce([{ playerUserId: 'player-1' }, { playerUserId: 'player-2' }])
    prisma.guardianRelationship.findFirst.mockResolvedValue(null)
    prisma.membership.findUnique.mockResolvedValue(null)

    await service.recallPlayerLoan('club-1', 'team-1', 'ta-1', 'coach-1')

    expect(prisma.teamAccess.updateMany).toHaveBeenCalledWith({
      where: { id: 'parent-access' },
      data: { status: TeamAccessStatus.ACTIVE, loanEndDate: otherLoanEnd },
    })
    expect(events.emit).not.toHaveBeenCalledWith('realtime.access.changed', {
      userId: 'parent-1',
    })
  })

  it('does not emit realtime changes when the atomic recall transaction fails', async () => {
    const { prisma, service, events } = createService()
    prisma.teamAccess.findUnique.mockResolvedValue({
      id: 'ta-1',
      clubId: 'club-1',
      teamId: 'target-1',
      userId: 'player-1',
      loanedFromTeamId: 'team-1',
      status: TeamAccessStatus.ACTIVE,
    })
    ;(prisma as any).$transaction.mockRejectedValue(new Error('transaction rolled back'))

    await expect(service.recallPlayerLoan('club-1', 'team-1', 'ta-1', 'coach-1')).rejects.toThrow(
      'transaction rolled back',
    )
    expect(events.emit).not.toHaveBeenCalled()
  })
})

describe('TeamsService.updateRosterEntry', () => {
  function createService() {
    const prisma = {
      teamMember: {
        upsert: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      teamAccess: { findFirst: jest.fn().mockResolvedValue({ id: 'access-1' }) },
    }
    const service = new TeamsService(prisma as never)
    const assertManageAccess = jest
      .spyOn(service as any, 'assertManageAccess')
      .mockResolvedValue({})
    return { prisma, service, assertManageAccess }
  }

  it('lets a player mark themself away without manage access', async () => {
    const { prisma, service, assertManageAccess } = createService()
    prisma.teamMember.upsert.mockResolvedValue({})

    await service.updateRosterEntry('club-1', 'team-1', 'player-1', 'player-1', {
      absence: 'AWAY',
      absenceUntil: '2026-10-12T21:59:00.000Z',
    })

    expect(assertManageAccess).not.toHaveBeenCalled()
    expect(prisma.teamAccess.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'player-1', role: TeamRole.PLAYER }),
      }),
    )
    expect(prisma.teamMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {
          absence: 'AWAY',
          absenceUntil: new Date('2026-10-12T21:59:00.000Z'),
        },
      }),
    )
  })

  it('clears the end date when a player reports back fit', async () => {
    const { prisma, service } = createService()
    prisma.teamMember.upsert.mockResolvedValue({})

    await service.updateRosterEntry('club-1', 'team-1', 'player-1', 'player-1', {
      absence: 'NONE',
      absenceUntil: '2026-10-12T21:59:00.000Z',
    })

    expect(prisma.teamMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { absence: 'NONE', absenceUntil: null } }),
    )
  })

  it('does not let a player lift a coach-set suspension', async () => {
    const { prisma, service } = createService()
    prisma.teamMember.findUnique.mockResolvedValue({ absence: 'SUSPENDED', absenceUntil: null })

    await expect(
      service.updateRosterEntry('club-1', 'team-1', 'player-1', 'player-1', { absence: 'NONE' }),
    ).rejects.toBeInstanceOf(TeamAccessDeniedError)
    expect(prisma.teamMember.upsert).not.toHaveBeenCalled()
  })

  it('requires manage access for a player suspending themself', async () => {
    const { prisma, service, assertManageAccess } = createService()
    assertManageAccess.mockRejectedValue(new TeamAccessDeniedError('You do not manage this team.'))

    await expect(
      service.updateRosterEntry('club-1', 'team-1', 'player-1', 'player-1', {
        absence: 'SUSPENDED',
      }),
    ).rejects.toBeInstanceOf(TeamAccessDeniedError)
    expect(prisma.teamMember.upsert).not.toHaveBeenCalled()
  })

  it('requires manage access to change another member, even to AWAY', async () => {
    const { prisma, service, assertManageAccess } = createService()
    assertManageAccess.mockRejectedValue(new TeamAccessDeniedError('You do not manage this team.'))

    await expect(
      service.updateRosterEntry('club-1', 'team-1', 'player-2', 'player-1', { absence: 'AWAY' }),
    ).rejects.toBeInstanceOf(TeamAccessDeniedError)
    expect(prisma.teamMember.upsert).not.toHaveBeenCalled()
  })

  it('requires manage access when a player edits their own number', async () => {
    const { service, assertManageAccess } = createService()
    assertManageAccess.mockRejectedValue(new TeamAccessDeniedError('You do not manage this team.'))

    await expect(
      service.updateRosterEntry('club-1', 'team-1', 'player-1', 'player-1', {
        absence: 'AWAY',
        jerseyNumber: 10,
      }),
    ).rejects.toBeInstanceOf(TeamAccessDeniedError)
  })

  it('lets a coach suspend a player until a date', async () => {
    const { prisma, service, assertManageAccess } = createService()
    prisma.teamMember.upsert.mockResolvedValue({})

    await service.updateRosterEntry('club-1', 'team-1', 'player-2', 'coach-1', {
      absence: 'SUSPENDED',
      absenceUntil: '2026-10-05T21:59:00.000Z',
    })

    expect(assertManageAccess).toHaveBeenCalledWith('coach-1', 'team-1')
    expect(prisma.teamAccess.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'player-2' }) }),
    )
    expect(prisma.teamMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { absence: 'SUSPENDED', absenceUntil: new Date('2026-10-05T21:59:00.000Z') },
      }),
    )
  })

  it('upserts team member with position and jersey number', async () => {
    const { prisma, service } = createService()
    prisma.teamMember.upsert.mockResolvedValue({
      teamId: 'team-1',
      userId: 'player-1',
      position: 'Mittelfeld',
      jerseyNumber: 10,
    })

    await service.updateRosterEntry('club-1', 'team-1', 'player-1', 'coach-1', {
      position: 'Mittelfeld',
      jerseyNumber: 10,
    })

    expect(prisma.teamMember.upsert).toHaveBeenCalledWith({
      where: { teamId_userId: { teamId: 'team-1', userId: 'player-1' } },
      update: { position: 'Mittelfeld', jerseyNumber: 10 },
      create: {
        teamId: 'team-1',
        userId: 'player-1',
        position: 'Mittelfeld',
        jerseyNumber: 10,
        operationalStatus: 'ACTIVE',
      },
    })
  })

  // ── Kader adversarial fixes ──────────────────────────────────────────────
  it('L1: a trialist cannot self-report an absence (phase FULL required)', async () => {
    const { prisma, service, assertManageAccess } = createService()
    // No FULL player row for the trialist → falls through to manage access.
    prisma.teamAccess.findFirst.mockImplementation(async ({ where }: any) =>
      where.phase === TeamAccessPhase.FULL ? null : { id: 'trial-access' },
    )
    assertManageAccess.mockRejectedValue(new TeamAccessDeniedError('You do not manage this team.'))

    await expect(
      service.updateRosterEntry('club-1', 'team-1', 'trial-1', 'trial-1', { absence: 'AWAY' }),
    ).rejects.toBeInstanceOf(TeamAccessDeniedError)
    expect(prisma.teamAccess.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ phase: TeamAccessPhase.FULL }) }),
    )
    expect(prisma.teamMember.upsert).not.toHaveBeenCalled()
  })

  it('L2: rejects a shirt number another roster member already wears with 409', async () => {
    const { prisma, service } = createService()
    prisma.teamMember.findMany.mockResolvedValue([{ userId: 'player-9' }])
    prisma.teamAccess.findFirst.mockResolvedValue({ user: { name: 'Tim Weber' } })

    const attempt = service.updateRosterEntry('club-1', 'team-1', 'player-1', 'coach-1', {
      jerseyNumber: 10,
    })
    await expect(attempt).rejects.toBeInstanceOf(ConflictException)
    await expect(attempt).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'JERSEY_NUMBER_TAKEN' }),
    })
    expect(prisma.teamMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { teamId: 'team-1', jerseyNumber: 10, userId: { not: 'player-1' } },
      }),
    )
    expect(prisma.teamMember.upsert).not.toHaveBeenCalled()
  })

  it('L2: a number held only by someone who left the team is free again', async () => {
    const { prisma, service } = createService()
    prisma.teamMember.findMany.mockResolvedValue([{ userId: 'left-player' }])
    prisma.teamAccess.findFirst.mockImplementation(async ({ where }: any) =>
      where.userId?.in ? null : { id: 'access-1' },
    )
    prisma.teamMember.upsert.mockResolvedValue({})

    await service.updateRosterEntry('club-1', 'team-1', 'player-1', 'coach-1', { jerseyNumber: 10 })
    expect(prisma.teamMember.upsert).toHaveBeenCalled()
  })
})

describe('TeamsService.getAggregateRoster', () => {
  function createService() {
    const prisma = {
      membership: { findUnique: jest.fn() },
      team: { findMany: jest.fn() },
    }
    const service = new TeamsService(prisma as never)
    jest.spyOn(service as any, 'assertClubManager').mockResolvedValue({ role: 'OWNER' })
    return { prisma, service }
  }

  it('returns Record keyed by teamId with mapped member data', async () => {
    const { prisma, service } = createService()
    prisma.team.findMany.mockResolvedValue([
      {
        id: 'team-1',
        name: 'Erste',
        displayName: 'Herren 1',
        group: { displayName: 'Herren' },
        access: [
          {
            userId: 'u-1',
            role: 'PLAYER',
            phase: 'FULL',
            status: 'ACTIVE',
            loanedFromTeamId: null,
            user: { id: 'u-1', name: 'Max', email: 'max@ex.com', avatarUrl: null },
          },
        ],
        members: [{ userId: 'u-1', position: 'Sturm', jerseyNumber: 9 }],
      },
    ])

    const result = await service.getAggregateRoster('club-1', 'admin-1')

    expect(result['team-1']).toBeDefined()
    expect(result['team-1'].teamName).toBe('Erste')
    expect(result['team-1'].teamDisplayName).toBe('Herren 1')
    expect(result['team-1'].groupName).toBe('Herren')
    expect(result['team-1'].members[0].position).toBe('Sturm')
    expect(result['team-1'].members[0].jerseyNumber).toBe(9)
  })

  it('falls back to team.name when displayName is null', async () => {
    const { prisma, service } = createService()
    prisma.team.findMany.mockResolvedValue([
      {
        id: 'team-2',
        name: 'Zweite',
        displayName: null,
        group: { displayName: 'Herren' },
        access: [],
        members: [],
      },
    ])

    const result = await service.getAggregateRoster('club-1', 'admin-1')

    expect(result['team-2'].teamName).toBe('Zweite')
    expect(result['team-2'].teamDisplayName).toBeNull()
  })

  it('hydrates loanedFromTeamName from other teams', async () => {
    const { prisma, service } = createService()
    prisma.team.findMany.mockResolvedValue([
      {
        id: 'team-a',
        name: 'TeamA',
        displayName: 'A Display',
        group: { displayName: 'Herren' },
        access: [
          {
            userId: 'u-loan',
            role: 'PLAYER',
            phase: 'FULL',
            status: 'ACTIVE',
            loanedFromTeamId: 'team-b',
            user: { id: 'u-loan', name: 'Loaned', email: 'l@ex.com', avatarUrl: null },
          },
        ],
        members: [],
      },
      {
        id: 'team-b',
        name: 'TeamB',
        displayName: 'B Display',
        group: { displayName: 'Damen' },
        access: [],
        members: [],
      },
    ])

    const result = await service.getAggregateRoster('club-1', 'admin-1')

    expect(result['team-a'].members[0].loanedFromTeamId).toBe('team-b')
    expect(result['team-a'].members[0].loanedFromTeamName).toBe('B Display')
  })

  it('returns null loanedFromTeamName when source team not found', async () => {
    const { prisma, service } = createService()
    prisma.team.findMany.mockResolvedValue([
      {
        id: 'team-x',
        name: 'TeamX',
        displayName: null,
        group: { displayName: 'Herren' },
        access: [
          {
            userId: 'u-1',
            role: 'PLAYER',
            phase: 'FULL',
            status: 'ACTIVE',
            loanedFromTeamId: 'team-deleted',
            user: { id: 'u-1', name: 'Ghost', email: 'g@ex.com', avatarUrl: null },
          },
        ],
        members: [],
      },
    ])

    const result = await service.getAggregateRoster('club-1', 'admin-1')

    expect(result['team-x'].members[0].loanedFromTeamName).toBeNull()
  })
})

describe('TeamsService.getClubStats', () => {
  function createService() {
    const prisma = {
      membership: { findUnique: jest.fn(), count: jest.fn() },
      team: { findMany: jest.fn() },
      event: { count: jest.fn() },
      rsvp: { findMany: jest.fn() },
    }
    const service = new TeamsService(prisma as never)
    jest.spyOn(service as any, 'assertClubManager').mockResolvedValue({ role: 'OWNER' })
    return { prisma, service }
  }

  it('computes club stats with per-team RSVP rate', async () => {
    const { prisma, service } = createService()
    prisma.membership.count.mockResolvedValue(25)
    prisma.team.findMany.mockResolvedValue([
      {
        id: 'team-1',
        name: 'Erste',
        displayName: 'Herren 1',
        _count: { access: 12 },
        events: [{ id: 'e-1' }, { id: 'e-2' }],
      },
      {
        id: 'team-2',
        name: 'Zweite',
        displayName: null,
        _count: { access: 8 },
        events: [{ id: 'e-3' }],
      },
    ])
    prisma.event.count.mockResolvedValue(5)
    prisma.rsvp.findMany.mockResolvedValue([
      { status: 'YES', event: { teamId: 'team-1' } },
      { status: 'YES', event: { teamId: 'team-1' } },
      { status: 'NO', event: { teamId: 'team-1' } },
      { status: 'YES', event: { teamId: 'team-2' } },
      { status: 'NO', event: { teamId: 'team-2' } },
      { status: 'NO', event: { teamId: 'team-2' } },
    ])

    const result = await service.getClubStats('club-1', 'admin-1')

    expect(result.memberCount).toBe(25)
    expect(result.teamCount).toBe(2)
    expect(result.upcomingEventCount).toBe(5)
    expect(result.overallRsvpRate).toBe(50) // 3 YES out of 6 total = 50%
    expect(result.teams[0].memberCount).toBe(12)
    expect(result.teams[0].upcomingEventCount).toBe(2)
    expect(result.teams[0].rsvpRate).toBe(67) // 2/3 = 66.67 → 67
    expect(result.teams[1].rsvpRate).toBe(33) // 1/3 = 33.33 → 33
  })

  it('returns 0 RSVP rate when no RSVPs exist', async () => {
    const { prisma, service } = createService()
    prisma.membership.count.mockResolvedValue(0)
    prisma.team.findMany.mockResolvedValue([])
    prisma.event.count.mockResolvedValue(0)
    prisma.rsvp.findMany.mockResolvedValue([])

    const result = await service.getClubStats('club-1', 'admin-1')

    expect(result.overallRsvpRate).toBe(0)
  })

  it('returns 0 rsvpRate for team with no RSVPs', async () => {
    const { prisma, service } = createService()
    prisma.membership.count.mockResolvedValue(10)
    prisma.team.findMany.mockResolvedValue([
      {
        id: 'team-lonely',
        name: 'NoRsvp',
        displayName: null,
        _count: { access: 5 },
        events: [],
      },
    ])
    prisma.event.count.mockResolvedValue(0)
    prisma.rsvp.findMany.mockResolvedValue([])

    const result = await service.getClubStats('club-1', 'admin-1')

    expect(result.teams[0].rsvpRate).toBe(0)
  })
})

describe('TeamsService.regenerateJoinCode', () => {
  function createService() {
    const prisma = {
      membership: {
        findUnique: jest.fn(),
      },
      team: {
        update: jest.fn(),
      },
    }
    const service = new TeamsService(prisma as never)
    return { prisma, service }
  }

  it('sets a unique 10-char joinCode on the team', async () => {
    const { prisma, service } = createService()
    prisma.membership.findUnique.mockResolvedValue({
      userId: 'owner-1',
      clubId: 'club-1',
      role: 'OWNER',
    })
    prisma.team.update.mockResolvedValue({ id: 'team-1', joinCode: 'AB2CD34EFG' })

    const result = await service.regenerateJoinCode('club-1', 'team-1', 'owner-1')

    expect(result.joinCode).toMatch(/^[A-Z2-9]{10}$/)
    expect(prisma.team.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'team-1', clubId: 'club-1' },
        select: { id: true, joinCode: true },
      }),
    )
  })

  it.each([['PLAYER'], ['COACH']])(
    'rejects callers who are not OWNER/ADMIN (role: %s)',
    async (role) => {
      const { prisma, service } = createService()
      prisma.membership.findUnique.mockResolvedValue({
        userId: 'stranger-1',
        clubId: 'club-1',
        role,
      })

      await expect(service.regenerateJoinCode('club-1', 'team-1', 'stranger-1')).rejects.toThrow(
        /access/i,
      )
    },
  )

  it('retries on collision and eventually succeeds', async () => {
    const { prisma, service } = createService()
    prisma.membership.findUnique.mockResolvedValue({
      userId: 'owner-1',
      clubId: 'club-1',
      role: 'OWNER',
    })

    const collision = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '5.0.0',
      meta: { target: ['joinCode'] },
    })
    prisma.team.update
      .mockRejectedValueOnce(collision)
      .mockResolvedValueOnce({ id: 'team-1', joinCode: 'BBBBBBBBBB' })

    const spy = jest.spyOn(joinCodeUtil, 'generateJoinCode')
    spy.mockReturnValueOnce('AAAAAAAAAA').mockReturnValueOnce('BBBBBBBBBB')

    const result = await service.regenerateJoinCode('club-1', 'team-1', 'owner-1')
    expect(result.joinCode).toBe('BBBBBBBBBB')
    spy.mockRestore()
  })
})

describe('TeamsService.getTeamByCode', () => {
  function createService() {
    const prisma = {
      team: {
        findUnique: jest.fn(),
      },
    }
    const service = new TeamsService(prisma as never)
    return { prisma, service }
  }

  it('returns the team and its club for a valid code', async () => {
    const { prisma, service } = createService()
    prisma.team.findUnique.mockResolvedValue({
      id: 'team-1',
      name: 'Herren',
      displayName: 'Herren 1',
      clubId: 'club-1',
      joinCode: 'AB2CD34EFG',
      club: {
        id: 'club-1',
        name: 'FC Anstoss',
        badgeUrl: null,
        primaryColor: '#1A1A18',
      },
    })

    const result = await service.getTeamByCode('AB2CD34EFG')

    expect(result.team.id).toBe('team-1')
    expect(result.club.id).toBe('club-1')
  })

  it('throws NotFoundException for a missing code', async () => {
    const { prisma, service } = createService()
    prisma.team.findUnique.mockResolvedValue(null)

    await expect(service.getTeamByCode('ZZZZZ')).rejects.toThrow(NotFoundException)
  })

  it('uppercases input before lookup', async () => {
    const { prisma, service } = createService()
    prisma.team.findUnique.mockResolvedValue({
      id: 'team-1',
      name: 'Herren',
      displayName: 'Herren 1',
      clubId: 'club-1',
      joinCode: 'AB2CD34EFG',
      club: {
        id: 'club-1',
        name: 'FC Anstoss',
        badgeUrl: null,
        primaryColor: '#1A1A18',
      },
    })

    const result = await service.getTeamByCode('ab2cd34efg')

    expect(result.team.id).toBe('team-1')
    expect(prisma.team.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { joinCode: 'AB2CD34EFG' },
      }),
    )
  })
})

describe('TeamsService.getRosterOperations squad count (Kader)', () => {
  function access(
    userId: string,
    overrides: Partial<{ role: string; phase: string; status: string; loanEndDate: Date | null }> = {},
  ) {
    return {
      id: `access-${userId}`,
      userId,
      role: TeamRole.PLAYER,
      phase: TeamAccessPhase.FULL,
      status: TeamAccessStatus.ACTIVE,
      loanEndDate: null,
      loanedFromTeamId: null,
      loanedFromTeam: null,
      createdAt: new Date('2026-08-01T10:00:00.000Z'),
      user: { id: userId, name: `Spieler ${userId}`, avatarUrl: null },
      ...overrides,
    }
  }

  function createService() {
    const prisma = {
      team: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'team-1',
          name: 'Herren 1',
          displayName: 'Herren 1',
          squadTarget: 18,
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      teamAccess: { findMany: jest.fn() },
      teamMember: { findMany: jest.fn() },
      injuryReport: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      teamDutyAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      userBlock: { findMany: jest.fn().mockResolvedValue([]) },
      guardianRelationship: { findMany: jest.fn().mockResolvedValue([]) },
      parentalConsent: { findMany: jest.fn().mockResolvedValue([]) },
    }
    const service = new TeamsService(prisma as never)
    const readableAccess = jest.spyOn(service as any, 'assertReadableAccess').mockResolvedValue({
      membership: { role: MembershipRole.ADMIN },
      activeTeamAccess: [],
    })
    return { prisma, service, readableAccess }
  }

  // The roster query and the loaned-out query both hit teamAccess.findMany.
  function rosterOnly(rows: unknown[], loans: unknown[] = []) {
    return async ({ where }: any) => (where?.loanedFromTeamId ? loans : rows)
  }

  it('counts players only: no coaches, trialists, inactive or ended loans', async () => {
    const { prisma, service } = createService()
    prisma.teamAccess.findMany.mockImplementation(rosterOnly([
      access('p1'),
      access('p2'),
      access('p-new'),
      access('p-inactive'),
      access('coach', { role: TeamRole.HEAD_COACH }),
      access('trial', { phase: TeamAccessPhase.TRIAL }),
      access('loan-ended', { loanEndDate: new Date('2020-01-01T00:00:00.000Z') }),
      access('pending', { status: TeamAccessStatus.PENDING }),
    ]))
    prisma.teamMember.findMany.mockResolvedValue([
      { userId: 'p-new', operationalStatus: 'NEW_PLAYER', absence: 'NONE', absenceUntil: null },
      { userId: 'p-inactive', operationalStatus: 'INACTIVE', absence: 'NONE', absenceUntil: null },
      {
        userId: 'p2',
        operationalStatus: 'ACTIVE',
        absence: 'AWAY',
        absenceUntil: new Date('2099-01-01T00:00:00.000Z'),
      },
      {
        userId: 'p1',
        operationalStatus: 'ACTIVE',
        absence: 'SUSPENDED',
        absenceUntil: new Date('2020-01-01T00:00:00.000Z'),
      },
    ])

    const snapshot = await service.getRosterOperations('club-1', 'team-1', 'coach-1')

    expect(snapshot.squadCount).toBe(3)
    const byId = new Map(snapshot.squad.map((m) => [m.userId, m]))
    expect(byId.get('p2')?.absence).toBe('AWAY')
    expect(byId.get('p2')?.absenceUntil).toBe('2099-01-01T00:00:00.000Z')
    // An expired Sperre reads as fit.
    expect(byId.get('p1')?.absence).toBe('NONE')
    expect(byId.get('p1')?.absenceUntil).toBeNull()
    expect(byId.get('p1')).not.toHaveProperty('loanEndDate')
  })

  it.each(['player', 'guardian'])('does not fetch or return teammate health data to a %s', async (role) => {
    const { prisma, service, readableAccess } = createService()
    readableAccess.mockResolvedValue({
      membership: { role: role === 'guardian' ? MembershipRole.PARENT : MembershipRole.PLAYER },
      activeTeamAccess: role === 'player' ? [{ role: TeamRole.PLAYER }] : [],
    })
    prisma.teamAccess.findMany.mockImplementation(rosterOnly([access('p1')]))
    prisma.teamMember.findMany.mockResolvedValue([])

    const snapshot = await service.getRosterOperations('club-1', 'team-1', role)

    expect(prisma.injuryReport.findMany).not.toHaveBeenCalled()
    expect(snapshot.medic).toEqual({ active: [], recentlyCleared: [] })
  })

  it('does not load medic data for staff while the launch kill switch is active', async () => {
    const { prisma, service, readableAccess } = createService()
    readableAccess.mockResolvedValue({
      membership: { role: MembershipRole.PLAYER },
      activeTeamAccess: [{ role: TeamRole.HEAD_COACH }],
    })
    prisma.teamAccess.findMany.mockImplementation(rosterOnly([access('p1')]))
    prisma.teamMember.findMany.mockResolvedValue([])

    await service.getRosterOperations('club-1', 'team-1', 'coach')

    expect(prisma.injuryReport.findMany).not.toHaveBeenCalled()
  })

  it('rejects medic writes before querying member data while the launch kill switch is active', async () => {
    const { prisma, service } = createService()

    await expect(
      service.createInjuryReport('club-1', 'team-1', 'coach', {
        userId: 'p1',
        title: 'Private health detail',
        status: 'OUT',
      }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(prisma.injuryReport.create).not.toHaveBeenCalled()
    await expect(
      service.updateInjuryReport('club-1', 'team-1', 'injury-1', 'coach', { title: 'Private' }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(prisma.injuryReport.findFirst).not.toHaveBeenCalled()
    expect(prisma.injuryReport.update).not.toHaveBeenCalled()
  })

  // ── Kader adversarial fixes ──────────────────────────────────────────────
  it('L5: a player loaned out to another team is marked and not counted in the source squad', async () => {
    const { prisma, service } = createService()
    prisma.team.findMany.mockResolvedValue([{ id: 'team-2', name: 'Herren 2', displayName: 'Herren 2' }])
    prisma.teamAccess.findMany.mockImplementation(
      rosterOnly(
        [access('p1'), access('p-loaned')],
        [
          {
            teamId: 'team-2',
            userId: 'p-loaned',
            loanedFromTeamId: 'team-1',
            loanEndDate: new Date('2099-06-30T00:00:00.000Z'),
          },
        ],
      ),
    )
    prisma.teamMember.findMany.mockResolvedValue([])

    const snapshot = await service.getRosterOperations('club-1', 'team-1', 'coach-1')

    expect(snapshot.squadCount).toBe(1)
    const loaned = snapshot.squad.find((m) => m.userId === 'p-loaned')
    expect(loaned?.loanedOutToTeamName).toBe('Herren 2')
    expect(loaned?.loanedOutUntil).toBe('2099-06-30T00:00:00.000Z')
    expect(snapshot.squad.find((m) => m.userId === 'p1')?.loanedOutToTeamName).toBeNull()
  })

  it('H2: tells the viewer per member whether a private chat is allowed, with the reason', async () => {
    const { prisma, service, readableAccess } = createService()
    readableAccess.mockResolvedValue({
      membership: { role: MembershipRole.PLAYER },
      activeTeamAccess: [{ role: TeamRole.PLAYER }],
    })
    prisma.teamAccess.findMany.mockImplementation(
      rosterOnly([access('viewer'), access('adult'), access('minor'), access('unverified'), access('blocker')]),
    )
    prisma.teamMember.findMany.mockResolvedValue([])
    prisma.user.findMany.mockResolvedValue([
      { id: 'viewer', dateOfBirth: new Date('1995-01-01'), managedById: null },
      { id: 'adult', dateOfBirth: new Date('1990-01-01'), managedById: null },
      { id: 'minor', dateOfBirth: new Date('2014-01-01'), managedById: null },
      { id: 'unverified', dateOfBirth: null, managedById: null },
      { id: 'blocker', dateOfBirth: new Date('1990-01-01'), managedById: null },
    ])
    prisma.userBlock.findMany.mockResolvedValue([{ blockerUserId: 'blocker', blockedUserId: 'viewer' }])

    const snapshot = await service.getRosterOperations('club-1', 'team-1', 'viewer')
    const dm = new Map(snapshot.squad.map((m) => [m.userId, [m.canMessage, m.messageBlockedReason]]))

    expect(dm.get('adult')).toEqual([true, null])
    // Adult → someone else's under-16: refused by the DM API, so not offered.
    expect(dm.get('minor')).toEqual([false, 'NEEDS_GUARDIAN_LINK'])
    expect(dm.get('unverified')).toEqual([false, 'AGE_UNVERIFIED'])
    expect(dm.get('blocker')).toEqual([false, 'BLOCKED'])
    expect(dm.get('viewer')).toEqual([false, 'SELF'])
  })

  it('H2: a linked guardian may message their own child', async () => {
    const { prisma, service } = createService()
    prisma.teamAccess.findMany.mockImplementation(rosterOnly([access('child')]))
    prisma.teamMember.findMany.mockResolvedValue([])
    prisma.user.findMany.mockResolvedValue([
      { id: 'parent', dateOfBirth: new Date('1985-01-01'), managedById: null },
      { id: 'child', dateOfBirth: new Date('2014-01-01'), managedById: null },
    ])
    prisma.guardianRelationship.findMany.mockResolvedValue([{ parentUserId: 'parent', playerUserId: 'child' }])

    const snapshot = await service.getRosterOperations('club-1', 'team-1', 'parent')

    expect(snapshot.squad[0]).toMatchObject({ canMessage: true, messageBlockedReason: null })
  })

  describe('M5: Sperre in youth teams', () => {
    const suspended = {
      userId: 'p1',
      operationalStatus: 'ACTIVE',
      absence: 'SUSPENDED',
      absenceUntil: new Date('2099-01-01T00:00:00.000Z'),
    }

    it('masks a suspension as UNAVAILABLE for a non-manager in a youth team', async () => {
      const { prisma, service, readableAccess } = createService()
      prisma.team.findFirst.mockResolvedValue({
        id: 'team-1',
        name: 'D-Jugend',
        displayName: 'D-Jugend',
        squadTarget: 14,
        ageGroup: 'U13',
      })
      readableAccess.mockResolvedValue({
        membership: { role: MembershipRole.PARENT },
        activeTeamAccess: [{ role: TeamRole.PARENT }],
      })
      prisma.teamAccess.findMany.mockImplementation(rosterOnly([access('p1')]))
      prisma.teamMember.findMany.mockResolvedValue([suspended])

      const snapshot = await service.getRosterOperations('club-1', 'team-1', 'parent-1')

      expect(snapshot.squad[0].absence).toBe('UNAVAILABLE')
    })

    it('shows the suspension to the coach and to the player themself', async () => {
      const coach = createService()
      coach.prisma.team.findFirst.mockResolvedValue({
        id: 'team-1',
        name: 'D-Jugend',
        displayName: 'D-Jugend',
        squadTarget: 14,
        ageGroup: 'U13',
      })
      coach.readableAccess.mockResolvedValue({
        membership: { role: MembershipRole.PLAYER },
        activeTeamAccess: [{ role: TeamRole.HEAD_COACH }],
      })
      coach.prisma.teamAccess.findMany.mockImplementation(rosterOnly([access('p1')]))
      coach.prisma.teamMember.findMany.mockResolvedValue([suspended])
      expect((await coach.service.getRosterOperations('club-1', 'team-1', 'coach-1')).squad[0].absence).toBe(
        'SUSPENDED',
      )

      const self = createService()
      self.prisma.team.findFirst.mockResolvedValue({
        id: 'team-1',
        name: 'D-Jugend',
        displayName: 'D-Jugend',
        squadTarget: 14,
        ageGroup: 'U13',
      })
      self.readableAccess.mockResolvedValue({
        membership: { role: MembershipRole.PLAYER },
        activeTeamAccess: [{ role: TeamRole.PLAYER }],
      })
      self.prisma.teamAccess.findMany.mockImplementation(rosterOnly([access('p1')]))
      self.prisma.teamMember.findMany.mockResolvedValue([suspended])
      expect((await self.service.getRosterOperations('club-1', 'team-1', 'p1')).squad[0].absence).toBe(
        'SUSPENDED',
      )
    })

    it('keeps "Gesperrt" visible to teammates in an adult team', async () => {
      const { prisma, service, readableAccess } = createService()
      readableAccess.mockResolvedValue({
        membership: { role: MembershipRole.PLAYER },
        activeTeamAccess: [{ role: TeamRole.PLAYER }],
      })
      prisma.teamAccess.findMany.mockImplementation(rosterOnly([access('p1')]))
      prisma.teamMember.findMany.mockResolvedValue([suspended])

      const snapshot = await service.getRosterOperations('club-1', 'team-1', 'mate-1')
      expect(snapshot.squad[0].absence).toBe('SUSPENDED')
    })
  })

  it("M2: marks a guardian's child's duty as CHILD for the parent", async () => {
    const { prisma, service } = createService()
    prisma.teamAccess.findMany.mockImplementation(rosterOnly([access('child')]))
    prisma.teamMember.findMany.mockResolvedValue([])
    prisma.guardianRelationship.findMany.mockImplementation(async ({ where }: any) =>
      where.parentUserId === 'parent' && where.playerUserId?.not === null ? [{ playerUserId: 'child' }] : [],
    )
    prisma.teamDutyAssignment.findMany.mockResolvedValue([
      {
        id: 'duty-1',
        clubId: 'club-1',
        teamId: 'team-1',
        assignedUserId: 'child',
        createdById: 'coach-1',
        kind: 'JERSEY_CLEANUP',
        status: 'PENDING',
        dueDate: null,
        notes: null,
        completedAt: null,
        createdAt: new Date('2026-09-20T10:00:00.000Z'),
        updatedAt: new Date('2026-09-20T10:00:00.000Z'),
        assignedUser: null,
      },
    ])

    const snapshot = await service.getRosterOperations('club-1', 'team-1', 'parent')
    expect(snapshot.kit.pending[0].viewerRelation).toBe('CHILD')
  })
})

describe('TeamsService.updateTeamDuty (Aufgaben)', () => {
  function createService(existing: Record<string, unknown> | null) {
    let written: Record<string, unknown> = {}
    const prisma = {
      teamAccess: { findFirst: jest.fn().mockResolvedValue({ id: 'access-1' }) },
      guardianRelationship: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      teamDutyAssignment: {
        findFirst: jest.fn().mockResolvedValue(existing),
        // M3: compare-and-set on the status the check was made against.
        updateMany: jest.fn().mockImplementation(async ({ data }: any) => {
          written = data
          return { count: 1 }
        }),
        findUnique: jest.fn().mockImplementation(async () => ({
          id: 'duty-1',
          clubId: 'club-1',
          teamId: 'team-1',
          assignedUserId: 'player-1',
          createdById: 'coach-1',
          kind: 'JERSEY_CLEANUP',
          dueDate: null,
          notes: null,
          createdAt: new Date('2026-09-20T10:00:00.000Z'),
          updatedAt: new Date('2026-09-21T10:00:00.000Z'),
          assignedUser: null,
          ...written,
        })),
      },
    }
    const service = new TeamsService(prisma as never)
    const assertManageAccess = jest
      .spyOn(service as any, 'assertManageAccess')
      .mockRejectedValue(new TeamAccessDeniedError('You do not manage this team.'))
    return { prisma, service, assertManageAccess }
  }

  const duty = {
    id: 'duty-1',
    clubId: 'club-1',
    teamId: 'team-1',
    assignedUserId: 'player-1',
    status: 'PENDING',
  }

  it('lets the assignee mark their own duty done', async () => {
    const { prisma, service, assertManageAccess } = createService(duty)

    const result = await service.updateTeamDuty('club-1', 'team-1', 'duty-1', 'player-1', {
      status: 'COMPLETED',
    })

    expect(assertManageAccess).not.toHaveBeenCalled()
    expect(result.status).toBe('COMPLETED')
    expect(prisma.teamDutyAssignment.updateMany).toHaveBeenCalled()
  })

  it("does not let the assignee overwrite a coach's skip", async () => {
    const { prisma, service } = createService({ ...duty, status: 'SKIPPED' })

    await expect(
      service.updateTeamDuty('club-1', 'team-1', 'duty-1', 'player-1', { status: 'COMPLETED' }),
    ).rejects.toBeInstanceOf(TeamAccessDeniedError)
    expect(prisma.teamDutyAssignment.updateMany).not.toHaveBeenCalled()
  })

  it('requires the assignee to still be on the team', async () => {
    const { prisma, service } = createService(duty)
    prisma.teamAccess.findFirst.mockResolvedValue(null)

    await expect(
      service.updateTeamDuty('club-1', 'team-1', 'duty-1', 'player-1', { status: 'COMPLETED' }),
    ).rejects.toBeInstanceOf(TeamAccessDeniedError)
  })

  it('keeps skipping coach-only, even for the assignee', async () => {
    const { prisma, service } = createService(duty)

    await expect(
      service.updateTeamDuty('club-1', 'team-1', 'duty-1', 'player-1', { status: 'SKIPPED' }),
    ).rejects.toBeInstanceOf(TeamAccessDeniedError)
    expect(prisma.teamDutyAssignment.updateMany).not.toHaveBeenCalled()
  })

  it("blocks completing someone else's duty without manage access", async () => {
    const { prisma, service } = createService(duty)

    await expect(
      service.updateTeamDuty('club-1', 'team-1', 'duty-1', 'player-2', { status: 'COMPLETED' }),
    ).rejects.toBeInstanceOf(TeamAccessDeniedError)
    expect(prisma.teamDutyAssignment.updateMany).not.toHaveBeenCalled()
  })

  it('answers a missing duty with the access check first', async () => {
    const { service } = createService(null)

    await expect(
      service.updateTeamDuty('club-1', 'team-1', 'nope', 'player-1', { status: 'COMPLETED' }),
    ).rejects.toBeInstanceOf(TeamAccessDeniedError)
  })

  // ── Kader adversarial fixes ──────────────────────────────────────────────
  it('M3: completes only while still PENDING and answers a lost race with 409', async () => {
    const { prisma, service } = createService(duty)
    prisma.teamDutyAssignment.updateMany.mockResolvedValue({ count: 0 })

    await expect(
      service.updateTeamDuty('club-1', 'team-1', 'duty-1', 'player-1', { status: 'COMPLETED' }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(prisma.teamDutyAssignment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'duty-1', clubId: 'club-1', teamId: 'team-1', status: 'PENDING' },
      }),
    )
  })

  it("M2: the child's linked guardian may tick off the child's duty", async () => {
    const { prisma, service, assertManageAccess } = createService(duty)
    prisma.guardianRelationship.findMany.mockResolvedValue([{ playerUserId: 'player-1' }])

    const result = await service.updateTeamDuty('club-1', 'team-1', 'duty-1', 'parent-1', {
      status: 'COMPLETED',
    })

    expect(assertManageAccess).not.toHaveBeenCalled()
    expect(result.status).toBe('COMPLETED')
    // The child (the assignee) must still be on the team, not the parent.
    expect(prisma.teamAccess.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'player-1' }) }),
    )
  })

  it('M2: a guardian still cannot skip the duty', async () => {
    const { prisma, service } = createService(duty)
    prisma.guardianRelationship.findMany.mockResolvedValue([{ playerUserId: 'player-1' }])

    await expect(
      service.updateTeamDuty('club-1', 'team-1', 'duty-1', 'parent-1', { status: 'SKIPPED' }),
    ).rejects.toBeInstanceOf(TeamAccessDeniedError)
  })
})

describe('TeamsService.rotateTeamDuty (M2)', () => {
  function entry(userId: string, extra: Record<string, unknown> = {}) {
    return { userId, loanedFromTeamId: null, user: { id: userId, name: userId, avatarUrl: null }, ...extra }
  }

  function createService(options: {
    entries: unknown[]
    members?: unknown[]
    loans?: unknown[]
    push?: { sendToUser: jest.Mock }
  }) {
    const prisma = {
      teamAccess: {
        findMany: jest.fn().mockImplementation(async ({ where }: any) =>
          where?.loanedFromTeamId ? (options.loans ?? []) : options.entries,
        ),
      },
      teamMember: { findMany: jest.fn().mockResolvedValue(options.members ?? []) },
      teamDutyAssignment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(async ({ data }: any) => ({
          id: 'duty-new',
          createdAt: new Date('2026-09-24T10:00:00.000Z'),
          updatedAt: new Date('2026-09-24T10:00:00.000Z'),
          completedAt: null,
          assignedUser: null,
          ...data,
        })),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ preferredLanguage: 'tr' }) },
      team: { findUnique: jest.fn().mockResolvedValue({ name: 'Herren 1', displayName: 'Herren 1' }) },
    }
    const service = new TeamsService(prisma as never, undefined, undefined, options.push as never)
    jest.spyOn(service as any, 'assertManageAccess').mockResolvedValue({})
    return { prisma, service }
  }

  it('skips inactive, away, suspended, loaned-in and loaned-out players', async () => {
    const { service } = createService({
      entries: [
        entry('a-inactive'),
        entry('b-away'),
        entry('c-suspended'),
        entry('d-loaned-in', { loanedFromTeamId: 'team-9' }),
        entry('e-loaned-out'),
        entry('f-available'),
      ],
      members: [
        { userId: 'a-inactive', operationalStatus: 'INACTIVE', absence: 'NONE', absenceUntil: null },
        { userId: 'b-away', operationalStatus: 'ACTIVE', absence: 'AWAY', absenceUntil: new Date('2099-01-01') },
        { userId: 'c-suspended', operationalStatus: 'ACTIVE', absence: 'SUSPENDED', absenceUntil: null },
      ],
      loans: [{ teamId: 'team-2', userId: 'e-loaned-out', loanedFromTeamId: 'team-1', loanEndDate: null }],
    })

    const duty = await service.rotateTeamDuty('club-1', 'team-1', 'coach-1', { kind: 'JERSEY_CLEANUP' })
    expect(duty.assignedUserId).toBe('f-available')
  })

  it('refuses when nobody is available', async () => {
    const { service } = createService({
      entries: [entry('b-away')],
      members: [
        { userId: 'b-away', operationalStatus: 'ACTIVE', absence: 'AWAY', absenceUntil: new Date('2099-01-01') },
      ],
    })
    await expect(
      service.rotateTeamDuty('club-1', 'team-1', 'coach-1', { kind: 'JERSEY_CLEANUP' }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('pushes the assignee in their language, with a deep link to Aufgaben', async () => {
    const push = { sendToUser: jest.fn().mockResolvedValue(undefined) }
    const { service } = createService({ entries: [entry('f-available')], push })

    await service.rotateTeamDuty('club-1', 'team-1', 'coach-1', { kind: 'LOCKER_ROOM' })

    expect(push.sendToUser).toHaveBeenCalledWith(
      'f-available',
      'Herren 1',
      'Sıra sende: Soyunma odası görevi.',
      { kind: 'TEAM_DUTY_ASSIGNED', clubId: 'club-1', teamId: 'team-1', dutyId: 'duty-new' },
      { clubId: 'club-1', category: 'events' },
    )
  })

  it('keeps the rota when the push fails', async () => {
    const push = { sendToUser: jest.fn().mockRejectedValue(new Error('expo down')) }
    const { service } = createService({ entries: [entry('f-available')], push })

    await expect(
      service.rotateTeamDuty('club-1', 'team-1', 'coach-1', { kind: 'JERSEY_CLEANUP' }),
    ).resolves.toMatchObject({ assignedUserId: 'f-available' })
  })
})
