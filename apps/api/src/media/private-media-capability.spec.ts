import { HttpException } from '@nestjs/common'
import { requirePrivateMediaCapability } from './private-media-capability'
import { MediaController } from './media.controller'
import { DmController } from '../dm/dm.controller'
import { isOwnedPrivateV1Key } from './private-v1-owner'

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

  it('binds newly presigned channel uploads to the authenticated sender', async () => {
    const teams = { assertReadableAccess: jest.fn().mockResolvedValue({ team: { clubId: 'club' } }) }
    const r2 = { enabled: true, presignPut: jest.fn().mockResolvedValue({ uploadUrl: 'https://upload.invalid', publicUrl: 'https://private.invalid' }) }
    const tx = { $executeRaw: jest.fn(), $queryRaw: jest.fn().mockResolvedValue([{ now: new Date() }]),
      user: { findUnique: jest.fn().mockResolvedValue({ deletedAt: null }) },
      accountMediaDeletion: { count: jest.fn().mockResolvedValue(0), create: jest.fn() } }
    const prisma = { $transaction: jest.fn(async (callback) => callback(tx)) }
    const controller = new MediaController(teams as never, r2 as never, {} as never, prisma as never)
    const result = await controller.presign({ id: 'user' }, 'team', {
      kind: 'image', contentType: 'image/png', sizeBytes: 1, filename: 'photo.png',
    }, '1')
    expect(isOwnedPrivateV1Key(result.objectKey, { targetType: 'chat', clubId: 'club', targetId: 'team', ownerId: 'user', kind: 'image' })).toBe(true)
    expect(isOwnedPrivateV1Key(result.objectKey, { targetType: 'chat', clubId: 'club', targetId: 'team', ownerId: 'other', kind: 'image' })).toBe(false)
    expect(r2.presignPut).toHaveBeenCalledWith(result.objectKey, 'image/png', 1, 300, expect.any(Date))
    expect(tx.accountMediaDeletion.create.mock.invocationCallOrder[0]).toBeLessThan(r2.presignPut.mock.invocationCallOrder[0])
  })

  it.each([null, {}, { kind: 'image', contentType: 'image/png', sizeBytes: -1 },
    { kind: '__proto__', contentType: 'image/png', sizeBytes: 1 }])('rejects malformed upload input %j before accessing a team', async (body) => {
    const teams = { assertReadableAccess: jest.fn() }
    const controller = new MediaController(teams as never, {} as never, {} as never, {} as never)
    await expect(controller.presign({ id: 'user' }, 'team', body, '1')).rejects.toMatchObject({ status: 400 })
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
