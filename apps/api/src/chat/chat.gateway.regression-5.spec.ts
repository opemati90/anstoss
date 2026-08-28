import { ChatGateway } from './chat.gateway'

describe('ChatGateway DM typing authorization', () => {
  function makeGateway(dmService: { assertCanMessageConversation: jest.Mock }) {
    return new ChatGateway(
      {} as any,
      {} as any,
      {} as any,
      dmService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    )
  }

  function makeClient() {
    const emit = jest.fn()
    return {
      client: {
        data: { userId: 'user-1', userName: 'Mia' },
        to: jest.fn().mockReturnValue({ emit }),
      } as any,
      emit,
    }
  }

  it('does not expose typing presence to a conversation the socket cannot access', async () => {
    const dmService = {
      assertCanMessageConversation: jest.fn().mockRejectedValue(new Error('Not a participant')),
    }
    const gateway = makeGateway(dmService)
    const { client, emit } = makeClient()

    await expect(
      gateway.handleDmTyping(client, { conversationId: 'conversation-1' }),
    ).rejects.toThrow('Not a participant')

    expect(dmService.assertCanMessageConversation).toHaveBeenCalledWith('user-1', 'conversation-1')
    expect(client.to).not.toHaveBeenCalled()
    expect(emit).not.toHaveBeenCalled()
  })

  it('emits typing only after the service authorizes the participant and policy', async () => {
    const dmService = {
      assertCanMessageConversation: jest.fn().mockResolvedValue(undefined),
    }
    const gateway = makeGateway(dmService)
    const { client, emit } = makeClient()

    await gateway.handleDmTyping(client, { conversationId: 'conversation-1' })

    expect(dmService.assertCanMessageConversation).toHaveBeenCalledWith('user-1', 'conversation-1')
    expect(client.to).toHaveBeenCalledWith('dm:conversation-1')
    expect(emit).toHaveBeenCalledWith('dm:typing', {
      userId: 'user-1',
      userName: 'Mia',
    })
  })

  it('ignores malformed typing events without consulting policy or joining a room', async () => {
    const dmService = {
      assertCanMessageConversation: jest.fn(),
    }
    const gateway = makeGateway(dmService)
    const { client, emit } = makeClient()

    await gateway.handleDmTyping(client, undefined)

    expect(dmService.assertCanMessageConversation).not.toHaveBeenCalled()
    expect(client.to).not.toHaveBeenCalled()
    expect(emit).not.toHaveBeenCalled()
  })

  it('coalesces repeated typing events before repeating database authorization', async () => {
    const dmService = {
      assertCanMessageConversation: jest.fn().mockResolvedValue(undefined),
    }
    const gateway = makeGateway(dmService)
    const { client, emit } = makeClient()

    await gateway.handleDmTyping(client, { conversationId: 'conversation-1' })
    await gateway.handleDmTyping(client, { conversationId: 'conversation-1' })

    expect(dmService.assertCanMessageConversation).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledTimes(1)
  })

  it('throttles distinct conversation IDs per user before database authorization', async () => {
    const dmService = {
      assertCanMessageConversation: jest.fn().mockResolvedValue(undefined),
    }
    const gateway = makeGateway(dmService)
    const { client } = makeClient()

    await gateway.handleDmTyping(client, { conversationId: 'conversation-1' })
    await gateway.handleDmTyping(client, { conversationId: 'conversation-2' })
    await gateway.handleDmTyping(client, { conversationId: '../invalid' })

    expect(dmService.assertCanMessageConversation).toHaveBeenCalledTimes(1)
  })
})
