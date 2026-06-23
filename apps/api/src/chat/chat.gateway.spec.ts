import { ChatGateway } from './chat.gateway'
import { verifySessionToken } from '../auth/otp/jwt.util'

// Mock the HS256 session verifier (same one the REST guard uses) so the
// gateway's connection-auth path is exercised against an explicit seam.
jest.mock('../auth/otp/jwt.util', () => ({
  verifySessionToken: jest.fn(),
}))

const mockedVerify = verifySessionToken as jest.Mock

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
      {} as any, // chatService
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
      select: { id: true, name: true },
    })
    expect(client.disconnect).toHaveBeenCalled()
    expect(client.data.userId).toBeUndefined()
  })

  it('attaches user identity to the socket on a valid token', async () => {
    mockedVerify.mockReturnValue({ sub: 'user-1' })
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1', name: 'Mia' })
    const client = makeClient('good-token')
    await gateway.handleConnection(client)

    expect(client.disconnect).not.toHaveBeenCalled()
    expect(client.data.userId).toBe('user-1')
    expect(client.data.userName).toBe('Mia')
  })

  it('reads the token from the handshake query when auth is absent', async () => {
    mockedVerify.mockReturnValue({ sub: 'user-1' })
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

// End-to-end: a token minted by the real OTP signer (signSessionToken)
// must be accepted by the gateway, and a tampered/garbage token rejected.
// Uses the REAL jwt.util (unmocked) to prove the gateway speaks the same
// HS256 session-token dialect as /auth/otp/verify.
describe('ChatGateway.handleConnection (real OTP-issued token)', () => {
  const realJwt = jest.requireActual('../auth/otp/jwt.util')
  const SECRET = 'test-secret-at-least-32-characters-long-xx'

  function makeGateway(prisma: any) {
    return new ChatGateway(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    )
  }

  beforeEach(() => {
    process.env.AUTH_JWT_SECRET = SECRET
    // Route the mocked module back to the real implementation for this block.
    mockedVerify.mockImplementation((t: string) => realJwt.verifySessionToken(t))
  })

  afterEach(() => {
    mockedVerify.mockReset()
  })

  it('accepts a valid OTP-issued session token and attaches the user', async () => {
    const token = realJwt.signSessionToken('user-42', { secret: SECRET })
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'user-42', name: 'Lea' }) },
    }
    const gateway = makeGateway(prisma)
    const client = {
      handshake: { auth: { token }, query: {} },
      data: {} as Record<string, unknown>,
      disconnect: jest.fn(),
    } as any

    await gateway.handleConnection(client)

    expect(client.disconnect).not.toHaveBeenCalled()
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'user-42', deletedAt: null },
      select: { id: true, name: true },
    })
    expect(client.data.userId).toBe('user-42')
  })

  it('disconnects on a tampered/garbage token', async () => {
    const prisma = { user: { findFirst: jest.fn() } }
    const gateway = makeGateway(prisma)
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
      {} as any, // chatService
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

describe('ChatGateway.handleMarkChannelRead', () => {
  let gateway: ChatGateway
  let mockTeamsService: any
  let mockChannelsService: any
  let mockChatService: any

  beforeEach(() => {
    mockTeamsService = {
      assertReadableAccess: jest.fn().mockResolvedValue(undefined),
    }
    mockChannelsService = {
      listForUser: jest.fn().mockResolvedValue([{ id: 'chan-1' }]),
    }
    mockChatService = {
      markChannelRead: jest.fn().mockResolvedValue({ marked: 3 }),
    }
    gateway = new ChatGateway(
      {} as any,
      {} as any,
      mockTeamsService,
      {} as any,
      {} as any,
      mockChannelsService as any,
      {} as any,
      mockChatService as any,
    )
  })

  const client = (userId?: string) => ({ data: { userId } }) as any

  it('rejects an unauthenticated socket', async () => {
    const res = await gateway.handleMarkChannelRead(client(undefined), {
      teamId: 'team-1',
      channelId: 'chan-1',
    })
    expect(res).toEqual({ event: 'error', data: { message: 'Unauthorized' } })
    expect(mockChatService.markChannelRead).not.toHaveBeenCalled()
  })

  it('no-ops on the legacy team-wide (null channel) stream', async () => {
    const res = await gateway.handleMarkChannelRead(client('user-1'), {
      teamId: 'team-1',
      channelId: null,
    })
    expect(res).toEqual({ event: 'marked', data: { marked: 0 } })
    expect(mockChatService.markChannelRead).not.toHaveBeenCalled()
  })

  it('forbids marking a channel the user cannot read', async () => {
    mockChannelsService.listForUser.mockResolvedValue([{ id: 'other-chan' }])
    const res = await gateway.handleMarkChannelRead(client('user-1'), {
      teamId: 'team-1',
      channelId: 'chan-1',
    })
    expect(res).toEqual({ event: 'error', data: { message: 'Forbidden for this channel' } })
    expect(mockChatService.markChannelRead).not.toHaveBeenCalled()
  })

  it('marks a visible channel read', async () => {
    const res = await gateway.handleMarkChannelRead(client('user-1'), {
      teamId: 'team-1',
      channelId: 'chan-1',
    })
    expect(mockTeamsService.assertReadableAccess).toHaveBeenCalledWith('user-1', 'team-1')
    expect(mockChatService.markChannelRead).toHaveBeenCalledWith('user-1', 'team-1', 'chan-1')
    expect(res).toEqual({ event: 'marked', data: { marked: 3 } })
  })
})
