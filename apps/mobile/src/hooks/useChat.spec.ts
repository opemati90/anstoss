import { act, renderHook, waitFor } from '@testing-library/react-native'
import { useChat, type ChatMessage } from './useChat'

type Handler = (...args: any[]) => void
type AckHandler = (...args: any[]) => void

type MockSocket = {
  auth?: { token: string }
  connected: boolean
  handlers: Map<string, Handler>
  ioHandlers: Map<string, Handler>
  emitted: Array<{ event: string; payload: any }>
  on: jest.Mock
  io: { on: jest.Mock }
  emit: jest.Mock
  timeout: jest.Mock
  disconnect: jest.Mock
  trigger: (event: string, ...args: any[]) => void
  triggerIo: (event: string, ...args: any[]) => void
}

const mockIo = jest.fn()

jest.mock('socket.io-client', () => ({
  io: (...args: any[]) => mockIo(...args),
}))

const makeMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: overrides.id ?? 'msg-1',
  teamId: overrides.teamId ?? 'team-1',
  clientMessageId: overrides.clientMessageId ?? null,
  senderId: overrides.senderId ?? 'user-2',
  senderName: overrides.senderName ?? 'Mina',
  content: overrides.content ?? 'Hello',
  createdAt: overrides.createdAt ?? '2026-04-17T10:00:00.000Z',
  isAnnouncement: overrides.isAnnouncement,
  isPinned: overrides.isPinned,
})

function createSocket(): MockSocket {
  const socket: MockSocket = {
    connected: false,
    handlers: new Map(),
    ioHandlers: new Map(),
    emitted: [],
    on: jest.fn((event: string, handler: Handler) => {
      socket.handlers.set(event, handler)
      return socket
    }),
    io: {
      on: jest.fn((event: string, handler: Handler) => {
        socket.ioHandlers.set(event, handler)
        return socket
      }),
    },
    emit: jest.fn((event: string, payload: any, ack?: AckHandler) => {
      socket.emitted.push({ event, payload })
      if (event === 'history' && ack) {
        ack({
          data: {
            messages: [makeMessage({ id: payload?.cursor ? 'older' : 'initial' })],
            hasMore: !payload?.cursor,
          },
        })
      }
      if (event === 'search' && ack) {
        ack({ data: [makeMessage({ id: 'search-result', content: payload.query })] })
      }
      if (event === 'message' && ack) {
        ack(null, { data: {} })
      }
      return socket
    }),
    timeout: jest.fn(() => socket),
    disconnect: jest.fn(() => {
      socket.connected = false
    }),
    trigger: (event: string, ...args: any[]) => {
      socket.handlers.get(event)?.(...args)
    },
    triggerIo: (event: string, ...args: any[]) => {
      socket.ioHandlers.get(event)?.(...args)
    },
  }
  return socket
}

