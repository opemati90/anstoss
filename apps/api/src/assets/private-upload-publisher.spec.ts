import { PrivateUploadPublisher } from './private-upload-publisher'

describe('atomic private upload publication', () => {
  const scope = { id: 'upload', clubId: 'club', ownerId: 'owner' }
  let tx: any
  let ledger: any
  let publish: PrivateUploadPublisher
  let authorize: jest.Mock
  let upload: any
  beforeEach(() => {
    upload = { state: 'READY', uploadId: 'provider', operationId: null, cancelRequestedAt: null,
      expiresAt: new Date(Date.now() + 60_000), targetType: 'DM', targetId: 'conversation',
      contentType: 'image/png', expectedBytes: 42, objectKey: 'private-chat/v2/id' }
    tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      user: { findUnique: jest.fn().mockResolvedValue({ deletedAt: null }) },
      privateMediaUpload: { findFirst: jest.fn(async () => ({ messageId: upload.messageId ?? null })) },
      directMessage: { create: jest.fn(async ({ data }) => data), findFirst: jest.fn() },
      message: { create: jest.fn(async ({ data }) => data), findFirst: jest.fn() },
      conversation: { update: jest.fn().mockResolvedValue({}) },
    }
    ledger = { snapshot: jest.fn(async () => upload), attach: jest.fn().mockResolvedValue(true) }
    publish = new PrivateUploadPublisher({ $transaction: async (fn: any) => fn(tx) } as never, ledger)
    authorize = jest.fn().mockResolvedValue({ userId: 'owner', clubId: 'club', targetId: 'conversation', targetType: 'DM' })
  })

  it.each(['DM', 'CHANNEL'])('returns the existing %s message on a matching retry without delivery mutations', async (targetType) => {
    Object.assign(upload, { state: 'ATTACHED', messageId: 'saved', expiresAt: new Date(0), targetType })
    authorize.mockResolvedValue({ userId: 'owner', clubId: 'club', targetId: 'conversation', targetType, teamId: 'team' })
    const saved = { id: 'saved', messageType: 'IMAGE', content: 'hello',
      attachmentUrl: 'https://private-media.anstoss.invalid/private-chat/v2/id',
      attachmentMeta: { sizeBytes: 42, mimeType: 'image/png' } }
    tx.directMessage.findFirst.mockResolvedValue(saved)
    tx.message.findFirst.mockResolvedValue(saved)
    await expect(publish.publish(scope, { messageType: 'IMAGE', content: ' hello ' }, authorize))
      .resolves.toEqual({ ...saved, replayed: true })
    expect(tx.message.create).not.toHaveBeenCalled()
    expect(tx.directMessage.create).not.toHaveBeenCalled()
    expect(ledger.attach).not.toHaveBeenCalled()
    expect(tx.conversation.update).not.toHaveBeenCalled()
    expect(tx.$executeRaw.mock.calls[1]).toContain(`${targetType === 'DM' ? 'dm-message' : 'chat-message'}:saved`)
  })

  it.each([null, { content: 'changed' }, { messageType: 'FILE' }, { attachmentMeta: { sizeBytes: 43 } }, { attachmentUrl: 'other' }])('rejects changed/unavailable replay data: %j', async (change) => {
    Object.assign(upload, { state: 'ATTACHED', messageId: 'saved' })
    const saved = { id: 'saved', messageType: 'IMAGE', content: '',
      attachmentUrl: 'https://private-media.anstoss.invalid/private-chat/v2/id', attachmentMeta: { sizeBytes: 42, mimeType: 'image/png' } }
    tx.directMessage.findFirst.mockResolvedValue(change === null ? null : { ...saved, ...change })
    await expect(publish.publish(scope, { messageType: 'IMAGE' }, authorize)).rejects.toThrow('already published')
    expect(tx.directMessage.create).not.toHaveBeenCalled()
    expect(ledger.attach).not.toHaveBeenCalled()
  })

  it('rejects a binding changed between the pre-read and locked snapshot', async () => {
    Object.assign(upload, { state: 'ATTACHED', messageId: 'saved' })
    tx.privateMediaUpload.findFirst.mockResolvedValue({ messageId: 'different' })
    await expect(publish.publish(scope, { messageType: 'IMAGE' }, authorize)).rejects.toThrow('not ready')
    expect(tx.directMessage.findFirst).not.toHaveBeenCalled()
  })

  it('authorizes before accessing the upload and binds before updating the inbox', async () => {
    const result = await publish.publish(scope, { messageType: 'IMAGE' }, authorize)
    expect(authorize).toHaveBeenCalledWith(tx)
    expect(authorize.mock.invocationCallOrder[0]).toBeLessThan(ledger.snapshot.mock.invocationCallOrder[0])
    expect(ledger.attach).toHaveBeenCalledWith(tx, scope, result.id)
    expect(ledger.attach.mock.invocationCallOrder[0]).toBeLessThan(tx.conversation.update.mock.invocationCallOrder[0])
    expect(result.attachmentUrl).toBe('https://private-media.anstoss.invalid/private-chat/v2/id')
  })

  it('throws inside the transaction when binding fails after insertion', async () => {
    ledger.attach.mockResolvedValue(false)
    await expect(publish.publish(scope, { messageType: 'IMAGE' }, authorize)).rejects.toThrow('could not be attached')
    expect(tx.directMessage.create).toHaveBeenCalledTimes(1)
    expect(tx.conversation.update).not.toHaveBeenCalled()
  })

  it('never inserts when authorization fails', async () => {
    authorize.mockRejectedValue(new Error('denied'))
    await expect(publish.publish(scope, { messageType: 'IMAGE' }, authorize)).rejects.toThrow('denied')
    expect(ledger.snapshot).not.toHaveBeenCalled()
    expect(tx.directMessage.create).not.toHaveBeenCalled()
  })

  it.each([
    { state: 'REMOVING' }, { cancelRequestedAt: new Date() }, { expiresAt: new Date(0) },
    { targetId: 'other' }, { targetType: 'CHANNEL' }, { contentType: 'application/pdf' },
    { expectedBytes: 11 * 1024 * 1024 }, { uploadId: null }, { operationId: 'pending' },
  ])('rejects an unusable upload: %j', async (change) => {
    Object.assign(upload, change)
    await expect(publish.publish(scope, { messageType: 'IMAGE' }, authorize)).rejects.toThrow('not ready')
    expect(tx.directMessage.create).not.toHaveBeenCalled()
  })

  it('rejects an authorization result for another identity', async () => {
    authorize.mockResolvedValue({ userId: 'other', clubId: 'club', targetId: 'conversation', targetType: 'DM' })
    await expect(publish.publish(scope, { messageType: 'IMAGE' }, authorize)).rejects.toThrow('scope')
    expect(ledger.snapshot).not.toHaveBeenCalled()
  })

  it('uses the authorized team/channel rather than user-provided routing fields', async () => {
    upload.targetType = 'CHANNEL'; upload.targetId = 'channel'
    authorize.mockResolvedValue({ userId: 'owner', clubId: 'club', targetId: 'channel', targetType: 'CHANNEL', teamId: 'team' })
    await publish.publish(scope, { messageType: 'IMAGE' }, authorize)
    expect(tx.message.create).toHaveBeenCalledWith({ data: expect.objectContaining({ clubId: 'club', channelId: 'channel', teamId: 'team' }) })
    expect(tx.directMessage.create).not.toHaveBeenCalled()
  })

  it('rejects publishing a new club-wide reservation under a different team anchor', async () => {
    Object.assign(upload, { targetType: 'CHANNEL', targetId: 'channel', reserveRequestId: 'request', reservedTeamId: 'team-a' })
    authorize.mockResolvedValue({ userId: 'owner', clubId: 'club', targetId: 'channel', targetType: 'CHANNEL', teamId: 'team-b' })
    await expect(publish.publish(scope, { messageType: 'IMAGE' }, authorize)).rejects.toThrow('not ready')
    expect(tx.message.create).not.toHaveBeenCalled()
  })

  it('rejects deleted users even if authorization mistakenly succeeds', async () => {
    tx.user.findUnique.mockResolvedValue({ deletedAt: new Date() })
    await expect(publish.publish(scope, { messageType: 'IMAGE' }, authorize)).rejects.toThrow('Account unavailable')
    expect(ledger.snapshot).not.toHaveBeenCalled()
  })

  it.each([
    { messageType: 'TEXT' }, { messageType: 'IMAGE', content: 'x'.repeat(1001) },
    { messageType: 'IMAGE', attachmentMeta: { eventId: 'injected' } },
    { messageType: 'IMAGE', attachmentUrl: 'https://untrusted.invalid/file' },
    { messageType: 'IMAGE', attachmentMeta: { fileName: 'bad\nname' } },
  ])('rejects malformed publication before authorization: %j', async (input) => {
    await expect(publish.publish(scope, input as never, authorize)).rejects.toThrow('Invalid attachment message')
    expect(authorize).not.toHaveBeenCalled()
    expect(ledger.snapshot).not.toHaveBeenCalled()
  })

  it.each([{ mimeType: 'application/pdf' }, { sizeBytes: 100 }])('rejects metadata that contradicts the upload: %j', async (attachmentMeta) => {
    await expect(publish.publish(scope, { messageType: 'IMAGE', attachmentMeta }, authorize)).rejects.toThrow('metadata does not match')
    expect(tx.directMessage.create).not.toHaveBeenCalled()
  })

  it('stores verified metadata and normalized caption', async () => {
    const message = await publish.publish(scope, { messageType: 'IMAGE', content: '  hello  ', attachmentMeta: { fileName: 'photo.png' } }, authorize)
    expect(message.content).toBe('hello')
    expect(message.attachmentMeta).toEqual({ fileName: 'photo.png', mimeType: 'image/png', sizeBytes: 42 })
  })

  it.each(['DM', 'CHANNEL'])('binds a %s reply only to a message in the authorized destination', async (targetType) => {
    upload.targetType = targetType
    authorize.mockResolvedValue({ userId: 'owner', clubId: 'club', targetId: 'conversation', targetType, teamId: 'team' })
    const model = targetType === 'DM' ? tx.directMessage : tx.message
    model.findFirst.mockResolvedValue({ id: 'parent' })
    const result = await publish.publish(scope, { messageType: 'IMAGE', replyToId: 'parent' }, authorize)
    expect(result.replyToId).toBe('parent')
    expect(model.findFirst).toHaveBeenCalledWith({
      where: targetType === 'DM'
        ? { id: 'parent', conversationId: 'conversation', conversation: { clubId: 'club' } }
        : { id: 'parent', clubId: 'club', channelId: 'conversation' },
      select: { id: true },
    })
    expect(model.create).toHaveBeenCalledWith({ data: expect.objectContaining({ replyToId: 'parent' }) })
  })

  it('allows a club-wide channel reply to a message anchored to another team', async () => {
    Object.assign(upload, { targetType: 'CHANNEL', targetId: 'club-channel' })
    authorize.mockResolvedValue({ userId: 'owner', clubId: 'club', targetId: 'club-channel', targetType: 'CHANNEL', teamId: 'current-team' })
    tx.message.findFirst.mockImplementation(async ({ where }: any) =>
      where.clubId === 'club' && where.channelId === 'club-channel' && !('teamId' in where)
        ? { id: 'parent' } : null)
    const result = await publish.publish(scope, { messageType: 'IMAGE', replyToId: 'parent' }, authorize)
    expect(result.replyToId).toBe('parent')
  })

  it.each(['DM', 'CHANNEL'])('rejects %s replies to missing or foreign messages', async (targetType) => {
    upload.targetType = targetType
    authorize.mockResolvedValue({ userId: 'owner', clubId: 'club', targetId: 'conversation', targetType, teamId: 'team' })
    await expect(publish.publish(scope, { messageType: 'IMAGE', replyToId: 'foreign' }, authorize))
      .rejects.toThrow('Invalid reply target')
    expect(tx.message.create).not.toHaveBeenCalled()
    expect(tx.directMessage.create).not.toHaveBeenCalled()
    expect(ledger.attach).not.toHaveBeenCalled()
  })

  it('rejects a replay that changes the reply target', async () => {
    Object.assign(upload, { state: 'ATTACHED', messageId: 'saved' })
    tx.directMessage.findFirst.mockResolvedValue({ id: 'saved', messageType: 'IMAGE', content: '', replyToId: 'original',
      attachmentUrl: 'https://private-media.anstoss.invalid/private-chat/v2/id', attachmentMeta: { sizeBytes: 42, mimeType: 'image/png' } })
    await expect(publish.publish(scope, { messageType: 'IMAGE', replyToId: 'different' }, authorize))
      .rejects.toThrow('already published')
    expect(tx.directMessage.create).not.toHaveBeenCalled()
  })
})
