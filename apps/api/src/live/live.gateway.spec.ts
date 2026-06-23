import { LiveGateway } from './live.gateway'
import { verifySessionToken } from '../auth/otp/jwt.util'

// Mock the HS256 session verifier (same one the REST guard uses) so the
// gateway's connection-auth path is exercised against an explicit seam.
jest.mock('../auth/otp/jwt.util', () => ({
  verifySessionToken: jest.fn(),
}))

const mockedVerify = verifySessionToken as jest.Mock

describe('LiveGateway.handleConnection (auth)', () => {
  let gateway: LiveGateway
  let mockPrisma: any

  beforeEach(() => {
    mockedVerify.mockReset()
    mockPrisma = {
      user: {
        findFirst: jest.fn(),
      },
    }
    gateway = new LiveGateway(mockPrisma, {} as any)
  })

  function makeClient(token?: string) {
    return {
      handshake: { auth: token ? { token } : {}, query: {} },
      data: {} as Record<string, unknown>,
      disconnect: jest.fn(),
    } as any
  }

  it('disconnects when no token is provided', async () => {
    const client = makeClient(undefined)
    await gateway.handleConnection(client)

    expect(client.disconnect).toHaveBeenCalled()
    expect(mockedVerify).not.toHaveBeenCalled()
    expect(client.data.userId).toBeUndefined()
  })

  it('disconnects when the token fails verification', async () => {
    mockedVerify.mockImplementation(() => {
      throw new Error('Invalid signature')
    })
    const client = makeClient('bad-token')
    await gateway.handleConnection(client)

    expect(client.disconnect).toHaveBeenCalled()
    expect(client.data.userId).toBeUndefined()
  })

  it('disconnects when the verified token has no subject claim', async () => {
    mockedVerify.mockReturnValue({ sub: undefined })
    const client = makeClient('no-sub')
    await gateway.handleConnection(client)

    expect(client.disconnect).toHaveBeenCalled()
    expect(client.data.userId).toBeUndefined()
  })

  it('disconnects when no matching (non-deleted) user exists', async () => {
    mockedVerify.mockReturnValue({ sub: 'user-123' })
    mockPrisma.user.findFirst.mockResolvedValue(null)
    const client = makeClient('orphan')
    await gateway.handleConnection(client)

    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'user-123', deletedAt: null },
      select: { id: true },
    })
    expect(client.disconnect).toHaveBeenCalled()
    expect(client.data.userId).toBeUndefined()
  })

  it('attaches the user id to the socket on a valid token', async () => {
    mockedVerify.mockReturnValue({ sub: 'user-1' })
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1' })
    const client = makeClient('good-token')
    await gateway.handleConnection(client)

    expect(client.disconnect).not.toHaveBeenCalled()
    expect(client.data.userId).toBe('user-1')
  })

  it('reads the token from the handshake query when auth is absent', async () => {
    mockedVerify.mockReturnValue({ sub: 'user-1' })
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1' })
    const client = {
      handshake: { auth: {}, query: { token: 'query-token' } },
      data: {} as Record<string, unknown>,
      disconnect: jest.fn(),
    } as any
    await gateway.handleConnection(client)

    expect(mockedVerify).toHaveBeenCalledWith('query-token')
    expect(client.disconnect).not.toHaveBeenCalled()
    expect(client.data.userId).toBe('user-1')
  })
})

// End-to-end against the REAL OTP signer/verifier (jwt.util), proving the
// live gateway accepts the same HS256 session token /auth/otp/verify mints.
describe('LiveGateway.handleConnection (real OTP-issued token)', () => {
  const realJwt = jest.requireActual('../auth/otp/jwt.util')
  const SECRET = 'test-secret-at-least-32-characters-long-xx'

  beforeEach(() => {
    process.env.AUTH_JWT_SECRET = SECRET
    mockedVerify.mockImplementation((t: string) => realJwt.verifySessionToken(t))
  })

  afterEach(() => {
    mockedVerify.mockReset()
  })

  it('accepts a valid OTP-issued session token and attaches the user', async () => {
    const token = realJwt.signSessionToken('user-77', { secret: SECRET })
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'user-77' }) },
    }
    const gateway = new LiveGateway(prisma as any, {} as any)
    const client = {
      handshake: { auth: { token }, query: {} },
      data: {} as Record<string, unknown>,
      disconnect: jest.fn(),
    } as any

    await gateway.handleConnection(client)

    expect(client.disconnect).not.toHaveBeenCalled()
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'user-77', deletedAt: null },
      select: { id: true },
    })
    expect(client.data.userId).toBe('user-77')
  })

  it('disconnects on a tampered/garbage token', async () => {
    const prisma = { user: { findFirst: jest.fn() } }
    const gateway = new LiveGateway(prisma as any, {} as any)
    const client = {
      handshake: { auth: { token: 'not.a.jwt' }, query: {} },
      data: {} as Record<string, unknown>,
      disconnect: jest.fn(),
    } as any

    await gateway.handleConnection(client)

    expect(client.disconnect).toHaveBeenCalled()
    expect(client.data.userId).toBeUndefined()
  })
})
