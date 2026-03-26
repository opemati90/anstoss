import { BadRequestException, NotFoundException } from '@nestjs/common'
import {
  ParentalConsentStatus,
  TeamAccessPhase,
  TeamAccessStatus,
  TeamRole,
} from '@anstoss/shared'
import { TeamsService } from './teams.service'

describe('TeamsService family access', () => {
  function createService() {
    const prisma = {
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

    const result = await service.listTeamFamilyAccess(
      'club-1',
      'team-1',
      'coach-1',
    )

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
      service.updateGuardianRelationship(
        'club-1',
        'team-1',
        'rel-1',
        'coach-1',
        { playerUserId: 'player-404' },
      ),
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

// ── Sprint 2 Tests ───────────────────────────────────────────────

describe('TeamsService.decideTrialAccess', () => {
  function createService() {
    const prisma = {
      teamAccess: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    }
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
      team: { findUnique: jest.fn() },
      teamAccess: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    }
    const service = new TeamsService(prisma as never)
    jest.spyOn(service as any, 'assertManageAccess').mockResolvedValue({})
    return { prisma, service }
  }

  const input = {
    playerUserId: 'player-1',
    targetTeamId: 'team-2',
  }

  it('rejects when target team not in same club', async () => {
    const { prisma, service } = createService()
    prisma.team.findUnique.mockResolvedValue({ id: 'team-2', clubId: 'other-club' })

    await expect(
      service.createPlayerLoan('club-1', 'team-1', 'coach-1', input),
    ).rejects.toThrow(BadRequestException)
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

  it('rejects when player has no active access on source team', async () => {
    const { prisma, service } = createService()
    prisma.team.findUnique.mockResolvedValue({ id: 'team-2', clubId: 'club-1' })
    prisma.teamAccess.findFirst.mockResolvedValue(null)

    await expect(
      service.createPlayerLoan('club-1', 'team-1', 'coach-1', input),
    ).rejects.toThrow(BadRequestException)
  })

  it('rejects when player already has access on target team', async () => {
    const { prisma, service } = createService()
    prisma.team.findUnique.mockResolvedValue({ id: 'team-2', clubId: 'club-1' })
    prisma.teamAccess.findFirst
      .mockResolvedValueOnce({ id: 'source-access' }) // source access exists
      .mockResolvedValueOnce({ id: 'existing-target' }) // target access exists

    await expect(
      service.createPlayerLoan('club-1', 'team-1', 'coach-1', input),
    ).rejects.toThrow(BadRequestException)
  })

  it('creates loan with correct data on success', async () => {
    const { prisma, service } = createService()
    prisma.team.findUnique.mockResolvedValue({ id: 'team-2', clubId: 'club-1' })
    prisma.teamAccess.findFirst
      .mockResolvedValueOnce({ id: 'source-access' }) // source access
      .mockResolvedValueOnce(null) // no existing target access
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
    expect(result.id).toBe('loan-1')
  })
})

describe('TeamsService.recallPlayerLoan', () => {
  function createService() {
    const prisma = {
      teamAccess: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    }
    const service = new TeamsService(prisma as never)
    jest.spyOn(service as any, 'assertManageAccess').mockResolvedValue({})
    return { prisma, service }
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

    await expect(
      service.recallPlayerLoan('club-1', 'team-1', 'ta-1', 'coach-1'),
    ).rejects.toThrow(NotFoundException)
  })

  it('throws BadRequestException when already revoked', async () => {
    const { prisma, service } = createService()
    prisma.teamAccess.findUnique.mockResolvedValue({
      id: 'ta-1',
      clubId: 'club-1',
      loanedFromTeamId: 'team-1',
      status: TeamAccessStatus.REVOKED,
    })

    await expect(
      service.recallPlayerLoan('club-1', 'team-1', 'ta-1', 'coach-1'),
    ).rejects.toThrow(BadRequestException)
  })

  it('sets status to REVOKED on success', async () => {
    const { prisma, service } = createService()
    prisma.teamAccess.findUnique.mockResolvedValue({
      id: 'ta-1',
      clubId: 'club-1',
      loanedFromTeamId: 'team-1',
      status: TeamAccessStatus.ACTIVE,
    })
    prisma.teamAccess.update.mockResolvedValue({ id: 'ta-1' })

    await service.recallPlayerLoan('club-1', 'team-1', 'ta-1', 'coach-1')

    expect(prisma.teamAccess.update).toHaveBeenCalledWith({
      where: { id: 'ta-1' },
      data: { status: TeamAccessStatus.REVOKED },
    })
  })
})

describe('TeamsService.updateRosterEntry', () => {
  function createService() {
    const prisma = {
      teamMember: { upsert: jest.fn() },
    }
    const service = new TeamsService(prisma as never)
    jest.spyOn(service as any, 'assertManageAccess').mockResolvedValue({})
    return { prisma, service }
  }

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
      },
    })
  })
})

describe('TeamsService.getAggregateRoster', () => {
  function createService() {
    const prisma = {
      membership: { findUnique: jest.fn() },
      team: { findMany: jest.fn() },
    }
    const service = new TeamsService(prisma as never)
    jest
      .spyOn(service as any, 'assertClubManager')
      .mockResolvedValue({ role: 'OWNER' })
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
    jest
      .spyOn(service as any, 'assertClubManager')
      .mockResolvedValue({ role: 'OWNER' })
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
