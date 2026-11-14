import { Server } from 'socket.io'
import { Redis } from 'ioredis'
import { installRedisAdapter } from './redis-adapter'

jest.mock('ioredis', () => ({ Redis: jest.fn() }))

describe('installRedisAdapter', () => {
  const connect = jest.fn()
  const disconnect = jest.fn()
  const subClient = { connect, disconnect }
  const pubClient = { connect, disconnect, duplicate: jest.fn(() => subClient) }

  beforeEach(() => {
    jest.clearAllMocks()
    connect.mockResolvedValue(undefined)
    ;(Redis as unknown as jest.Mock).mockImplementation(() => pubClient)
  })

  it('installs on the real Socket.IO server once for three named gateways', async () => {
    const server = new Server()
    const namespaces = ['/chat', '/events', '/live'].map((name) => server.of(name))
    const adapter = jest.spyOn(server, 'adapter').mockReturnValue(server)
    await Promise.all(namespaces.map((namespace) => installRedisAdapter(namespace, 'redis://test')))
    expect(Redis).toHaveBeenCalledTimes(1)
    expect(connect).toHaveBeenCalledTimes(2)
    expect(adapter).toHaveBeenCalledTimes(1)
    expect(adapter).toHaveBeenCalledWith(expect.any(Function))
  })

  it('disconnects both clients on failure and allows a retry', async () => {
    const server = new Server()
    jest.spyOn(server, 'adapter').mockReturnValue(server)
    connect.mockRejectedValueOnce(new Error('Redis unavailable'))
    await expect(installRedisAdapter(server, 'redis://test')).rejects.toThrow('Redis unavailable')
    expect(disconnect).toHaveBeenCalledTimes(2)
    await expect(installRedisAdapter(server, 'redis://test')).resolves.toBeUndefined()
    expect(Redis).toHaveBeenCalledTimes(2)
  })
})
