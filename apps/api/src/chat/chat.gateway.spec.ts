import { ChatGateway } from './chat.gateway'

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

    gateway = new ChatGateway(
      mockPrisma,
      {} as any, // pushService
      mockTeamsService,
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
        },
        take: 20,
      }),
    )
    expect(result.data.messages![0].id).toBe('msg-1')
    expect(result.data.messages![1].id).toBe('msg-2')
  })
})
