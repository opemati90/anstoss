import { Test } from '@nestjs/testing'
import { ManagedSubProfilesController } from './managed-sub-profiles.controller'
import { ManagedSubProfilesService } from './managed-sub-profiles.service'
import { ClerkAuthGuard } from '../auth/clerk.guard'

describe('ManagedSubProfilesController', () => {
  let controller: ManagedSubProfilesController
  const service = { create: jest.fn() }

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      controllers: [ManagedSubProfilesController],
      providers: [{ provide: ManagedSubProfilesService, useValue: service }],
    })
      .overrideGuard(ClerkAuthGuard).useValue({ canActivate: () => true })
      .compile()
    controller = mod.get(ManagedSubProfilesController)
    jest.clearAllMocks()
  })

  it('POST calls create with parsed body and parent id', async () => {
    service.create.mockResolvedValue({ user: { id: 'kid' }, slot: { id: 's1' } })
    const body = {
      fullName: 'Mara',
      dateOfBirth: '2017-05-04T00:00:00.000Z',
      teamId: 't1',
      rosterSlotId: 's1',
    }
    const res = await controller.create({ id: 'parent' } as any, body)
    expect(service.create).toHaveBeenCalledWith('parent', body)
    expect(res.user.id).toBe('kid')
  })
})
