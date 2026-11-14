import { INestApplication, UseInterceptors } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets'
import { AddressInfo } from 'node:net'
import { io, Socket } from 'socket.io-client'
import { SocketAckInterceptor } from './socket-ack.interceptor'

@UseInterceptors(SocketAckInterceptor)
@WebSocketGateway({ namespace: '/protocol-test' })
class ProtocolGateway {
  @SubscribeMessage('history')
  history(@MessageBody() input: { allowed: boolean }) {
    return input.allowed
      ? { event: 'history', data: { messages: [{ id: 'one', content: 'Hello' }] } }
      : { event: 'error', data: { message: 'Forbidden for this channel' } }
  }
}

// Real Nest adapter, not manual socket.on(...).then(ack), which masks this bug.
describe('chat request acknowledgements through the Nest transport', () => {
  let app: INestApplication
  let client: Socket
  beforeEach(async () => {
    const module = await Test.createTestingModule({ providers: [ProtocolGateway] }).compile()
    app = module.createNestApplication()
    await app.listen(0, '127.0.0.1')
    const port = (app.getHttpServer().address() as AddressInfo).port
    client = io(`http://127.0.0.1:${port}/protocol-test`, {
      transports: ['websocket'],
      reconnection: false,
    })
    await new Promise<void>((resolve, reject) => {
      client.once('connect', resolve)
      client.once('connect_error', reject)
    })
  })
  afterEach(async () => {
    client?.disconnect()
    await app?.close()
  })

  it('delivers the history envelope to the request callback', async () => {
    const unsolicited = jest.fn()
    client.on('history', unsolicited)
    const result = await client.timeout(2000).emitWithAck('history', { allowed: true })
    expect(result).toEqual({
      event: 'history',
      data: { messages: [{ id: 'one', content: 'Hello' }] },
    })
    expect(unsolicited).not.toHaveBeenCalled()
  })
  it('acknowledges denial instead of leaving the loading UI waiting', async () => {
    const result = await client.timeout(2000).emitWithAck('history', { allowed: false })
    expect(result).toEqual({ event: 'error', data: { message: 'Forbidden for this channel' } })
  })
  it('preserves event responses when no acknowledgement is requested', async () => {
    const event = new Promise((resolve) => client.once('history', resolve))
    client.emit('history', { allowed: true })
    expect(await event).toEqual({ messages: [{ id: 'one', content: 'Hello' }] })
  })
})