describe('useChat', () => {
  let socket: MockSocket
  const originalFetch = global.fetch

  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    socket = createSocket()
    mockIo.mockReturnValue(socket)
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(makeMessage({ id: 'pinned', isPinned: true })),
      }),
    ) as jest.Mock
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
    global.fetch = originalFetch
  })

  it('connects, loads history, fetches pinned message, and cleans up', async () => {
    const { result, unmount } = renderHook(() =>
      useChat({
        clubId: 'club-1',
        teamId: 'team-1',
        token: 'token-1',
        userId: 'user-1',
        apiUrl: 'http://api.test',
      }),
    )

    expect(mockIo).toHaveBeenCalledWith(
      'http://api.test/chat',
      expect.objectContaining({
        auth: { token: 'token-1' },
        transports: ['websocket'],
      }),
    )

    act(() => {
      socket.connected = true
      socket.trigger('connect')
    })

    await waitFor(() => {
      expect(result.current.connectionState).toBe('connected')
      expect(result.current.messages).toHaveLength(1)
      expect(result.current.pinnedMessage?.id).toBe('pinned')
    })

    expect(socket.emitted).toEqual(
      expect.arrayContaining([
        { event: 'join', payload: { teamId: 'team-1' } },
        { event: 'history', payload: { teamId: 'team-1', channelId: null } },
      ]),
    )
    expect(global.fetch).toHaveBeenCalledWith(
      'http://api.test/clubs/club-1/teams/team-1/messages/pinned',
      expect.objectContaining({
        headers: { Authorization: 'Bearer token-1' },
      }),
    )

    unmount()

    expect(socket.emitted).toEqual(
      expect.arrayContaining([{ event: 'leave', payload: { teamId: 'team-1' } }]),
    )
    expect(socket.disconnect).toHaveBeenCalled()
  })

  it('tracks unread messages and typing indicators', async () => {
    const { result } = renderHook(() =>
      useChat({
        clubId: 'club-1',
        teamId: 'team-1',
        token: 'token-1',
        userId: 'user-1',
        apiUrl: 'http://api.test',
      }),
    )

    act(() => {
      result.current.setIsAtBottom(false)
      socket.trigger('message', makeMessage({ id: 'incoming', senderId: 'user-2' }))
      socket.trigger('typing', { userId: 'user-2', userName: 'Mina' })
    })

    expect(result.current.unreadCount).toBe(1)
    expect(result.current.typingUsers).toEqual(['Mina'])

    act(() => {
      jest.runOnlyPendingTimers()
    })

    expect(result.current.typingUsers).toEqual([])

    act(() => {
      result.current.setIsAtBottom(true)
    })

    expect(result.current.unreadCount).toBe(0)
  })

  it('treats a self echo as delivery even when the ack says failed', async () => {
    const { result } = renderHook(() =>
      useChat({
        clubId: 'club-1',
        teamId: 'team-1',
        token: 'token-1',
        userId: 'user-1',
        apiUrl: 'http://api.test',
      }),
    )

    act(() => {
      socket.connected = true
    })

    socket.timeout.mockReturnValueOnce({
      emit: (_event: string, payload: any, ack: (...args: unknown[]) => void) => {
        socket.trigger(
          'message',
          makeMessage({
            id: 'self-msg',
            senderId: 'user-1',
            content: 'Hi team',
            clientMessageId: payload.clientMessageId,
          }),
        )
        ack(new Error('timeout'))
      },
    })

    let delivered = false
    await act(async () => {
      delivered = await result.current.sendMessage('Hi team', 'club-1')
    })

    expect(delivered).toBe(true)
    expect(result.current.lastError).toBeNull()
  })

  it('sends, searches, refreshes, and loads older history through the socket', async () => {
    const { result } = renderHook(() =>
      useChat({
        clubId: 'club-1',
        teamId: 'team-1',
        token: 'token-1',
        userId: 'user-1',
        apiUrl: 'http://api.test',
      }),
    )

    act(() => {
      socket.connected = true
      socket.trigger('connect')
    })

    await waitFor(() => expect(result.current.messages[0]?.id).toBe('initial'))

    await expect(result.current.sendMessage('  Hi team  ', 'club-1')).resolves.toBe(true)
    expect(socket.timeout).toHaveBeenCalledWith(5000)
    expect(socket.emitted).toEqual(
      expect.arrayContaining([
        {
          event: 'message',
          payload: expect.objectContaining({
            teamId: 'team-1',
            clubId: 'club-1',
            content: 'Hi team',
            channelId: null,
            clientMessageId: expect.any(String),
          }),
        },
      ]),
    )

    await expect(result.current.searchMessages('  goal  ')).resolves.toEqual([
      expect.objectContaining({ id: 'search-result', content: 'goal' }),
    ])

    act(() => {
      result.current.loadMore()
    })

    await waitFor(() => {
      expect(result.current.messages[0]?.id).toBe('older')
      expect(result.current.hasMore).toBe(false)
    })

    act(() => {
      result.current.refreshHistory()
    })

    await waitFor(() => expect(result.current.messages[0]?.id).toBe('initial'))
  })

  it('surfaces connection and send failures without throwing', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = renderHook(() =>
      useChat({
        clubId: 'club-1',
        teamId: 'team-1',
        token: 'token-1',
        userId: 'user-1',
        apiUrl: 'http://api.test',
      }),
    )

    act(() => {
      socket.trigger('connect_error', new Error('nope'))
    })

    expect(result.current.connectionState).toBe('offline')
    expect(result.current.lastError).toBe('connect_error')

    let offlineSendResult = true
    await act(async () => {
      offlineSendResult = await result.current.sendMessage('hello', 'club-1')
    })
    expect(offlineSendResult).toBe(false)
    expect(result.current.lastError).toBe('offline')

    socket.emit.mockImplementationOnce((event: string, payload: any, ack?: AckHandler) => {
      socket.emitted.push({ event, payload })
      ack?.(null, { event: 'error', data: { message: 'Blocked' } })
      return socket
    })

    act(() => {
      socket.connected = true
    })

    let blockedSendResult = true
    await act(async () => {
      blockedSendResult = await result.current.sendMessage('hello', 'club-1')
    })
    expect(blockedSendResult).toBe(false)
    expect(result.current.lastError).toBe('send_error')
    warnSpy.mockRestore()
  })
})
