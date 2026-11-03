import { PrivateChatMediaFacade } from './private-chat-media-facade'

describe('private chat media internal authorization composition', () => {
  const actor = { userId: 'user', clubId: 'club' }
  const channel = { kind: 'CHANNEL' as const, teamId: 'team', channelId: 'channel' }
  const dm = { kind: 'DM' as const, conversationId: 'conversation' }
  const input = { requestId: '2f36b5df-8364-4e6f-a082-0f0272819351', messageType: 'IMAGE' as const, contentType: 'image/png', expectedBytes: 10 }
  let tx: any, channels: any, dms: any, coordinator: any, reads: any, publisher: any, facade: PrivateChatMediaFacade
  beforeEach(() => {
    tx = { transaction: true }
    channels = { authorizePrivateUpload: jest.fn().mockResolvedValue({ userId: 'user', clubId: 'club', targetType: 'CHANNEL', targetId: 'channel', teamId: 'team' }) }
    dms = {
      authorizePrivateUpload: jest.fn().mockResolvedValue({ userId: 'user', clubId: 'club', targetType: 'DM', targetId: 'conversation' }),
      authorizePrivateMediaRead: jest.fn().mockResolvedValue({ userId: 'user', clubId: 'club', targetType: 'DM', targetId: 'conversation' }),
    }
    coordinator = {
      reserve: jest.fn(async (_scope, _body, authorize) => authorize(tx)),
      status: jest.fn(async (_scope, authorize) => authorize(tx)),
      cancel: jest.fn(async (_scope, authorize) => authorize(tx)),
      advance: jest.fn(async (_scope, _operation, authorize) => authorize(tx)),
      signPart: jest.fn(async (_scope, authorize) => authorize(tx)),
    }
    reads = { signForMessage: jest.fn(async (_scope, authorize) => authorize(tx)) }
    publisher = { publish: jest.fn(async (_scope, _body, authorize) => authorize(tx)) }
    facade = new PrivateChatMediaFacade(channels, dms, coordinator, reads, publisher)
  })

  it.each(['reserve', 'status', 'cancel', 'read'] as const)('uses the authenticated channel scope and %s permission', async (action) => {
    if (action === 'reserve') await facade.reserve(actor, channel, input)
    else if (action === 'read') await facade.read(actor, channel, 'message')
    else await facade[action](actor, channel, 'upload')
    expect(channels.authorizePrivateUpload).toHaveBeenCalledWith('user', 'club', 'team', 'channel', action === 'read' ? 'read' : 'write', tx)
    expect(dms.authorizePrivateUpload).not.toHaveBeenCalled()
    expect(dms.authorizePrivateMediaRead).not.toHaveBeenCalled()
  })

  it.each(['reserve', 'status', 'cancel', 'read'] as const)('uses distinct DM read/write authorization for %s', async (action) => {
    if (action === 'reserve') await facade.reserve(actor, dm, input)
    else if (action === 'read') await facade.read(actor, dm, 'message')
    else await facade[action](actor, dm, 'upload')
    const method = action === 'read' ? dms.authorizePrivateMediaRead : dms.authorizePrivateUpload
    expect(method).toHaveBeenCalledWith('user', 'club', 'conversation', tx)
    expect(channels.authorizePrivateUpload).not.toHaveBeenCalled()
  })

  it('propagates revoked access rather than signing or granting authorization', async () => {
    dms.authorizePrivateMediaRead.mockRejectedValue(new Error('revoked'))
    await expect(facade.read(actor, dm, 'message')).rejects.toThrow('revoked')
    expect(dms.authorizePrivateUpload).not.toHaveBeenCalled()
  })

  it('rejects invalid runtime destination kinds instead of falling through to DM authorization', () => {
    expect(() => facade.read(actor, { kind: 'OTHER', conversationId: 'conversation' } as never, 'message'))
      .toThrow('Invalid private media scope')
    expect(dms.authorizePrivateMediaRead).not.toHaveBeenCalled()
    expect(reads.signForMessage).not.toHaveBeenCalled()
  })

  it.each(['reserve', 'status', 'cancel', 'read', 'advance', 'signPart', 'publish'] as const)('rejects a missing actor safely for %s', (action) => {
    const call = () => action === 'reserve' ? facade.reserve(null as never, dm, input)
      : action === 'read' ? facade.read(null as never, dm, 'message')
      : action === 'advance' ? facade.advance(null as never, dm, 'upload', 'initiate')
      : action === 'publish' ? facade.publish(null as never, dm, 'upload', { messageType: 'IMAGE' })
      : facade[action](null as never, dm, 'upload')
    expect(call).toThrow('Invalid private media scope')
  })

  it.each(['initiate', 'complete', 'sign', 'publish'] as const)('requires DM write authorization before %s', async (action) => {
    dms.authorizePrivateUpload.mockRejectedValue(new Error('revoked'))
    const promise = action === 'sign' ? facade.signPart(actor, dm, 'upload')
      : action === 'publish' ? facade.publish(actor, dm, 'upload', { messageType: 'IMAGE' })
      : facade.advance(actor, dm, 'upload', action)
    await expect(promise).rejects.toThrow('revoked')
    expect(dms.authorizePrivateUpload).toHaveBeenCalledWith('user', 'club', 'conversation', tx)
  })
})
