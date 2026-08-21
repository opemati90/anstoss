import { Test } from '@nestjs/testing'
import { TeamsController } from './teams.controller'
import { TeamLookupController } from './teams.controller'
import { TeamsService } from './teams.service'

describe('TeamsController join-code endpoints', () => {
  let controller: TeamsController
  const service = {
    regenerateJoinCode: jest.fn(),
    getTeamByCode: jest.fn(),
    createPlayerLoan: jest.fn(),
    recallPlayerLoan: jest.fn(),
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
    service.regenerateJoinCode.mockResolvedValue({ id: 't1', joinCode: 'ABCDE23456' })
    const res = await controller.regenerateJoinCode('c1', 't1', { id: 'u1' } as any)
    expect(service.regenerateJoinCode).toHaveBeenCalledWith('c1', 't1', 'u1')
    expect(res.joinCode).toBe('ABCDE23456')
  })

  it('creates and recalls player loans through authenticated club routes', async () => {
    const input = { playerUserId: 'p1', targetTeamId: 't2', loanEndDate: '2027-01-01' }
    service.createPlayerLoan.mockResolvedValue({ id: 'loan-1' })
    service.recallPlayerLoan.mockResolvedValue({ id: 'loan-1', status: 'REVOKED' })

    await controller.createPlayerLoan('c1', 't1', { id: 'u1' }, input)
    await controller.recallPlayerLoan('c1', 't1', 'loan-1', { id: 'u1' })

    expect(service.createPlayerLoan).toHaveBeenCalledWith('c1', 't1', 'u1', input)
    expect(service.recallPlayerLoan).toHaveBeenCalledWith('c1', 't1', 'loan-1', 'u1')
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
    const res = await lookupController.getTeamByCode('ABCDE23456')
    expect(service.getTeamByCode).toHaveBeenCalledWith('ABCDE23456')
    expect(res.team.id).toBe('t1')
  })
})
