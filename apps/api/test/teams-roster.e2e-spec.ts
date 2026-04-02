import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { TeamsController } from '../src/teams/teams.controller'
import { TeamsService } from '../src/teams/teams.service'
import { ClerkAuthGuard } from '../src/auth/clerk.guard'
import { PrismaService } from '../src/prisma/prisma.service'

describe('Teams & Roster (e2e)', () => {
  let app: INestApplication
  let baseUrl: string

  const mockTeamGroups = [
    { id: 'group-1', name: 'Herren', clubId: 'club-1', teams: [] },
    { id: 'group-2', name: 'Jugend', clubId: 'club-1', teams: [] },
  ]

  const mockRosterOps = {
    members: [
      { userId: 'user-2', name: 'Max Spieler', role: 'PLAYER', status: 'ACTIVE' },
    ],
    injuries: [],
    duties: [],
  }

  const mockAggregateRoster = {
    teams: [
      {
        teamId: 'team-1',
        displayName: '1. Herren',
        memberCount: 18,
      },
    ],
    totalMembers: 18,
  }

  const mockClubStats = {
    memberCount: 45,
    teamCount: 3,
    upcomingEventCount: 7,
    overallRsvpRate: 72,
  }

  const teamsService = {
    listTeamGroups: jest.fn().mockResolvedValue(mockTeamGroups),
    getRosterOperations: jest.fn().mockResolvedValue(mockRosterOps),
    getAggregateRoster: jest.fn().mockResolvedValue(mockAggregateRoster),
    getClubStats: jest.fn().mockResolvedValue(mockClubStats),
  }

  // Stub guard that always allows AND injects req.user
  const authGuard = {
    canActivate: (ctx: any) => {
      const req = ctx.switchToHttp().getRequest()
      req.user = { id: 'user-1' }
      return true
    },
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TeamsController],
      providers: [
        { provide: TeamsService, useValue: teamsService },
        { provide: PrismaService, useValue: {} },
      ],
    })
      .overrideGuard(ClerkAuthGuard)
      .useValue(authGuard)
      .compile()

    app = moduleRef.createNestApplication()
    await app.listen(0)

    const address = app.getHttpServer().address()
    if (!address || typeof address === 'string') {
      throw new Error('Failed to resolve e2e server address')
    }
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('GET /clubs/:clubId/team-groups — returns team groups', async () => {
    const res = await fetch(`${baseUrl}/clubs/club-1/team-groups`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(2)
    expect(body[0].name).toBe('Herren')
    expect(teamsService.listTeamGroups).toHaveBeenCalledWith('club-1', 'user-1')
  })

  it('GET /clubs/:clubId/teams/:teamId/roster-ops — returns roster operations', async () => {
    const res = await fetch(`${baseUrl}/clubs/club-1/teams/team-1/roster-ops`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.members).toBeDefined()
    expect(body.members[0].role).toBe('PLAYER')
    expect(teamsService.getRosterOperations).toHaveBeenCalledWith(
      'club-1',
      'team-1',
      'user-1',
    )
  })

  it('GET /clubs/:clubId/roster-aggregate — returns aggregate roster', async () => {
    const res = await fetch(`${baseUrl}/clubs/club-1/roster-aggregate`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.totalMembers).toBe(18)
    expect(body.teams).toHaveLength(1)
    expect(teamsService.getAggregateRoster).toHaveBeenCalledWith('club-1', 'user-1')
  })

  it('GET /clubs/:clubId/stats — returns club stats', async () => {
    const res = await fetch(`${baseUrl}/clubs/club-1/stats`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.memberCount).toBe(45)
    expect(body.teamCount).toBe(3)
    expect(body.overallRsvpRate).toBe(72)
    expect(teamsService.getClubStats).toHaveBeenCalledWith('club-1', 'user-1')
  })
})
