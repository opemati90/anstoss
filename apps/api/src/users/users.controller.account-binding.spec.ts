import { ForbiddenException } from '@nestjs/common'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'
import { R2Provider } from '../assets/r2.provider'
import { MemberExportService } from './member-export'

describe('privacy account binding', () => {
  const service = { deleteAccount: jest.fn(), exportUserData: jest.fn() }
  const controller = new UsersController(service as unknown as UsersService, {} as R2Provider, {} as MemberExportService)
  beforeEach(() => jest.clearAllMocks())

  it('rejects export and deletion if the session account differs from the confirmed account', async () => {
    await expect(controller.deleteMyAccountBound({ id: 'account-b' }, 'account-a')).rejects.toBeInstanceOf(ForbiddenException)
    await expect(controller.exportMyDataBound({ id: 'account-b' }, 'account-a')).rejects.toBeInstanceOf(ForbiddenException)
    expect(service.deleteAccount).not.toHaveBeenCalled()
    expect(service.exportUserData).not.toHaveBeenCalled()
  })

  it('allows matching accounts and rejects missing account binding', async () => {
    await controller.exportMyDataBound({ id: 'account-a' }, 'account-a')
    expect(service.exportUserData).toHaveBeenCalledWith('account-a')
    await expect(controller.deleteMyAccountBound({ id: 'account-a' }, undefined as unknown as string)).rejects.toBeInstanceOf(ForbiddenException)
  })
})
