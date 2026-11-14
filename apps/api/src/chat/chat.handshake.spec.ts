import { createServer } from 'node:http'
import { AddressInfo } from 'node:net'
import { Server } from 'socket.io'
import { io, Socket } from 'socket.io-client'
import { ChatGateway } from './chat.gateway'
import { signSessionToken } from '../auth/otp/jwt.util'

// Real websocket transport, deliberately slow identity lookup. Calling a
// gateway method directly after awaiting handleConnection cannot catch this race.
describe('chat handshake ordering', () => {
  let server: Server
  let client: Socket
  const originalSecret = process.env.AUTH_JWT_SECRET
  const originalRedis = process.env.REDIS_URL
  beforeEach(() => {
    process.env.AUTH_JWT_SECRET = 'isolated-chat-handshake-test-secret'
    delete process.env.REDIS_URL
  })
  afterEach(async () => {
    client?.disconnect()
    await new Promise<void>(resolve => server.close(() => resolve()))
    if (originalSecret === undefined) delete process.env.AUTH_JWT_SECRET
    else process.env.AUTH_JWT_SECRET = originalSecret
    if (originalRedis === undefined) delete process.env.REDIS_URL
    else process.env.REDIS_URL = originalRedis
  })

  async function start(token: string) {
    const http = createServer()
    server = new Server(http)
    const namespace = server.of('/chat')
    const gateway = new ChatGateway(
      { user: { findFirst: async () => {
        await new Promise(resolve => setTimeout(resolve, 80))
        return { id: 'player', name: 'Player' }
      } } } as any,
      {} as any,
      { assertReadableAccess: async () => ({ team: { clubId: 'club' } }) } as any,
      {} as any, {} as any,
      { listForUser: async () => [] } as any,
      {} as any, {} as any,
    )
    gateway.afterInit(namespace)
    namespace.on('connection', socket => {
      // Nest invokes this async lifecycle hook without holding client events.
      void gateway.handleConnection(socket)
      socket.on('join', (data, ack) => { void gateway.handleJoin(socket, data).then(ack) })
    })
    await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve))
    client = io(`http://127.0.0.1:${(http.address() as AddressInfo).port}/chat`, {
      auth: { token }, transports: ['websocket'], reconnection: false, autoConnect: false,
    })
  }

  it('authorizes the first join sent immediately on connect', async () => {
    await start(signSessionToken('player'))
    const result = await new Promise(resolve => {
      client.on('connect', () => client.emit('join', { teamId: 'team' }, resolve))
      client.connect()
    })
    expect(result).toEqual({ event: 'joined', data: { teamId: 'team' } })
  })

  it('rejects a bad token before announcing a successful connection', async () => {
    await start('invalid')
    const connected = jest.fn()
    client.on('connect', connected)
    await new Promise<void>(resolve => {
      client.on('connect_error', () => resolve())
      client.on('disconnect', () => resolve())
      client.connect()
    })
    expect(connected).not.toHaveBeenCalled()
  })
})
