import { HttpException } from '@nestjs/common'
import { requirePrivateMediaCapability } from './private-media-capability'
import { MediaController } from './media.controller'
import { DmController } from '../dm/dm.controller'

describe('private media capability gate', () => {
  it.each([undefined, '', '0', '2', 'true'])('rejects unsupported capability %s with an upgrade response', (capability) => {
    try {
      requirePrivateMediaCapability(capability)
      throw new Error('expected upgrade response')
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException)
      expect((error as HttpException).getStatus()).toBe(426)
      expect((error as HttpException).getResponse()).toMatchObject({ code: 'UPGRADE_REQUIRED' })
    }
  })

  it('accepts capability 1', () => expect(() => requirePrivateMediaCapability('1')).not.toThrow())

  it('does not mint an unusable upload for old channel clients', async () => {
    const teams = { assertReadableAccess: jest.fn() }
    const controller = new MediaController(teams as never, {} as never, {} as never, {} as never)
    await expect(controller.presign({ id: 'user' }, 'team', {
      kind: 'image', contentType: 'image/png', sizeBytes: 1,
    })).rejects.toMatchObject({ status: 426 })
    expect(teams.assertReadableAccess).not.toHaveBeenCalled()
  })

  it('only forwards compatible DM uploads to the authorized service', async () => {
    const service = { presignMedia: jest.fn().mockResolvedValue({ enabled: true }) }
    const controller = new DmController(service as never)
    const body = { kind: 'image', contentType: 'image/png', sizeBytes: 1 }
    await expect(controller.presignMedia({ id: 'user' }, 'club', 'conversation', body))
      .rejects.toMatchObject({ status: 426 })
    expect(service.presignMedia).not.toHaveBeenCalled()
    await controller.presignMedia({ id: 'user' }, 'club', 'conversation', body, '1')
    expect(service.presignMedia).toHaveBeenCalledWith('user', 'club', 'conversation', body)
  })
})
