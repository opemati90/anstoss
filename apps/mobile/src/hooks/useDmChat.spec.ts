import { act, renderHook, waitFor } from '@testing-library/react-native'
import { useDmChat, type DmMessage } from './useDmChat'
import * as dmMedia from './dmMedia'

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
  clientMessageId: overrides.clientMessageId ?? null,
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

  it('preserves loaded messages and pagination after error acknowledgements', async () => {
    const { result } = renderHook(() => useDmChat({ token: 'token', userId: 'user-1', conversationId: 'error-history-conversation', apiUrl: 'https://api.example.test' }))
    act(() => { socket.connected = true; socket.trigger('connect') })
    await waitFor(() => expect(result.current.messages).toHaveLength(1))
    const before = result.current.messages
    socket.emit.mockImplementation((event: string, _payload: unknown, ack?: AckHandler) => {
      if (event === 'dm:history') ack?.({ event: 'error', data: { message: 'Unavailable' } })
      return socket
    })
    act(() => { socket.trigger('connect') })
    expect(result.current.messages).toEqual(before)
    expect(result.current.hasMore).toBe(true)
    act(() => { result.current.loadMore() })
    expect(result.current.messages).toEqual(before)
    expect(result.current.hasMore).toBe(true)
    expect(result.current.loadingHistory).toBe(false)
  })

  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    socket = createSocket()
    mockIo.mockReturnValue(socket)
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('keeps a live DM arriving before the history response', () => {
    let ack!: AckHandler
    socket.emit.mockImplementation((event: string, _payload: unknown, callback?: AckHandler) => {
      if (event === 'dm:history' && callback) ack = callback
      return socket
    })
    const { result } = renderHook(() => useDmChat({ conversationId: 'race-dm', token: 'token', userId: 'user-1', apiUrl: 'http://api.test' }))
    act(() => {
      socket.connected = true
      socket.trigger('connect')
      socket.trigger('dm:message', makeDm({ id: 'live-dm', conversationId: 'race-dm' }))
      ack({ data: { messages: [makeDm({ id: 'history-dm', conversationId: 'race-dm' })], hasMore: false } })
    })
    expect(result.current.messages.map((message) => message.id)).toEqual(['history-dm', 'live-dm'])
  })

  it('keeps an acknowledged DM and newer read receipt when older history arrives', async () => {
    let historyAck!: AckHandler
    socket.emit.mockImplementation((event: string, payload: any, callback?: AckHandler) => {
      if (event === 'dm:history' && callback) historyAck = callback
      if (event === 'dm:message' && callback) callback({ ok: true, id: 'acked-dm', clientMessageId: payload.clientMessageId })
      return socket
    })
    const { result } = renderHook(() => useDmChat({ conversationId: 'ack-race-dm', token: 'token', userId: 'user-1', apiUrl: 'http://api.test' }))
    act(() => { socket.connected = true; socket.trigger('connect') })
    await act(async () => { expect(await result.current.sendMessage('hello')).toBe(true) })
    act(() => {
      socket.trigger('dm:read', { userId: 'user-2', readAt: '2026-04-18T10:00:00.000Z' })
      historyAck({ data: { messages: [], hasMore: false, peerLastReadAt: '2026-04-17T10:00:00.000Z' } })
    })
    expect(result.current.messages.map((message) => message.id)).toContain('acked-dm')
    expect(result.current.peerLastReadAt).toBe('2026-04-18T10:00:00.000Z')
  })

  it('does not resurrect a deleted DM when older history arrives', async () => {
    let staleAck!: AckHandler
    let requests = 0
    const original = makeDm({ id: 'dm-delete-race', conversationId: 'dm-delete-conversation', content: 'old private content' })
    socket.emit.mockImplementation((event: string, _payload: unknown, callback?: AckHandler) => {
      if (event === 'dm:history' && callback) {
        requests++
        if (requests === 1) callback({ data: { messages: [original], hasMore: false } })
        else staleAck = callback
      }
      return socket
    })
    jest.spyOn(dmMedia, 'deleteDirectMessage').mockResolvedValue({ ...original, sender: null,
      content: '', deletedAt: '2026-04-20T00:00:00.000Z' } as any)
    const { result } = renderHook(() => useDmChat({ conversationId: 'dm-delete-conversation', clubId: 'club-1',
      token: 'token', userId: 'user-1', apiUrl: 'http://api.test' }))
    act(() => { socket.connected = true; socket.trigger('connect'); socket.trigger('connect') })
    await act(async () => { await result.current.deleteMessage(original.id) })
    act(() => staleAck({ data: { messages: [original], hasMore: false } }))
    expect(result.current.messages[0]).toMatchObject({ id: original.id, content: '', deletedAt: '2026-04-20T00:00:00.000Z' })
  })

  it('isolates delayed history, typing and read state after changing conversations', () => {
    let ack!: AckHandler
    socket.emit.mockImplementation((event: string, _payload: unknown, callback?: AckHandler) => {
      if (event === 'dm:history' && callback) ack = callback
      return socket
    })
    const next = createSocket()
    mockIo.mockReturnValueOnce(socket).mockReturnValueOnce(next)
    const { result, rerender } = renderHook(({ conversationId }: { conversationId: string }) => useDmChat({
      conversationId, token: 'token', userId: 'user-1', apiUrl: 'http://api.test' }),
    { initialProps: { conversationId: 'old-dm' } })
    act(() => {
      socket.connected = true; socket.trigger('connect')
      socket.trigger('dm:typing', { userId: 'user-2', userName: 'Mina', conversationId: 'old-dm' })
      socket.trigger('dm:read', { userId: 'user-2', readAt: '2026-01-01T00:00:00.000Z' })
    })
    expect(result.current.typingUsers).toEqual(['Mina'])
    rerender({ conversationId: 'new-dm' })
    act(() => {
      ack({ data: { messages: [makeDm({ id: 'old-secret', conversationId: 'old-dm' })], hasMore: false } })
      socket.trigger('dm:read', { userId: 'user-2', readAt: '2026-01-02T00:00:00.000Z' })
    })
    expect(result.current.messages.some((message) => message.id === 'old-secret')).toBe(false)
    expect(result.current.typingUsers).toEqual([])
    expect(result.current.peerLastReadAt).toBeNull()
    expect(result.current.hasMore).toBe(true)
  })

  it('returns success for an old DM send without exposing it in the new conversation', async () => {
    let resolve!: (value: any) => void
    jest.spyOn(dmMedia, 'postDirectMessage').mockImplementation(() => new Promise((done) => { resolve = done }))
    const next = createSocket()
    mockIo.mockReturnValueOnce(socket).mockReturnValueOnce(next)
    const { result, rerender } = renderHook(({ conversationId }: { conversationId: string }) => useDmChat({
      conversationId, clubId: 'club-1', token: 'token', userId: 'user-1', apiUrl: 'http://api.test' }),
    { initialProps: { conversationId: 'send-old-dm' } })
    let sent!: Promise<string>
    act(() => { sent = result.current.sendAttachment({ messageType: 'IMAGE', attachmentUrl: 'https://example.invalid/image' }) })
    rerender({ conversationId: 'send-new-dm' })
    let status = ''
    await act(async () => {
      resolve({ ok: true, message: { id: 'old-secret', conversationId: 'send-old-dm', senderId: 'user-1', content: '', createdAt: '2026-01-01T00:00:00.000Z' } })
      status = await sent
    })
    expect(status).toBe('ok')
    expect(result.current.messages.some((message) => message.id === 'old-secret')).toBe(false)
  })

  it('does not apply an old send failure to the newly opened conversation', async () => {
    let ack!: AckHandler
    socket.emit.mockImplementation((event: string, _payload: unknown, callback?: AckHandler) => {
      if (event === 'dm:message' && callback) ack = callback
      return socket
    })
    const next = createSocket()
    mockIo.mockReturnValueOnce(socket).mockReturnValueOnce(next)
    const { result, rerender } = renderHook(({ conversationId }: { conversationId: string }) => useDmChat({
      conversationId, token: 'token', userId: 'user-1', apiUrl: 'http://api.test' }),
    { initialProps: { conversationId: 'pending-old-dm' } })
    socket.connected = true
    let sent!: Promise<boolean>
    act(() => { sent = result.current.sendMessage('hello') })
    rerender({ conversationId: 'pending-new-dm' })
    await act(async () => { ack({ ok: false }); await sent })
    expect(result.current.lastError).toBeNull()
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

  it('treats a self echo as delivery even when the ack says failed', async () => {
    const { result } = renderHook(() =>
      useDmChat({
        conversationId: 'conversation-1',
        token: 'token-1',
        userId: 'user-1',
        apiUrl: 'http://api.test',
      }),
    )

    socket.emit.mockImplementationOnce((event: string, payload: any, ack?: AckHandler) => {
      socket.emitted.push({ event, payload })
      socket.trigger(
        'dm:message',
        makeDm({
          id: 'self-dm',
          senderId: 'user-1',
          content: 'hello',
          clientMessageId: payload.clientMessageId,
        }),
      )
      ack?.({ ok: false, error: 'delayed-ack' })
      return socket
    })

    act(() => {
      socket.connected = true
    })

    let delivered = false
    await act(async () => {
      delivered = await result.current.sendMessage('hello')
    })

    expect(delivered).toBe(true)
    expect(result.current.lastError).toBeNull()
  })

  it('promotes an optimistic DM to the server id when ack succeeds without room echo', async () => {
    const { result } = renderHook(() =>
      useDmChat({
        conversationId: 'conversation-1',
        token: 'token-1',
        userId: 'user-1',
        apiUrl: 'http://api.test',
      }),
    )

    socket.emit.mockImplementationOnce((event: string, payload: any, ack?: AckHandler) => {
      socket.emitted.push({ event, payload })
      ack?.({ ok: true, id: 'dm-server-1', clientMessageId: payload.clientMessageId })
      return socket
    })

    act(() => {
      socket.connected = true
    })

    let delivered = false
    await act(async () => {
      delivered = await result.current.sendMessage('hello no echo')
    })

    expect(delivered).toBe(true)
    expect(result.current.lastError).toBeNull()
    expect(result.current.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'dm-server-1',
          senderId: 'user-1',
          content: 'hello no echo',
        }),
      ]),
    )
    expect(result.current.messages.some((message) => message.id.startsWith('pending:'))).toBe(false)
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
          payload: expect.objectContaining({
            conversationId: 'conversation-1',
            content: 'hello',
            clientMessageId: expect.any(String),
          }),
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
