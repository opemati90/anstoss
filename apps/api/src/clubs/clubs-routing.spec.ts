import type { INestApplication } from '@nestjs/common'
import { MODULE_METADATA } from '@nestjs/common/constants'
import { Test } from '@nestjs/testing'
import { ClubsModule } from './clubs.module'
import { ClubsService } from './clubs.service'
import { ClubsSearchService } from './clubs-search.service'
import { JoinRequestsService } from './join-requests.service'
import { PrismaService } from '../prisma/prisma.service'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { AgeGateGuard } from '../auth/age-gate.guard'
import { RolesGuard } from '../auth/roles.guard'

describe('Club HTTP route precedence', () => {
  let app: INestApplication
  let baseUrl: string
  const club = { id: 'club-qa', name: 'QA Club', slug: 'qa-club', teams: [] }
  const clubs = {
    findById: jest.fn().mockResolvedValue(null),
    findBySlug: jest.fn().mockResolvedValue(club),
  }
  const search = { search: jest.fn().mockResolvedValue({ results: [club], nextCursor: null }) }

  beforeAll(async () => {
    // Use production registration order, not a handpicked controller order
    // which would hide /clubs/:clubId swallowing /search and /lookup.
    const module = await Test.createTestingModule({
      controllers: Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, ClubsModule),
      providers: [
        { provide: ClubsService, useValue: clubs },
        { provide: ClubsSearchService, useValue: search },
        { provide: JoinRequestsService, useValue: {} },
        { provide: PrismaService, useValue: {} },
      ],
    })
      .overrideGuard(ClerkAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AgeGateGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile()
    app = module.createNestApplication({ logger: false })
    await app.listen(0, '127.0.0.1')
    baseUrl = await app.getUrl()
  })

  afterAll(async () => {
    await app?.close()
  })
  beforeEach(() => jest.clearAllMocks())

  it('dispatches search to the search controller, not club details', async () => {
    const response = await fetch(`${baseUrl}/clubs/search?q=QA&limit=20`)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(JSON.stringify({ results: [club], nextCursor: null }))
    expect(search.search).toHaveBeenCalledWith({ q: 'QA', limit: 20 })
    expect(clubs.findById).not.toHaveBeenCalled()
  })

  it('dispatches slug lookup to the join controller, not club details', async () => {
    const response = await fetch(`${baseUrl}/clubs/lookup?slug=qa-club`)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('"id":"club-qa"')
    expect(clubs.findBySlug).toHaveBeenCalledWith('qa-club')
    expect(clubs.findById).not.toHaveBeenCalled()
  })

  it('preserves the existing club-detail route', async () => {
    await fetch(`${baseUrl}/clubs/club-qa`)
    expect(clubs.findById).toHaveBeenCalledWith('club-qa')
    expect(search.search).not.toHaveBeenCalled()
    expect(clubs.findBySlug).not.toHaveBeenCalled()
  })
})
