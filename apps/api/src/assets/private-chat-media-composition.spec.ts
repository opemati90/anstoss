import { ChannelsService } from '../channels/channels.service'
import { PrivateChatMediaFacade } from './private-chat-media-facade'
import { PrivateUploadReads } from './private-upload-reads'

describe('private chat media composed channel read', () => {
  it('checks real channel authorization before allowing a storage signature and denies revoked membership', async () => {
    const uploadId = '2f36b5df-8364-4e6f-a082-0f0272819351'
    const key = `private-chat/v2/${uploadId}`
    let active = true
    const tx: any = {
      $executeRaw: jest.fn().mockResolvedValue(1), $queryRaw: jest.fn().mockResolvedValue([]),
      user: { findUnique: jest.fn().mockResolvedValue({ deletedAt: null, dateOfBirth: new Date('1990-01-01') }),
        findFirst: jest.fn().mockResolvedValue({ deletedAt: null, dateOfBirth: new Date('1990-01-01') }) },
      team: { findFirst: jest.fn().mockResolvedValue({ id: 'team' }) },
      channel: { findUnique: jest.fn().mockResolvedValue({ id: 'channel', clubId: 'club', teamId: 'team', kind: 'TEAM', visibility: 'MEMBERS' }) },
      membership: { findUnique: jest.fn(async () => active ? { role: 'PLAYER' } : null) },
      teamAccess: { findMany: jest.fn().mockResolvedValue([{ teamId: 'team', role: 'PLAYER', phase: 'FULL', status: 'ACTIVE' }]) },
      channelMember: { findUnique: jest.fn().mockResolvedValue(null) },
      message: { findFirst: jest.fn().mockResolvedValue({ id: 'message', senderId: 'sender', deletedAt: null,
        messageType: 'IMAGE', attachmentUrl: `https://private-media.anstoss.invalid/${key}` }) },
      privateMediaUpload: { findFirst: jest.fn().mockResolvedValue({ id: uploadId, clubId: 'club', ownerId: 'sender',
        targetType: 'CHANNEL', targetId: 'channel', objectKey: key, messageId: 'message', state: 'ATTACHED',
        operationId: null, uploadId: 'session', cancelRequestedAt: null, contentType: 'image/png', expectedBytes: 10 }) },
    }
    const prisma = { $transaction: async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx) }
    const signer = { signGet: jest.fn().mockResolvedValue('https://signed.invalid/capability') }
    const channels = new ChannelsService({} as never, {} as never, { emit: jest.fn() } as never)
    const reader = new PrivateUploadReads(prisma as never, signer as never)
    const facade = new PrivateChatMediaFacade(channels, {} as never, {} as never, reader, {} as never)
    const actor = { userId: 'user', clubId: 'club' }
    const target = { kind: 'CHANNEL' as const, teamId: 'team', channelId: 'channel' }
    await expect(facade.read(actor, target, 'message')).resolves.toEqual({ url: 'https://signed.invalid/capability' })
    expect(signer.signGet).toHaveBeenCalledTimes(1)
    active = false
    await expect(facade.read(actor, target, 'message')).rejects.toThrow()
    expect(signer.signGet).toHaveBeenCalledTimes(1)
  })
})
