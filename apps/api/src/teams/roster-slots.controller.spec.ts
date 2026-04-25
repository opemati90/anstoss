import { Test } from '@nestjs/testing'
import { RosterSlotsController } from './roster-slots.controller'
import { RosterSlotsService } from './roster-slots.service'
import { ClerkAuthGuard } from '../auth/clerk.guard'

describe('RosterSlotsController', () => {
  let controller: RosterSlotsController
  const service = { bulkCreate: jest.fn(), list: jest.fn(), claim: jest.fn() }

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      controllers: [RosterSlotsController],
      providers: [{ provide: RosterSlotsService, useValue: service }],
    })
      .overrideGuard(ClerkAuthGuard).useValue({ canActivate: () => true })
      .compile()
    controller = mod.get(RosterSlotsController)
    jest.clearAllMocks()
  })

  it('POST roster-slots calls bulkCreate with parsed body', async () => {
    service.bulkCreate.mockResolvedValue([{ id: 's1' }])
    const res = await controller.bulkCreate('c1', 't1', { id: 'u1' } as any, {
      slots: [{ fullName: 'X' }],
    })
    expect(service.bulkCreate).toHaveBeenCalledWith('c1', 't1', 'u1', { slots: [{ fullName: 'X' }] })
    expect(res).toHaveLength(1)
  })

  it('GET roster-slots calls list', async () => {
    service.list.mockResolvedValue([])
    await controller.list('c1', 't1', { id: 'u1' } as any)
    expect(service.list).toHaveBeenCalledWith('c1', 't1', 'u1')
  })

  it('POST claim calls claim', async () => {
    service.claim.mockResolvedValue({ id: 's1', claimedByUserId: 'u1' })
    const res = await controller.claim('c1', 't1', 's1', { id: 'u1' } as any)
    expect(service.claim).toHaveBeenCalledWith('t1', 's1', 'u1')
    expect(res.claimedByUserId).toBe('u1')
  })
})
