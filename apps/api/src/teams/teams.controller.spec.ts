import { Test } from '@nestjs/testing'
import { TeamsController } from './teams.controller'
import { TeamLookupController } from './teams.controller'
import { TeamsService } from './teams.service'

describe('TeamsController join-code endpoints', () => {
  let controller: TeamsController
  const service = {
    regenerateJoinCode: jest.fn(),
    getTeamByCode: jest.fn(),
  }

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TeamsController],
      providers: [{ provide: TeamsService, useValue: service }],
    })
      .overrideGuard(require('../auth/clerk.guard').ClerkAuthGuard)
      .useValue({ canActivate: () => true })
      .compile()
    controller = moduleRef.get(TeamsController)
    jest.clearAllMocks()
  })

  it('POST /clubs/:clubId/teams/:teamId/join-code calls regenerateJoinCode', async () => {
    service.regenerateJoinCode.mockResolvedValue({ id: 't1', joinCode: 'ABCDE' })
    const res = await controller.regenerateJoinCode('c1', 't1', { id: 'u1' } as any)
    expect(service.regenerateJoinCode).toHaveBeenCalledWith('c1', 't1', 'u1')
    expect(res.joinCode).toBe('ABCDE')
  })
})

describe('TeamLookupController join-code endpoints', () => {
  let lookupController: TeamLookupController
  const service = {
    regenerateJoinCode: jest.fn(),
    getTeamByCode: jest.fn(),
  }

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TeamLookupController],
      providers: [{ provide: TeamsService, useValue: service }],
    })
      .overrideGuard(require('../auth/clerk.guard').ClerkAuthGuard)
      .useValue({ canActivate: () => true })
      .compile()
    lookupController = moduleRef.get(TeamLookupController)
    jest.clearAllMocks()
  })

  it('GET /teams/by-code/:code calls getTeamByCode', async () => {
    service.getTeamByCode.mockResolvedValue({ team: { id: 't1' }, club: { id: 'c1' } })
    const res = await lookupController.getTeamByCode('ABCDE')
    expect(service.getTeamByCode).toHaveBeenCalledWith('ABCDE')
    expect(res.team.id).toBe('t1')
  })
})
