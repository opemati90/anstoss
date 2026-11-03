import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common'
import { PrivateUploadReads } from './private-upload-reads'

describe('lifecycle-bound private message reads', () => {
  const key = 'private-chat/v2/6ecfefdc-8656-42f4-a6b8-7d3f691c9bd0'
  const reference = `https://private-media.anstoss.invalid/${key}`
  const scope = { userId: 'reader', clubId: 'club', messageId: 'message' }
  let tx: any
  let upload: any
  let message: any
  let authorize: jest.Mock
  let storage: { signGet: jest.Mock }
  let ledger: { snapshot: jest.Mock }
  let reads: PrivateUploadReads

  beforeEach(() => {
    message = { id: 'message', senderId: 'sender', attachmentUrl: reference,
      deletedAt: null, messageType: 'IMAGE' }
    upload = { id: 'upload', ownerId: 'sender', clubId: 'club', messageId: 'message',
      state: 'ATTACHED', operationId: null, cancelRequestedAt: null, uploadId: 'session',
      targetType: 'DM', targetId: 'conversation', objectKey: key, contentType: 'image/png',
      expectedBytes: 42, expiresAt: new Date(0) }
    tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      user: { findUnique: jest.fn().mockResolvedValue({ deletedAt: null }) },
      message: { findFirst: jest.fn(async () => message) },
      directMessage: { findFirst: jest.fn(async () => message) },
      privateMediaUpload: { findFirst: jest.fn().mockResolvedValue({ id: 'upload' }) },
    }
    storage = { signGet: jest.fn().mockResolvedValue('https://private-storage.invalid/signed-read') }
    ledger = { snapshot: jest.fn(async () => upload) }
    authorize = jest.fn().mockResolvedValue({ userId: 'reader', clubId: 'club', targetType: 'DM', targetId: 'conversation' })
    reads = new PrivateUploadReads({ $transaction: async (fn: any) => fn(tx) } as never, storage, ledger as never)
  })

  it.each(['DM', 'CHANNEL'])('authorizes and binds the live %s before signing, ignoring reservation expiry', async (targetType) => {
    upload.targetType = targetType
    authorize.mockResolvedValue({ userId: 'reader', clubId: 'club', targetType, targetId: 'conversation', teamId: 'team' })
    await expect(reads.signForMessage(scope, authorize)).resolves.toEqual({ url: 'https://private-storage.invalid/signed-read' })
    expect(authorize).toHaveBeenCalledWith(tx)
    expect(authorize.mock.invocationCallOrder[0]).toBeLessThan(tx.$executeRaw.mock.invocationCallOrder[0])
    expect(tx.$executeRaw.mock.calls[0]).toContain(`${targetType === 'CHANNEL' ? 'chat-message' : 'dm-message'}:message`)
    const lookup = targetType === 'CHANNEL' ? tx.message.findFirst : tx.directMessage.findFirst
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(lookup.mock.invocationCallOrder[0])
    expect(lookup.mock.invocationCallOrder[0]).toBeLessThan(ledger.snapshot.mock.invocationCallOrder[0])
    expect(ledger.snapshot.mock.invocationCallOrder[0]).toBeLessThan(storage.signGet.mock.invocationCallOrder[0])
    expect(tx.privateMediaUpload.findFirst).toHaveBeenCalledWith({ where: {
      clubId: 'club', ownerId: 'sender', messageId: 'message', targetId: 'conversation', targetType, objectKey: key,
    }, select: { id: true } })
    expect(ledger.snapshot).toHaveBeenCalledWith(tx, { id: 'upload', clubId: 'club', ownerId: 'sender' })
    expect(storage.signGet).toHaveBeenCalledWith(key, 300, expect.any(Date))
    expect(lookup).toHaveBeenCalledWith(expect.objectContaining({ where: targetType === 'CHANNEL'
      ? { id: 'message', clubId: 'club', channelId: 'conversation', teamId: 'team' }
      : { id: 'message', conversationId: 'conversation', conversation: { clubId: 'club' } } }))
  })

  it('never touches message/upload data after denied authorization', async () => {
    authorize.mockRejectedValue(new ForbiddenException('denied'))
    await expect(reads.signForMessage(scope, authorize)).rejects.toThrow(ForbiddenException)
    expect(tx.$executeRaw).not.toHaveBeenCalled()
    expect(tx.privateMediaUpload.findFirst).not.toHaveBeenCalled()
    expect(storage.signGet).not.toHaveBeenCalled()
  })

  it.each([{ userId: 'other' }, { clubId: 'other' }, { targetId: '' },
    { targetType: 'OTHER' }, { targetType: 'CHANNEL' }])('rejects an invalid authorized target %j', async (change) => {
    authorize.mockResolvedValue({ userId: 'reader', clubId: 'club', targetType: 'DM', targetId: 'conversation', ...change })
    await expect(reads.signForMessage(scope, authorize)).rejects.toThrow(ForbiddenException)
    expect(storage.signGet).not.toHaveBeenCalled()
  })

  it.each([null, { deletedAt: new Date() }])('rejects a deleted/unavailable requester %j', async (user) => {
    tx.user.findUnique.mockResolvedValue(user)
    await expect(reads.signForMessage(scope, authorize)).rejects.toThrow(ForbiddenException)
    expect(storage.signGet).not.toHaveBeenCalled()
  })

  it.each([null, { deletedAt: new Date() }, { senderId: null }, { attachmentUrl: null }, { messageType: 'TEXT' }])(
    'does not sign a missing or unavailable message %j', async (change) => {
      message = change === null ? null : { ...message, ...change }
      await expect(reads.signForMessage(scope, authorize)).resolves.toEqual({ url: null })
      expect(tx.privateMediaUpload.findFirst).not.toHaveBeenCalled()
      expect(storage.signGet).not.toHaveBeenCalled()
    },
  )

  it.each([
    `https://public.invalid/${key}`, `${reference}?query=injected`, `${reference}#fragment`,
    reference.replace('/private-chat/', '/%70rivate-chat/'), reference.replace('/v2/', '/x/../v2/'),
    reference.replace('https://', 'https://reader@'), reference.replace('https://', 'http://'),
    reference.replace('.invalid/', '.invalid:443/'), `${reference}/`, `${reference}\n`, `${reference}\u2028`,
    'https://private-media.anstoss.invalid/chat/club/team/image/private-v1-file',
  ])('refuses noncanonical/private-legacy reference %s', async (attachmentUrl) => {
    message.attachmentUrl = attachmentUrl
    await expect(reads.signForMessage(scope, authorize)).resolves.toEqual({ url: null })
    expect(ledger.snapshot).not.toHaveBeenCalled()
    expect(storage.signGet).not.toHaveBeenCalled()
  })

  it('does not sign without an exact upload binding', async () => {
    tx.privateMediaUpload.findFirst.mockResolvedValue(null)
    await expect(reads.signForMessage(scope, authorize)).resolves.toEqual({ url: null })
    expect(ledger.snapshot).not.toHaveBeenCalled()
    expect(storage.signGet).not.toHaveBeenCalled()
  })

  it.each([null, { state: 'READY' }, { state: 'REMOVING' }, { state: 'REMOVED' },
    { operationId: 'pending' }, { cancelRequestedAt: new Date() }, { uploadId: null },
    { messageId: 'other' }, { targetId: 'other' }, { targetType: 'CHANNEL' }, { objectKey: `${key}-other` },
    { contentType: 'application/pdf' }, { expectedBytes: 11 * 1024 * 1024 }, { expectedBytes: 0 },
  ])('rejects a missing, retired, mismatched or unverified upload %j', async (change) => {
    upload = change === null ? null : { ...upload, ...change }
    await expect(reads.signForMessage(scope, authorize)).resolves.toEqual({ url: null })
    expect(storage.signGet).not.toHaveBeenCalled()
  })

  it('fails closed when a binding query fails', async () => {
    tx.privateMediaUpload.findFirst.mockRejectedValue(new Error('database unavailable'))
    await expect(reads.signForMessage(scope, authorize)).rejects.toThrow('database unavailable')
    expect(storage.signGet).not.toHaveBeenCalled()
  })

  it('hides signer errors and does not fall back to another storage provider', async () => {
    storage.signGet.mockRejectedValue(new Error('secret capability and credentials'))
    await expect(reads.signForMessage(scope, authorize)).rejects.toThrow(ServiceUnavailableException)
    await expect(reads.signForMessage(scope, authorize)).rejects.toThrow('Private media signing is temporarily unavailable')
  })

  it('rejects a capability that expired while signing', async () => {
    const start = 1_800_000_000_000
    const now = jest.spyOn(Date, 'now').mockReturnValue(start)
    storage.signGet.mockImplementation(async () => { now.mockReturnValue(start + 300_000); return 'expired' })
    try {
      await expect(reads.signForMessage(scope, authorize)).rejects.toThrow(ServiceUnavailableException)
      expect(storage.signGet).toHaveBeenCalledWith(key, 300, new Date(start))
    } finally { now.mockRestore() }
  })
})
