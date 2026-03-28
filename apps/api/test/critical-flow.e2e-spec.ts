import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { ClubsController } from '../src/clubs/clubs.controller'
import { ClubsService } from '../src/clubs/clubs.service'
import { EventsController } from '../src/events/events.controller'
import { EventsService } from '../src/events/events.service'
import { InvitesController } from '../src/invites/invites.controller'
import { InvitesService } from '../src/invites/invites.service'
import { UsersController } from '../src/users/users.controller'
import { UsersService } from '../src/users/users.service'
import { R2Provider } from '../src/assets/r2.provider'
import { ClerkAuthGuard } from '../src/auth/clerk.guard'
import { AgeGateGuard } from '../src/auth/age-gate.guard'
import { RolesGuard } from '../src/auth/roles.guard'
import { PrismaService } from '../src/prisma/prisma.service'

/**
 * Critical flow E2E: signup → create club → invite player → create match → view schedule.
 *
 * Guards are stubbed so we can test HTTP routing and controller logic directly.
 * A global middleware injects req.user so @CurrentUser() works.
 */
describe('Critical Flow (e2e)', () => {
  let app: INestApplication
  let baseUrl: string

  const mockUser = { id: 'user-1', name: 'Test Coach', email: 'coach@test.com' }

  const mockClub = {
    id: 'club-1',
    name: 'FC Teststadt',
    slug: 'fc-teststadt',
    primaryColor: '#1A1A18',
    badgeUrl: null,
  }

  const mockTeam = {
    id: 'team-1',
    clubId: 'club-1',
    name: 'herren-1',
    displayName: '1. Herren',
    ageGroup: 'Senior',
  }

  const futureDate = new Date(Date.now() + 86400000).toISOString()

  const mockEvent = {
    id: 'event-1',
    clubId: 'club-1',
    teamId: 'team-1',
    type: 'MATCH',
    title: 'Kreisliga A — vs. SV Beispielheim',
    date: futureDate,
    location: 'Sportanlage Teststadt',
  }

  const mockInvite = {
    id: 'invite-1',
    code: 'ABC123',
    clubId: 'club-1',
    teamId: 'team-1',
    kind: 'MEMBER_INVITE',
    role: 'PLAYER',
    status: 'PENDING',
  }

  const clubsService = {
    createClubWithTeam: jest.fn().mockResolvedValue({ club: mockClub, team: mockTeam }),
    getStats: jest.fn().mockResolvedValue({
      memberCount: 5,
      teamCount: 1,
      upcomingEventCount: 1,
      overallRsvpRate: 80,
    }),
  }

  const eventsService = {
    create: jest.fn().mockResolvedValue(mockEvent),
    listUpcoming: jest.fn().mockResolvedValue([mockEvent]),
  }

  const invitesService = {
    create: jest.fn().mockResolvedValue(mockInvite),
  }

  const usersService = {
    getMe: jest.fn().mockResolvedValue({
      ...mockUser,
      memberships: [{ clubId: 'club-1', role: 'OWNER' }],
    }),
    updateProfile: jest.fn().mockResolvedValue(mockUser),
  }

  // Stub guard that always allows AND injects req.user
  const authGuard = {
    canActivate: (ctx: any) => {
      const req = ctx.switchToHttp().getRequest()
      req.user = { id: 'user-1' }
      return true
    },
  }
  const alwaysAllowGuard = { canActivate: () => true }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ClubsController, EventsController, InvitesController, UsersController],
      providers: [
        { provide: ClubsService, useValue: clubsService },
        { provide: EventsService, useValue: eventsService },
        { provide: InvitesService, useValue: invitesService },
        { provide: UsersService, useValue: usersService },
        { provide: R2Provider, useValue: { enabled: false, presignPut: jest.fn() } },
        { provide: PrismaService, useValue: {} },
      ],
    })
      .overrideGuard(ClerkAuthGuard)
      .useValue(authGuard)
      .overrideGuard(AgeGateGuard)
      .useValue(alwaysAllowGuard)
      .overrideGuard(RolesGuard)
      .useValue(alwaysAllowGuard)
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

  it('GET /me — returns user profile after signup', async () => {
    const res = await fetch(`${baseUrl}/me`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.id).toBe('user-1')
    expect(body.name).toBe('Test Coach')
    expect(usersService.getMe).toHaveBeenCalled()
  })

  it('POST /clubs/setup — creates a club', async () => {
    const res = await fetch(`${baseUrl}/clubs/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        club: { name: 'FC Teststadt', primaryColor: '#1A1A18' },
        team: { name: '1. Herren' },
      }),
    })
    expect(res.status).toBe(201)

    const body = await res.json()
    expect(body.club.name).toBe('FC Teststadt')
    expect(body.team.name).toBe('herren-1')
    expect(clubsService.createClubWithTeam).toHaveBeenCalled()
  })

  it('POST /clubs/:clubId/invites — invites a player', async () => {
    const res = await fetch(`${baseUrl}/clubs/club-1/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teamId: 'team-1',
        role: 'PLAYER',
        deliveryChannel: 'LINK',
      }),
    })
    expect(res.status).toBe(201)

    const body = await res.json()
    expect(body.code).toBe('ABC123')
    expect(invitesService.create).toHaveBeenCalled()
  })

  it('POST /clubs/:clubId/events — creates a match', async () => {
    const res = await fetch(`${baseUrl}/clubs/club-1/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'MATCH',
        title: 'Kreisliga A — vs. SV Beispielheim',
        date: futureDate,
        teamId: 'team-1',
        location: 'Sportanlage Teststadt',
      }),
    })
    expect(res.status).toBe(201)

    const body = await res.json()
    expect(body.type).toBe('MATCH')
    expect(eventsService.create).toHaveBeenCalled()
  })

  it('GET /clubs/:clubId/events?teamId=X — views schedule', async () => {
    const res = await fetch(`${baseUrl}/clubs/club-1/events?teamId=team-1`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body[0].type).toBe('MATCH')
    expect(eventsService.listUpcoming).toHaveBeenCalled()
  })
})
