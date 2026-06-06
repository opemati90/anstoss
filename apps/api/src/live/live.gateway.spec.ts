import { LiveGateway } from './live.gateway'
import { verifyClerkSessionToken } from '../auth/clerk-verify'

// Mock the shared verifier directly (not @clerk/backend) so the gateway's
// connection-auth path is exercised against an explicit seam.
jest.mock('../auth/clerk-verify', () => ({
  verifyClerkSessionToken: jest.fn(),
}))

const mockedVerify = verifyClerkSessionToken as jest.Mock

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
    mockedVerify.mockRejectedValue(new Error('jwt expired'))
    const client = makeClient('bad-token')
    await gateway.handleConnection(client)

    expect(client.disconnect).toHaveBeenCalled()
    expect(client.data.userId).toBeUndefined()
  })

  it('disconnects when the verified token has no subject claim', async () => {
    mockedVerify.mockResolvedValue({ sub: undefined })
    const client = makeClient('no-sub')
    await gateway.handleConnection(client)

    expect(client.disconnect).toHaveBeenCalled()
    expect(client.data.userId).toBeUndefined()
  })

  it('disconnects when no matching (non-deleted) user exists', async () => {
    mockedVerify.mockResolvedValue({ sub: 'clerk_123' })
    mockPrisma.user.findFirst.mockResolvedValue(null)
    const client = makeClient('orphan')
    await gateway.handleConnection(client)

    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
      where: { clerkId: 'clerk_123', deletedAt: null },
      select: { id: true },
    })
    expect(client.disconnect).toHaveBeenCalled()
    expect(client.data.userId).toBeUndefined()
  })

  it('attaches the user id to the socket on a valid token', async () => {
    mockedVerify.mockResolvedValue({ sub: 'clerk_123' })
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1' })
    const client = makeClient('good-token')
    await gateway.handleConnection(client)

    expect(client.disconnect).not.toHaveBeenCalled()
    expect(client.data.userId).toBe('user-1')
  })

  it('reads the token from the handshake query when auth is absent', async () => {
    mockedVerify.mockResolvedValue({ sub: 'clerk_123' })
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
