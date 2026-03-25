import { BadRequestException } from '@nestjs/common'
import {
  ParentalConsentStatus,
  TeamAccessPhase,
  TeamAccessStatus,
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
