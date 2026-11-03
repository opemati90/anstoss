import { UsersService } from './users.service'
import { newOwnedPrivateV1Key } from '../media/private-v1-owner'
import { AccountMediaDeletionWorker } from '../assets/account-media-deletion.worker'

describe('account erasure profile-media ownership', () => {
  it.each(['CHANNEL', 'DM'] as const)('holds reported owned %s media until evidence is released', async (type) => {
    const targetId = type === 'CHANNEL' ? 'team' : 'conversation'
    const key = newOwnedPrivateV1Key({ targetType: type === 'CHANNEL' ? 'chat' : 'dm', clubId: 'club',
      targetId, ownerId: 'sender', kind: 'image' }, 'photo.jpg')
    const attachmentUrl = `https://private-media.anstoss.invalid/${key}`
    const row = { id: 'm1', attachmentUrl, clubId: 'club', teamId: 'team', channelId: 'channel',
      conversationId: 'conversation', conversation: { clubId: 'club' }, messageType: 'IMAGE' }
    const client = { message: { findMany: jest.fn().mockResolvedValue(type === 'CHANNEL' ? [row] : []) },
      directMessage: { findMany: jest.fn().mockResolvedValue(type === 'DM' ? [row] : []) },
      complianceRecord: { findMany: jest.fn().mockResolvedValue([]) } }
    const storage = { objectKeyFromUrl: (value: string) => value.replace('https://private-media.anstoss.invalid/', ''),
      deleteObjects: jest.fn().mockResolvedValue(undefined) }
    const service = new UsersService(client as never, {} as never, {} as never, {} as never, {} as never, storage as never)
    const keys = await (service as any).collectDeletionObjectKeys({ userId: 'sender', avatarUrl: null,
      freeAgentProfileId: null, privateUploads: [] }, client)
    expect(keys).toEqual([key])
    let evidenceExists = true
    const reportLookup = jest.fn(async ({ where }: any) => {
      expect(where.evidencePurgedAt).toBeNull()
      const matches = where.OR.some((part: any) => attachmentUrl.endsWith(part.evidenceAttachmentUrl.endsWith))
      return evidenceExists && matches ? { id: 'report' } : null
    })
    const empty = { findFirst: jest.fn().mockResolvedValue(null) }
    const queue = { findMany: jest.fn().mockResolvedValue([{ objectKey: keys[0], attempts: 0, availableAt: new Date(0), uploadState: null }]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }) }
    queue.findUnique.mockImplementation(async () => ({ attempts: 1, uploadState: null,
      availableAt: queue.updateMany.mock.calls[queue.updateMany.mock.calls.length - 1][0].data.availableAt }))
    const db: any = { $executeRaw: jest.fn(), accountMediaDeletion: queue,
      messageReport: type === 'CHANNEL' ? { findFirst: reportLookup } : empty,
      directMessageReport: type === 'DM' ? { findFirst: reportLookup } : empty,
      message: empty, directMessage: empty, user: empty, freeAgentMedia: empty }
    db.$transaction = async (callback: (tx: unknown) => Promise<unknown>) => callback(db)
    const worker = new AccountMediaDeletionWorker(db, storage as never)
    await worker.runCycle()
    expect(storage.deleteObjects).not.toHaveBeenCalled()
    expect(queue.deleteMany).not.toHaveBeenCalled()
    evidenceExists = false
    await worker.runCycle()
    expect(storage.deleteObjects).toHaveBeenCalledWith([key])
    expect(queue.deleteMany).toHaveBeenCalledTimes(1)
  })

  it('queues only sender-bound new chat media and rejects another sender’s key', async () => {
    const scope = { targetType: 'chat' as const, clubId: 'club', targetId: 'team', ownerId: 'sender', kind: 'image' as const }
    const ownKey = newOwnedPrivateV1Key(scope, 'photo.jpg')
    const foreignKey = newOwnedPrivateV1Key({ ...scope, ownerId: 'other' }, 'photo.jpg')
    const message = { id: 'm1', clubId: 'club', teamId: 'team', channelId: 'channel', messageType: 'IMAGE',
      attachmentUrl: `https://private-media.anstoss.invalid/${ownKey}` }
    const client = { message: { findMany: jest.fn().mockResolvedValue([message]) },
      directMessage: { findMany: jest.fn().mockResolvedValue([]) }, complianceRecord: { findMany: jest.fn().mockResolvedValue([]) } }
    const r2 = { objectKeyFromUrl: jest.fn((url: string) => url.split('https://private-media.anstoss.invalid/')[1]) }
    const service = new UsersService(client as never, {} as never, {} as never, {} as never, {} as never, r2 as never)
    const request = { userId: 'sender', avatarUrl: null, freeAgentProfileId: null, privateUploads: [] }
    await expect((service as any).collectDeletionObjectKeys(request, client)).resolves.toEqual([ownKey])
    expect(client.message.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { senderId: 'sender', attachmentUrl: { not: null } },
    }))
    expect(client.directMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { senderId: 'sender', attachmentUrl: { not: null } },
    }))
    message.attachmentUrl = `https://private-media.anstoss.invalid/${foreignKey}`
    await expect((service as any).collectDeletionObjectKeys(request, client)).rejects.toThrow('support review')
  })

  it('does not queue another user’s avatar, profile media or thumbnail', async () => {
    const client = {
      message: { findMany: jest.fn().mockResolvedValue([]) },
      directMessage: { findMany: jest.fn().mockResolvedValue([]) },
      complianceRecord: { findMany: jest.fn().mockResolvedValue([]) },
      freeAgentMedia: { findMany: jest.fn().mockResolvedValue([
        { url: 'https://assets.invalid/users/sender/free-agent/video/clip.mp4', thumbnailUrl: 'https://assets.invalid/users/victim/avatar/photo.png' },
        { url: 'https://assets.invalid/users/victim/free-agent/photo/victim.png', thumbnailUrl: 'https://assets.invalid/users/sender/free-agent/photo/cover.jpg' },
      ]) },
    }
    const r2 = {
      objectKeyFromUrl: jest.fn((url: string) => url.startsWith('https://assets.invalid/')
        ? url.slice('https://assets.invalid/'.length) : null),
    }
    const service = new UsersService(client as never, {} as never, {} as never, {} as never, {} as never, r2 as never)
    const keys = await (service as any).collectDeletionObjectKeys({
      userId: 'sender', avatarUrl: 'https://assets.invalid/users/victim/avatar/photo.png', freeAgentProfileId: 'profile',
    }, client)
    expect(keys).toEqual([
      'users/sender/free-agent/video/clip.mp4',
      'users/sender/free-agent/photo/cover.jpg',
    ])
  })
})
