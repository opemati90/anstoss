import { ChatGateway } from './chat.gateway'
import { verifyClerkSessionToken } from '../auth/clerk-verify'

// Mock the shared verifier directly (not @clerk/backend) so the gateway's
// connection-auth path is exercised against an explicit seam. This keeps the
// test decoupled from how clerk-verify resolves keys internally.
jest.mock('../auth/clerk-verify', () => ({
  verifyClerkSessionToken: jest.fn(),
}))

const mockedVerify = verifyClerkSessionToken as jest.Mock

describe('ChatGateway.handleConnection (auth)', () => {
  let gateway: ChatGateway
  let mockPrisma: any

  beforeEach(() => {
    mockedVerify.mockReset()
    mockPrisma = {
      user: {
        findFirst: jest.fn(),
      },
    }
    gateway = new ChatGateway(
      mockPrisma,
      {} as any, // pushService
      {} as any, // teamsService
      {} as any, // dmService
      {} as any, // translation
      {} as any, // channelsService
      {} as any, // moderationService
    )
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
      select: { id: true, name: true },
    })
    expect(client.disconnect).toHaveBeenCalled()
    expect(client.data.userId).toBeUndefined()
  })

  it('attaches user identity to the socket on a valid token', async () => {
    mockedVerify.mockResolvedValue({ sub: 'clerk_123' })
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1', name: 'Mia' })
    const client = makeClient('good-token')
    await gateway.handleConnection(client)

    expect(client.disconnect).not.toHaveBeenCalled()
    expect(client.data.userId).toBe('user-1')
    expect(client.data.userName).toBe('Mia')
  })

  it('reads the token from the handshake query when auth is absent', async () => {
    mockedVerify.mockResolvedValue({ sub: 'clerk_123' })
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1', name: 'Mia' })
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

describe('ChatGateway.handleSearch', () => {
  let gateway: ChatGateway
  let mockPrisma: any
  let mockTeamsService: any

  beforeEach(() => {
    mockPrisma = {
      message: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
    }
    mockTeamsService = {
      assertReadableAccess: jest.fn().mockResolvedValue(undefined),
    }

    const mockChannelsService = {
      listForUser: jest.fn().mockResolvedValue([]),
    }
    const mockModerationService = {
      listBlockedUserIds: jest.fn().mockResolvedValue([]),
    }

    gateway = new ChatGateway(
      mockPrisma,
      {} as any, // pushService
      mockTeamsService,
      {} as any, // dmService
      {} as any, // translation
      mockChannelsService as any,
      mockModerationService as any,
    )
  })

  function makeClient(userId?: string) {
    return { data: { userId } } as any
  }

  it('returns error when client has no userId', async () => {
    const result = await gateway.handleSearch(
      makeClient(undefined),
      { teamId: 'team-1', query: 'hello' },
    )

    expect(result).toEqual({
      event: 'error',
      data: { message: 'Unauthorized' },
    })
  })

  it('returns empty results for query shorter than 2 chars', async () => {
    const result = await gateway.handleSearch(
      makeClient('user-1'),
      { teamId: 'team-1', query: 'a' },
    )

    expect(result).toEqual({
      event: 'search_results',
      data: { messages: [] },
    })
  })

  it('returns empty results for empty query', async () => {
    const result = await gateway.handleSearch(
      makeClient('user-1'),
      { teamId: 'team-1', query: '' },
    )

    expect(result).toEqual({
      event: 'search_results',
      data: { messages: [] },
    })
  })

  it('searches messages with contains filter and returns reversed results', async () => {
    const mockMessages = [
      { id: 'msg-2', content: 'hello world', createdAt: new Date('2026-03-02') },
      { id: 'msg-1', content: 'hello there', createdAt: new Date('2026-03-01') },
    ]
    mockPrisma.message.findMany.mockResolvedValue(mockMessages)

    const result = await gateway.handleSearch(
      makeClient('user-1'),
      { teamId: 'team-1', query: 'hello' },
    )

    expect(mockTeamsService.assertReadableAccess).toHaveBeenCalledWith('user-1', 'team-1')
    expect(mockPrisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          teamId: 'team-1',
          content: { contains: 'hello', mode: 'insensitive' },
          OR: [{ channelId: null }, { channelId: { in: [] } }],
        },
        take: 20,
      }),
    )
    expect(result.data.messages![0].id).toBe('msg-1')
    expect(result.data.messages![1].id).toBe('msg-2')
  })
})
