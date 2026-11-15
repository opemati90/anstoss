import { ChatGateway } from './chat.gateway'

describe('Live message translations', () => {
  function fixture() {
    const sockets = ['de-1', 'de-2', 'en-1'].map((id) => ({ data: { userId: id }, emit: jest.fn() }))
    const prisma = {
      user: { findMany: jest.fn().mockResolvedValue(sockets.map((s) => ({ id: s.data.userId, preferredLanguage: s.data.userId.slice(0, 2) }))) },
      message: { findUnique: jest.fn().mockResolvedValue({ content: 'Bonjour', deletedAt: null }) },
      directMessage: { findUnique: jest.fn().mockResolvedValue({ content: 'Bonjour', deletedAt: null }) },
    }
    const translation = {
      detectAndPersistSource: jest.fn().mockResolvedValue('fr'),
      resolveTargetLanguage: jest.fn((language) => language),
      translateForReader: jest.fn(async (_surface, _id, _source, _content, target) => ({ content: target === 'de' ? 'Hallo' : 'Hello', sourceLanguage: 'fr' })),
    }
    const channels = { getChannelAccess: jest.fn().mockResolvedValue({ canRead: true }) }
    const dm = { assertConversationAccess: jest.fn().mockResolvedValue({}) }
    const gateway = new ChatGateway(prisma as any, {} as any, {} as any, dm as any, translation as any, channels as any, {} as any, {} as any)
    gateway.server = { in: jest.fn(() => ({ fetchSockets: jest.fn().mockResolvedValue(sockets) })) } as any
    const run = (surface: 'channel' | 'dm' = 'channel') => (gateway as any).translateLiveMessage(surface, 'thread-1', { id: 'message-1', content: 'Bonjour', senderId: 'sender-1' })
    return { sockets, prisma, translation, channels, dm, run }
  }

  it('sends each reader their language, sharing provider work for the same locale', async () => {
    const { sockets, translation, run } = fixture()
    await run()
    expect(translation.translateForReader).toHaveBeenCalledTimes(2)
    expect(sockets[0].emit).toHaveBeenCalledWith('message:translation', expect.objectContaining({ translation: { content: 'Hallo', sourceLanguage: 'fr' } }))
    expect(sockets[2].emit).toHaveBeenCalledWith('message:translation', expect.objectContaining({ translation: { content: 'Hello', sourceLanguage: 'fr' } }))
  })

  it('does not send translations after group access is removed', async () => {
    const { sockets, channels, run } = fixture()
    channels.getChannelAccess.mockResolvedValue({ canRead: false })
    await run()
    for (const socket of sockets) expect(socket.emit).not.toHaveBeenCalled()
  })

  it('does not restore content deleted while translation was in flight', async () => {
    const { sockets, prisma, run } = fixture()
    prisma.message.findUnique.mockResolvedValue({ content: '', deletedAt: new Date() } as any)
    await run()
    for (const socket of sockets) expect(socket.emit).not.toHaveBeenCalled()
  })

  it('rechecks DM access and sends on the DM event', async () => {
    const { sockets, dm, run } = fixture()
    await run('dm')
    expect(dm.assertConversationAccess).toHaveBeenCalledWith('de-1', 'thread-1')
    expect(sockets[0].emit).toHaveBeenCalledWith('dm:translation', expect.objectContaining({ conversationId: 'thread-1' }))
  })

  it('leaves original messages untouched when translation is unavailable', async () => {
    const { sockets, translation, run } = fixture()
    translation.translateForReader.mockResolvedValue(null as any)
    await run()
    for (const socket of sockets) expect(socket.emit).not.toHaveBeenCalled()
  })
})
