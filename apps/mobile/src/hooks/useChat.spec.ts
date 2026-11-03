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
  channelId: overrides.channelId ?? null,
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
        json: () => Promise.resolve(makeMessage({ id: 'pinned', isPinned: true, channelId: 'ch-1' })),
      }),
    ) as jest.Mock
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
    global.fetch = originalFetch
  })

  it('preserves messages and pagination when loading older history fails', async () => {
    const { result } = renderHook(() => useChat({ clubId: 'club-1', teamId: 'team-1', channelId: 'error-page', token: 'token-1', userId: 'user-1', apiUrl: 'http://api.test' }))
    act(() => { socket.connected = true; socket.trigger('connect') })
    await waitFor(() => expect(result.current.messages).toHaveLength(1))
    const before = result.current.messages
    socket.emit.mockImplementation((event: string, _data: unknown, ack?: AckHandler) => {
      if (event === 'history') ack?.({ event: 'error', data: { message: 'Unavailable' } })
      return socket
    })
    act(() => { result.current.loadMore() })
    expect(result.current.messages).toEqual(before)
    expect(result.current.hasMore).toBe(true)
    expect(result.current.loadingHistory).toBe(false)
    expect(result.current.lastError).toBe('history_error')
  })

  it('connects, loads history, fetches pinned message, and cleans up', async () => {
    const { result, unmount } = renderHook(() =>
      useChat({
        clubId: 'club-1',
        teamId: 'team-1',
        channelId: 'ch-1',
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
        { event: 'history', payload: { teamId: 'team-1', channelId: 'ch-1' } },
      ]),
    )
    expect(global.fetch).toHaveBeenCalledWith(
      // M5: the pin is asked for one channel.
      'http://api.test/clubs/club-1/teams/team-1/messages/pinned?channelId=ch-1',
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
        channelId: 'ch-1',
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

  it('deduplicates recovered media without inflating unread counts', () => {
    const { result } = renderHook(() => useChat({ clubId: 'club-1', teamId: 'team-1', channelId: 'ch-1',
      token: 'token-1', userId: 'user-1', apiUrl: 'http://api.test' }))
    const message = makeMessage({ id: 'recovered-media', senderId: 'user-2' })
    act(() => {
      result.current.setIsAtBottom(false)
      socket.trigger('chat:event', { kind: 'media', message })
      socket.trigger('chat:event', { kind: 'media-recovered', message })
      socket.trigger('chat:event', { kind: 'media-recovered', message })
    })
    expect(result.current.messages.filter((item) => item.id === message.id)).toHaveLength(1)
    expect(result.current.unreadCount).toBe(1)
  })

  it('counts a genuinely new recovered message once while scrolled away', () => {
    const { result } = renderHook(() => useChat({ clubId: 'club-1', teamId: 'team-1', channelId: 'recover-new',
      token: 'token-1', userId: 'user-1', apiUrl: 'http://api.test' }))
    const message = makeMessage({ id: 'recovered-new', senderId: 'user-2' })
    act(() => {
      result.current.setIsAtBottom(false)
      socket.trigger('chat:event', { kind: 'media-recovered', message })
      socket.trigger('chat:event', { kind: 'media-recovered', message })
    })
    expect(result.current.messages.filter((item) => item.id === message.id)).toHaveLength(1)
    expect(result.current.unreadCount).toBe(1)
  })

  it('keeps a live message arriving before the initial history response', () => {
    let historyAck!: AckHandler
    socket.emit.mockImplementation((event: string, _payload: unknown, ack?: AckHandler) => {
      if (event === 'history' && ack) historyAck = ack
      return socket
    })
    const { result } = renderHook(() => useChat({ clubId: 'club-1', teamId: 'team-1', channelId: 'history-race',
      token: 'token-1', userId: 'user-1', apiUrl: 'http://api.test' }))
    const message = makeMessage({ id: 'live-during-history', channelId: 'history-race', senderId: 'user-2' })
    act(() => {
      socket.connected = true
      socket.trigger('connect')
      result.current.setIsAtBottom(false)
      socket.trigger('chat:event', { kind: 'media', message })
      historyAck({ data: { messages: [makeMessage({ id: 'history-only' })], hasMore: false } })
      socket.trigger('chat:event', { kind: 'media-recovered', message })
    })
    expect(result.current.messages.map((item) => item.id)).toEqual(['history-only', 'live-during-history'])
    expect(result.current.unreadCount).toBe(1)
  })

  it('keeps a REST-created message when an older history response arrives', () => {
    let historyAck!: AckHandler
    socket.emit.mockImplementation((event: string, _payload: unknown, ack?: AckHandler) => {
      if (event === 'history' && ack) historyAck = ack
      return socket
    })
    const { result } = renderHook(() => useChat({ clubId: 'club-1', teamId: 'team-1', channelId: 'rest-race',
      token: 'token-1', userId: 'user-1', apiUrl: 'http://api.test' }))
    act(() => {
      socket.connected = true
      socket.trigger('connect')
      result.current.appendMessage(makeMessage({ id: 'rest-created', senderId: 'user-1' }))
      historyAck({ data: { messages: [makeMessage({ id: 'history-only' })], hasMore: false } })
    })
    expect(result.current.messages.map((item) => item.id)).toEqual(['history-only', 'rest-created'])
  })

  it('keeps an acknowledged text when history arrives after its acknowledgement', async () => {
    let historyAck!: AckHandler
    socket.emit.mockImplementation((event: string, _payload: unknown, ack?: AckHandler) => {
      if (event === 'history' && ack) historyAck = ack
      return socket
    })
    socket.timeout.mockReturnValue({ emit: (_event: string, payload: any, ack: (...args: unknown[]) => void) => {
      ack(null, { id: 'acked-text', clientMessageId: payload.clientMessageId })
    } })
    const { result } = renderHook(() => useChat({ clubId: 'club-1', teamId: 'team-1', channelId: 'ack-race',
      token: 'token-1', userId: 'user-1', apiUrl: 'http://api.test' }))
    act(() => { socket.connected = true; socket.trigger('connect') })
    await act(async () => { expect(await result.current.sendMessage('hello', 'club-1')).toBe(true) })
    act(() => historyAck({ data: { messages: [], hasMore: false } }))
    expect(result.current.messages.map((message) => message.id)).toContain('acked-text')
  })

  it('does not resurrect a deleted message when older history arrives', async () => {
    let staleAck!: AckHandler
    let requests = 0
    const original = makeMessage({ id: 'deleted-during-history', content: 'private old content' })
    socket.emit.mockImplementation((event: string, _payload: unknown, ack?: AckHandler) => {
      if (event === 'history' && ack) {
        requests++
        if (requests === 1) ack({ data: { messages: [original], hasMore: false } })
        else staleAck = ack
      }
      return socket
    })
    global.fetch = jest.fn((_url: string, init?: RequestInit) => Promise.resolve(init?.method === 'DELETE'
      ? { ok: true, text: async () => JSON.stringify({ ...original, content: '', deletedAt: '2026-04-20T00:00:00.000Z' }) }
      : { ok: true, json: async () => null })) as jest.Mock
    const { result } = renderHook(() => useChat({ clubId: 'club-1', teamId: 'team-1', channelId: 'delete-race',
      token: 'token-1', userId: 'user-1', apiUrl: 'http://api.test' }))
    act(() => { socket.connected = true; socket.trigger('connect'); result.current.refreshHistory() })
    await act(async () => { await result.current.deleteMessage(original.id) })
    act(() => staleAck({ data: { messages: [original], hasMore: false } }))
    expect(result.current.messages[0]).toMatchObject({ id: original.id, content: '', deletedAt: '2026-04-20T00:00:00.000Z' })
  })

  it('does not mark a delayed history response read when the user scrolled away', () => {
    let historyAck!: AckHandler
    socket.emit.mockImplementation((event: string, _payload: unknown, ack?: AckHandler) => {
      if (event === 'history' && ack) historyAck = ack
      return socket
    })
    const { result } = renderHook(() => useChat({ clubId: 'club-1', teamId: 'team-1', channelId: 'history-away',
      token: 'token-1', userId: 'user-1', apiUrl: 'http://api.test' }))
    act(() => {
      socket.connected = true
      socket.trigger('connect')
      result.current.setIsAtBottom(false)
      historyAck({ data: { messages: [], hasMore: false } })
    })
    expect(socket.emit).not.toHaveBeenCalledWith('markChannelRead', expect.anything())
  })

  it('orders recovered older media before newer messages', () => {
    const { result } = renderHook(() => useChat({ clubId: 'club-1', teamId: 'team-1', channelId: 'recovery-order',
      token: 'token-1', userId: 'user-1', apiUrl: 'http://api.test' }))
    act(() => {
      socket.trigger('chat:event', { kind: 'media', message: makeMessage({ id: 'newer', createdAt: '2026-04-18T10:00:00.000Z' }) })
      socket.trigger('chat:event', { kind: 'media-recovered', message: makeMessage({ id: 'older', createdAt: '2026-04-17T10:00:00.000Z' }) })
    })
    expect(result.current.messages.map((message) => message.id)).toEqual(['older', 'newer'])
  })

  it('marks genuinely new recovered media read while at the bottom', () => {
    renderHook(() => useChat({ clubId: 'club-1', teamId: 'team-1', channelId: 'bottom-recovery',
      token: 'token-1', userId: 'user-1', apiUrl: 'http://api.test' }))
    act(() => socket.trigger('chat:event', { kind: 'media-recovered', message: makeMessage({ id: 'new-at-bottom' }) }))
    expect(socket.emit).toHaveBeenCalledWith('markChannelRead', { teamId: 'team-1', channelId: 'bottom-recovery' })
  })

  it('ignores an old channel history response after switching channels', () => {
    let oldAck!: AckHandler
    socket.emit.mockImplementation((event: string, _payload: unknown, ack?: AckHandler) => {
      if (event === 'history' && ack) oldAck = ack
      return socket
    })
    const nextSocket = createSocket()
    mockIo.mockReturnValueOnce(socket).mockReturnValueOnce(nextSocket)
    const { result, rerender } = renderHook(({ channel }: { channel: string }) => useChat({ clubId: 'club-1', teamId: 'team-1',
      channelId: channel, token: 'token-1', userId: 'user-1', apiUrl: 'http://api.test' }),
    { initialProps: { channel: 'old-channel' } })
    act(() => {
      socket.connected = true
      socket.trigger('connect')
      result.current.setIsAtBottom(false)
      socket.trigger('chat:event', { kind: 'media', message: makeMessage({ id: 'old-live' }) })
    })
    expect(result.current.unreadCount).toBe(1)
    rerender({ channel: 'new-channel' })
    act(() => {
      oldAck({ data: { messages: [makeMessage({ id: 'stale-old' })], hasMore: false } })
    })
    expect(result.current.messages.some((message) => message.id === 'stale-old')).toBe(false)
    expect(result.current.unreadCount).toBe(0)
  })

  it('clears old-channel typing when switching channels', () => {
    const nextSocket = createSocket()
    mockIo.mockReturnValueOnce(socket).mockReturnValueOnce(nextSocket)
    const { result, rerender } = renderHook(({ channel }: { channel: string }) => useChat({ clubId: 'club-1', teamId: 'team-1',
      channelId: channel, token: 'token-1', userId: 'user-1', apiUrl: 'http://api.test' }),
    { initialProps: { channel: 'typing-old' } })
    act(() => socket.trigger('typing', { userId: 'user-2', userName: 'Mina', channelId: 'typing-old' }))
    expect(result.current.typingUsers).toEqual(['Mina'])
    rerender({ channel: 'typing-new' })
    expect(result.current.typingUsers).toEqual([])
  })

  it('reports a saved media send as successful without appending it to a switched channel', async () => {
    let finish!: (value: unknown) => void
    const pending = new Promise((resolve) => { finish = resolve })
    global.fetch = jest.fn((url: string) => url.endsWith('/messages/media') ? pending : Promise.resolve({
      ok: true, json: () => Promise.resolve(null),
    })) as jest.Mock
    const nextSocket = createSocket()
    mockIo.mockReturnValueOnce(socket).mockReturnValueOnce(nextSocket)
    const { result, rerender } = renderHook(({ channel }: { channel: string }) => useChat({ clubId: 'club-1', teamId: 'team-1',
      channelId: channel, token: 'token-1', userId: 'user-1', apiUrl: 'http://api.test' }),
    { initialProps: { channel: 'send-old' } })
    let sent!: Promise<boolean>
    act(() => { sent = result.current.sendMediaMessage({ messageType: 'IMAGE', attachmentUrl: 'https://example.invalid/a' }) })
    rerender({ channel: 'send-new' })
    let success = false
    await act(async () => {
      finish({ ok: true, json: async () => makeMessage({ id: 'saved-old', channelId: 'send-old' }) })
      success = await sent
    })
    expect(success).toBe(true)
    expect(result.current.messages.some((message) => message.id === 'saved-old')).toBe(false)
  })

  it.each(['loadMore', 'refreshHistory'] as const)('ignores a stale %s response after switching channels', (method) => {
    let oldAck!: AckHandler
    let histories = 0
    socket.emit.mockImplementation((event: string, _payload: unknown, ack?: AckHandler) => {
      if (event === 'history' && ack) {
        histories++
        if (histories === 1) ack({ data: { messages: [makeMessage({ id: 'old-initial' })], hasMore: true } })
        else oldAck = ack
      }
      return socket
    })
    const nextSocket = createSocket()
    mockIo.mockReturnValueOnce(socket).mockReturnValueOnce(nextSocket)
    const { result, rerender } = renderHook(({ channel }: { channel: string }) => useChat({ clubId: 'club-1', teamId: 'team-1',
      channelId: channel, token: 'token-1', userId: 'user-1', apiUrl: 'http://api.test' }),
    { initialProps: { channel: `old-${method}` } })
    act(() => { socket.connected = true; socket.trigger('connect') })
    act(() => result.current[method]())
    expect(oldAck).toBeDefined()
    rerender({ channel: `new-${method}` })
    act(() => oldAck({ data: { messages: [makeMessage({ id: 'stale-page' })], hasMore: false } }))
    expect(result.current.messages.some((message) => message.id === 'stale-page')).toBe(false)
    expect(result.current.loadingHistory).toBe(false)
  })

  it('clears pending pagination when a token change replaces the socket', () => {
    let pageAck!: AckHandler
    socket.emit.mockImplementation((event: string, _payload: unknown, ack?: AckHandler) => {
      if (event === 'history' && ack) {
        if (!pageAck) { pageAck = ack; ack({ data: { messages: [makeMessage({ id: 'initial-token' })], hasMore: true } }) }
        else pageAck = ack
      }
      return socket
    })
    const nextSocket = createSocket()
    mockIo.mockReturnValueOnce(socket).mockReturnValueOnce(nextSocket)
    const { result, rerender } = renderHook(({ token }: { token: string }) => useChat({ clubId: 'club-1', teamId: 'team-1',
      channelId: 'same-channel', token, userId: 'user-1', apiUrl: 'http://api.test' }),
    { initialProps: { token: 'token-1' } })
    act(() => { socket.connected = true; socket.trigger('connect') })
    act(() => result.current.loadMore())
    expect(result.current.loadingHistory).toBe(true)
    rerender({ token: 'token-2' })
    expect(result.current.loadingHistory).toBe(false)
    act(() => pageAck({ data: { messages: [makeMessage({ id: 'stale-token-page' })], hasMore: false } }))
    expect(result.current.messages.some((message) => message.id === 'stale-token-page')).toBe(false)
  })

  it('treats a self echo as delivery even when the ack says failed', async () => {
    const { result } = renderHook(() =>
      useChat({
        clubId: 'club-1',
        teamId: 'team-1',
        channelId: 'ch-1',
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

  it('promotes an optimistic message to the server id when send ack succeeds without a room echo', async () => {
    const { result } = renderHook(() =>
      useChat({
        clubId: 'club-1',
        teamId: 'team-1',
        channelId: 'ch-1',
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
        ack(null, { id: 'server-msg-1', clientMessageId: payload.clientMessageId })
      },
    })

    let delivered = false
    await act(async () => {
      delivered = await result.current.sendMessage('No echo path', 'club-1')
    })

    expect(delivered).toBe(true)
    expect(result.current.lastError).toBeNull()
    expect(result.current.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'server-msg-1',
          senderId: 'user-1',
          content: 'No echo path',
        }),
      ]),
    )
    expect(result.current.messages.some((message) => message.id.startsWith('pending:'))).toBe(false)
  })

  it('sends, searches, refreshes, and loads older history through the socket', async () => {
    const { result } = renderHook(() =>
      useChat({
        clubId: 'club-1',
        teamId: 'team-1',
        channelId: 'ch-1',
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
    await waitFor(() =>
      expect(result.current.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: expect.stringMatching(/^pending:cm_/),
            senderId: 'user-1',
            content: 'Hi team',
            clientMessageId: expect.any(String),
          }),
        ]),
      ),
    )
    expect(socket.timeout).toHaveBeenCalledWith(5000)
    expect(socket.emitted).toEqual(
      expect.arrayContaining([
        {
          event: 'message',
          payload: expect.objectContaining({
            teamId: 'team-1',
            clubId: 'club-1',
            content: 'Hi team',
            channelId: 'ch-1',
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
        channelId: 'ch-1',
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
    expect(result.current.messages.some((message) => message.content === 'hello')).toBe(false)
    warnSpy.mockRestore()
  })

  it('L3: never sends or loads the legacy channel-less stream', async () => {
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
    let sent = true
    await act(async () => {
      sent = await result.current.sendMessage('hello', 'club-1')
    })
    expect(sent).toBe(false)
    expect(socket.emitted.some((e: { event: string }) => e.event === 'message')).toBe(false)
    expect(socket.emitted.some((e: { event: string }) => e.event === 'history')).toBe(false)
  })
})
