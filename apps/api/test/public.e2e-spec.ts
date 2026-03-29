import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { PublicController } from '../src/public/public.controller'
import { PublicService } from '../src/public/public.service'

describe('PublicController (e2e)', () => {
  let app: INestApplication
  let baseUrl: string

  const publicService = {
    getPlatformInfo: jest.fn(() => ({
      name: 'Anstoss',
      tagline: 'White-label club operations for amateur football clubs.',
      websiteMode: 'platform-foundation',
    })),
    getInvite: jest.fn(async (code: string) => ({
      code,
      expiresAt: '2026-03-31T12:00:00.000Z',
      kind: 'MEMBER_INVITE',
      role: 'PLAYER',
      phase: 'FULL',
      status: 'PENDING',
      club: {
        id: 'club-1',
        name: 'FC Anstoss',
        slug: 'fc-anstoss',
        badgeUrl: null,
        primaryColor: '#2D7A3A',
      },
      team: {
        id: 'team-1',
        displayName: 'Herren 1',
        squadLabel: '1',
        leagueName: 'Kreisliga A',
        group: {
          id: 'group-1',
          displayName: 'Herren',
          type: 'SENIOR',
        },
      },
      installUrls: {
        ios: 'https://apps.apple.com/app/anstoss/id0000000000',
        android:
          'https://play.google.com/store/apps/details?id=app.anstoss.mobile',
      },
    })),
    getClubSummary: jest.fn(async (clubId: string) => ({
      clubId,
      headline: 'FC Anstoss im Überblick',
      competitions: [],
      upcomingFixtures: [],
      recentResults: [],
      updatedAt: '2026-03-24T12:00:00.000Z',
    })),
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PublicController],
      providers: [
        {
          provide: PublicService,
          useValue: publicService,
        },
      ],
    }).compile()

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

  it('returns public platform metadata', async () => {
    const response = await fetch(`${baseUrl}/public/platform`)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      name: 'Anstoss',
      tagline: 'White-label club operations for amateur football clubs.',
      websiteMode: 'platform-foundation',
    })
    expect(publicService.getPlatformInfo).toHaveBeenCalledTimes(1)
  })

  it('returns public invite details for a join handoff', async () => {
    const response = await fetch(`${baseUrl}/public/invites/ABC123`)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.code).toBe('ABC123')
    expect(payload.team.displayName).toBe('Herren 1')
    expect(payload.club.slug).toBe('fc-anstoss')
    expect(payload.recipientEmail).toBeUndefined()
    expect(payload.guardianEmail).toBeUndefined()
    expect(payload.childName).toBeUndefined()
    expect(publicService.getInvite).toHaveBeenCalledWith('ABC123')
  })

  it('returns the public club summary payload', async () => {
    const response = await fetch(`${baseUrl}/clubs/club-1/public/summary`)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.clubId).toBe('club-1')
    expect(payload.headline).toBe('FC Anstoss im Überblick')
    expect(publicService.getClubSummary).toHaveBeenCalledWith('club-1')
  })
})
