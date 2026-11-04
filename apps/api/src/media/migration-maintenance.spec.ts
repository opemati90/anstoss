import { request } from 'node:http'
import { connect, type AddressInfo } from 'node:net'
import { createMigrationMaintenanceServer, migrationMaintenanceEnabled } from './migration-maintenance'

describe('migration maintenance flag', () => {
  it.each([undefined, 'false'])('leaves normal startup enabled for %s', (value) => {
    expect(migrationMaintenanceEnabled(value)).toBe(false)
  })
  it('enables maintenance only for the exact true value', () => {
    expect(migrationMaintenanceEnabled('true')).toBe(true)
  })
  it.each(['', 'TRUE', '1', ' true ', 'no'])('fails closed for invalid value %j', (value) => {
    expect(() => migrationMaintenanceEnabled(value)).toThrow('Invalid migration maintenance flag')
  })
})

describe('migration maintenance server', () => {
  const server = createMigrationMaintenanceServer()
  let port: number

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = (server.address() as AddressInfo).port
  })
  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  })

  async function call(method: string, path: string) {
    return new Promise<{ status: number; retry?: string; body: string }>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, method, path }, (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => { body += chunk })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, retry: res.headers['retry-after'], body }))
      })
      req.on('error', reject)
      req.end()
    })
  }

  it('exposes an honest health response without a database connection', async () => {
    const result = await call('GET', '/health')
    expect(result.status).toBe(200)
    expect(JSON.parse(result.body)).toEqual({ status: 'maintenance' })
    expect((await call('HEAD', '/health')).body).toBe('')
  })

  it.each([
    ['POST', '/teams/t/messages'], ['POST', '/events'], ['DELETE', '/me'],
    ['GET', '/socket.io/?EIO=4&transport=polling'], ['GET', '/me'], ['POST', '/health'],
  ])('blocks %s %s with a retry hint', async (method, path) => {
    const result = await call(method, path)
    expect(result.status).toBe(503)
    expect(result.retry).toBe('60')
    expect(JSON.parse(result.body).code).toBe('MIGRATION_MAINTENANCE')
  })

  it('rejects websocket upgrades before any gateway can connect', async () => {
    const response = await new Promise<string>((resolve, reject) => {
      const socket = connect(port, '127.0.0.1', () => {
        socket.write('GET /socket.io/?EIO=4&transport=websocket HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n')
      })
      let data = ''
      socket.setEncoding('utf8')
      socket.on('data', (chunk: string) => { data += chunk })
      socket.on('end', () => resolve(data))
      socket.on('error', reject)
    })
    expect(response).toContain('HTTP/1.1 503 Service Unavailable')
    expect(response).toContain('Retry-After: 60')
  })
})
