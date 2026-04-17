import { act, renderHook, waitFor } from '@testing-library/react-native'
import { useDmChat, type DmMessage } from './useDmChat'

type Handler = (...args: any[]) => void
type AckHandler = (response: any) => void

type MockSocket = {
  connected: boolean
  handlers: Map<string, Handler>
  ioHandlers: Map<string, Handler>
  emitted: Array<{ event: string; payload: any }>
  on: jest.Mock
  io: { on: jest.Mock }
  emit: jest.Mock
  connect: jest.Mock
  disconnect: jest.Mock
  trigger: (event: string, ...args: any[]) => void
  triggerIo: (event: string, ...args: any[]) => void
}

const mockIo = jest.fn()

jest.mock('socket.io-client', () => ({
  io: (...args: any[]) => mockIo(...args),
}))

const makeDm = (overrides: Partial<DmMessage> = {}): DmMessage => ({
  id: overrides.id ?? 'dm-1',
  conversationId: overrides.conversationId ?? 'conversation-1',
  senderId: overrides.senderId ?? 'user-2',
  senderName: overrides.senderName ?? 'Mina',
  content: overrides.content ?? 'Hello',
  createdAt: overrides.createdAt ?? '2026-04-17T10:00:00.000Z',
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
      if (event === 'dm:history' && ack) {
        ack({
          data: {
            messages: [makeDm({ id: payload?.cursor ? 'older-dm' : 'initial-dm' })],
            hasMore: !payload?.cursor,
          },
        })
      }
      if (event === 'dm:message' && ack) {
        ack({ ok: true })
      }
      return socket
    }),
    connect: jest.fn(() => {
      socket.connected = true
    }),
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

describe('useDmChat', () => {
  let socket: MockSocket

  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    socket = createSocket()
    mockIo.mockReturnValue(socket)
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
  })

  it('connects, joins the conversation, and loads initial history', async () => {
    const { result, unmount } = renderHook(() =>
      useDmChat({
        conversationId: 'conversation-1',
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
      expect(result.current.messages[0]?.id).toBe('initial-dm')
    })

    expect(socket.emitted).toEqual(
      expect.arrayContaining([
        { event: 'dm:join', payload: { conversationId: 'conversation-1' } },
        { event: 'dm:history', payload: { conversationId: 'conversation-1' } },
      ]),
    )

    unmount()
    expect(socket.disconnect).toHaveBeenCalled()
  })

  it('deduplicates incoming messages and clears typing indicators', () => {
    const { result } = renderHook(() =>
      useDmChat({
        conversationId: 'conversation-1',
        token: 'token-1',
        userId: 'user-1',
        apiUrl: 'http://api.test',
      }),
    )

    const incoming = makeDm({ id: 'dm-2' })

    act(() => {
      socket.trigger('dm:message', incoming)
      socket.trigger('dm:message', incoming)
      socket.trigger('dm:typing', { userId: 'user-2', userName: 'Mina' })
    })

    expect(result.current.messages.filter((m) => m.id === 'dm-2')).toHaveLength(1)
    expect(result.current.typingUsers).toEqual(['Mina'])

    act(() => {
      jest.advanceTimersByTime(3000)
    })

    expect(result.current.typingUsers).toEqual([])
  })

  it('sends messages, marks reads, loads older history, and reconnects', async () => {
    const { result } = renderHook(() =>
      useDmChat({
        conversationId: 'conversation-1',
        token: 'token-1',
        userId: 'user-1',
        apiUrl: 'http://api.test',
      }),
    )

    act(() => {
      socket.connected = true
      socket.trigger('connect')
    })

    await waitFor(() => expect(result.current.messages[0]?.id).toBe('initial-dm'))

    await expect(result.current.sendMessage('  hello  ')).resolves.toBe(true)
    expect(result.current.lastError).toBeNull()

    act(() => {
      jest.advanceTimersByTime(5000)
    })

    expect(result.current.lastError).toBeNull()

    act(() => {
      result.current.sendTyping()
      result.current.markAsRead()
      result.current.loadMore()
    })

    await waitFor(() => expect(result.current.messages[0]?.id).toBe('older-dm'))

    expect(socket.emitted).toEqual(
      expect.arrayContaining([
        {
          event: 'dm:message',
          payload: { conversationId: 'conversation-1', content: 'hello' },
        },
        { event: 'dm:typing', payload: { conversationId: 'conversation-1' } },
        { event: 'dm:read', payload: { conversationId: 'conversation-1' } },
        {
          event: 'dm:history',
          payload: {
            conversationId: 'conversation-1',
            cursor: '2026-04-17T10:00:00.000Z',
          },
        },
      ]),
    )

    act(() => {
      socket.connected = false
      result.current.reconnect()
    })

    expect(result.current.connectionState).toBe('reconnecting')
    expect(socket.connect).toHaveBeenCalled()
  })

  it('handles disconnect states and send failures', async () => {
    const { result } = renderHook(() =>
      useDmChat({
        conversationId: 'conversation-1',
        token: 'token-1',
        userId: 'user-1',
        apiUrl: 'http://api.test',
      }),
    )

    act(() => {
      socket.trigger('disconnect', 'transport close')
    })

    expect(result.current.connectionState).toBe('reconnecting')

    act(() => {
      socket.triggerIo('reconnect_failed')
    })

    expect(result.current.connectionState).toBe('offline')

    let emptySendResult = true
    await act(async () => {
      emptySendResult = await result.current.sendMessage('')
    })
    expect(emptySendResult).toBe(false)
    expect(result.current.lastError).toBe('send_error')

    socket.emit.mockImplementationOnce((event: string, payload: any, ack?: AckHandler) => {
      socket.emitted.push({ event, payload })
      ack?.({ ok: false, error: 'blocked' })
      return socket
    })

    act(() => {
      socket.connected = true
    })

    let failedSendResult = true
    await act(async () => {
      failedSendResult = await result.current.sendMessage('hello')
    })
    expect(failedSendResult).toBe(false)
    expect(result.current.lastError).toBe('send_error')
  })
})
