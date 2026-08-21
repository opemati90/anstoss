import { ChatGateway } from './chat.gateway'

// Regression: ISSUE-008 — removed users retained live Socket.IO room access.
describe('ChatGateway realtime access revocation', () => {
  it('disconnects every open socket for the changed user', async () => {
    const sockets = [
      { disconnect: jest.fn() },
      { disconnect: jest.fn() },
    ]
    const gateway = new ChatGateway(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    )
    gateway.server = {
      in: jest.fn().mockReturnValue({ fetchSockets: jest.fn().mockResolvedValue(sockets) }),
    } as never

    await gateway.onRealtimeAccessChanged({ userId: 'removed-user' })

    expect(gateway.server.in).toHaveBeenCalledWith('user:removed-user')
    for (const socket of sockets) expect(socket.disconnect).toHaveBeenCalledWith(true)
  })
})
