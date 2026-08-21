import { EventsGateway } from '../events/events.gateway'
import { LiveGateway } from '../live/live.gateway'

// Regression: adversarial re-audit — revocation disconnected chat only.
describe('realtime access revocation across namespaces', () => {
  it.each([
    ['events', new EventsGateway({} as never, {} as never)],
    ['live', new LiveGateway({} as never, {} as never)],
  ])('disconnects the removed user from %s sockets', async (_name, gateway) => {
    const socket = { disconnect: jest.fn() }
    gateway.server = {
      in: jest.fn().mockReturnValue({ fetchSockets: jest.fn().mockResolvedValue([socket]) }),
    } as never

    await gateway.onRealtimeAccessChanged({ userId: 'removed-user' })

    expect(gateway.server.in).toHaveBeenCalledWith('user:removed-user')
    expect(socket.disconnect).toHaveBeenCalledWith(true)
  })
})
