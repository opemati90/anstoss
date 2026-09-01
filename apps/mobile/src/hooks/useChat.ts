import { useCallback, useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { CHAT, type MessageAttachmentMeta, type PinnedMessage } from '@anstoss/shared'
import { getE2ESession } from '../e2e/session'
import { buildE2EChatMessages } from '../e2e/chatSeed'

export type ChatMessageType =
  'TEXT' | 'VOICE' | 'IMAGE' | 'VIDEO' | 'FILE' | 'POLL' | 'RSVP_POLL' | 'LINEUP' | 'SYSTEM'

export type ChatReactionAggregate = {
  emoji: string
  count: number
  userIds: string[]
}

export type ChatMessage = {
  id: string
  teamId: string
  clientMessageId?: string | null
  senderId: string | null
  senderName: string | null
  senderAvatar?: string | null
  content: string
  sourceLanguage?: string | null
  /**
   * Server-provided translation of `content` into the reader's preferred
   * language. Null when source matches target or when LibreTranslate is
   * unavailable. UI shows the translated text by default with a subtle
   * "Übersetzt aus {source}" footer + tap-to-toggle original.
   */
  translation?: { content: string; sourceLanguage: string } | null
  messageType?: ChatMessageType
  attachmentUrl?: string | null
  attachmentMeta?: MessageAttachmentMeta | null
  replyToId?: string | null
  replyTo?: {
    id: string
    senderName: string
    contentPreview: string
    messageType: ChatMessageType
  } | null
  reactions?: ChatReactionAggregate[]
  readByMe?: boolean
  readCount?: number
  isAnnouncement?: boolean
  isPinned?: boolean
  editedAt?: string | null
  deletedAt?: string | null
  createdAt: string
}

export type ConnectionState = 'connected' | 'reconnecting' | 'offline'

type UseChatOptions = {
  clubId: string
  teamId: string
  /** Optional channel scope. When omitted the hook reads/writes the
   * team-wide General stream (messages with null channelId). When
   * set, the gateway filters history + tags new messages with this
   * channelId so the rail's Coaches/Announcements/Parents views show
   * only their own messages. */
  channelId?: string | null
  token: string | null
  userId: string
  apiUrl: string
}

type PendingOutgoingMessage = {
  key: string
  clientMessageId: string
  delivered: boolean
}

const chatMessagesCache = new Map<string, ChatMessage[]>()

function getHistoryCacheKey(userId: string, teamId: string, channelId: string | null | undefined) {
  return `${userId}:${teamId}:${channelId ?? 'team'}`
}

type ChatHistoryResponse = {
  event?: string
  data?: {
    messages?: ChatMessage[]
    hasMore?: boolean
    message?: string
  }
}

function normalizeMessageSendAck(args: unknown[]): { error: Error | null; response: ChatHistoryResponse | null } {
  const first = args[0]
  const second = args[1]

  if (args.length >= 2) {
    return {
      error: first as Error | null,
      response: second as ChatHistoryResponse | null,
    }
  }

  if (first instanceof Error || typeof first === 'string') {
    return {
      error: first instanceof Error ? first : new Error(String(first)),
      response: null,
    }
  }

  if (first && typeof first === 'object' && ('event' in first || 'ok' in first || 'data' in first)) {
    return { error: null, response: first as ChatHistoryResponse }
  }

  return { error: null, response: null }
}

export function useChat({ clubId, teamId, channelId, token, userId, apiUrl }: UseChatOptions) {
  const cacheKey = getHistoryCacheKey(userId, teamId, channelId)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [pinnedMessage, setPinnedMessage] = useState<PinnedMessage | null>(null)
  const [connectionState, setConnectionState] = useState<ConnectionState>('offline')
  const [lastError, setLastError] = useState<string | null>(null)
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [messagesOwnerKey, setMessagesOwnerKey] = useState(cacheKey)

  const socketRef = useRef<Socket | null>(null)
  const typingTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map())
  const isAtBottomRef = useRef(true)
  const pendingOutgoingRef = useRef<PendingOutgoingMessage[]>([])

  const completePendingOutgoing = useCallback(
    (key: string, ok: boolean) => {
      const pending = pendingOutgoingRef.current.find((item) => item.key === key)
      pendingOutgoingRef.current = pendingOutgoingRef.current.filter((item) => item.key !== key)
      if (ok || pending?.delivered) {
        setLastError(null)
        return true
      }
      setLastError('send_error')
      return false
    },
    [],
  )

  const markPendingDelivered = useCallback((clientMessageId: string | null | undefined) => {
    if (!clientMessageId) return false
    const pending = pendingOutgoingRef.current.find(
      (item) => !item.delivered && item.clientMessageId === clientMessageId,
    )
    if (!pending) return false
    pending.delivered = true
    setLastError(null)
    return true
  }, [])

  useEffect(() => {
    const cached = chatMessagesCache.get(cacheKey)
    setMessages(cached ?? [])
    setMessagesOwnerKey(cacheKey)
  }, [cacheKey])

  useEffect(() => {
    if (messagesOwnerKey !== cacheKey) return
    chatMessagesCache.set(cacheKey, messages)
  }, [cacheKey, messages, messagesOwnerKey])

  const loadHistory = useCallback(() => {
    const socket = socketRef.current
    if (!socket?.connected) return

    socket.emit(
      'history',
      { teamId, channelId: channelId ?? null },
      (response: ChatHistoryResponse) => {
        if (response?.event === 'error') {
          if (__DEV__) console.warn('Chat history error:', response.data?.message)
          return
        }
        if (response?.data?.messages) {
          setMessages(response.data.messages)
          setMessagesOwnerKey(cacheKey)
          setHasMore(response.data.hasMore ?? false)
          if (channelId) socket.emit('markChannelRead', { teamId, channelId })
        }
      },
    )
  }, [teamId, channelId])

  // Connect socket
  useEffect(() => {
    if (!token || !teamId) return

    // E2E / demo: chat history streams over Socket.io, which the request mock
    // does not intercept. Short-circuit to a seeded conversation so the Chat
    // tab shows a live team thread instead of the empty state.
    if (getE2ESession()) {
      setConnectionState('connected')
      setMessages(buildE2EChatMessages(teamId, channelId ?? null, userId ?? null))
      setHasMore(false)
      setLoadingHistory(false)
      return
    }

    const socket = io(`${apiUrl}/chat`, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: CHAT.RECONNECT_BACKOFF[0],
      reconnectionDelayMax: CHAT.RECONNECT_BACKOFF[CHAT.RECONNECT_BACKOFF.length - 1],
      transports: ['websocket'],
    })

    socketRef.current = socket

    socket.on('connect', () => {
      setConnectionState('connected')
      setLastError(null)
      socket.emit('join', { teamId })
      loadHistory()
    })

    socket.on('disconnect', () => {
      setConnectionState('offline')
    })

    socket.on('connect_error', (err) => {
      setConnectionState('offline')
      setLastError('connect_error')
      if (__DEV__) console.warn('[Chat] connect_error:', err?.message || err)
      // Refresh auth token for next reconnection attempt
      if (token) {
        socket.auth = { token }
      }
    })

    socket.io.on('reconnect_attempt', () => {
      setConnectionState('reconnecting')
    })

    // Source-language detection result — patches message so translation
    // becomes available without the user needing to reload history.
    socket.on(
      'message:source',
      ({ messageId, sourceLanguage }: { messageId: string; sourceLanguage: string }) => {
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, sourceLanguage } : m)))
      },
    )

    // Incoming message
    socket.on('message', (msg: ChatMessage) => {
      // Dedupe by id: the gateway echoes the sender's own message back to the
      // whole room (no sender exclusion), and reconnect can replay; without
      // this guard the same message could render twice.
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
      if (msg.senderId === userId) {
        markPendingDelivered(msg.clientMessageId)
      }

      if (!isAtBottomRef.current && msg.senderId !== userId) {
        setUnreadCount((c) => c + 1)
      } else if (channelId && msg.senderId !== userId) {
        // User is looking at the bottom of this channel — clear its server-side
        // unread so the rail badge doesn't keep climbing for a thread they're
        // actively reading.
        socket.emit('markChannelRead', { teamId, channelId })
      }
    })

    // REST-mutation broadcasts (reactions, edits, deletes, media posts).
    socket.on(
      'chat:event',
      (payload: { kind: string; message?: ChatMessage; messageId?: string }) => {
        if (!payload?.message) return
        const next = payload.message
        if (payload.kind === 'media') {
          setMessages((prev) => (prev.some((m) => m.id === next.id) ? prev : [...prev, next]))
          if (!isAtBottomRef.current && next.senderId !== userId) {
            setUnreadCount((c) => c + 1)
          }
          return
        }
        setMessages((prev) => prev.map((m) => (m.id === next.id ? { ...m, ...next } : m)))
      },
    )

    // Typing indicator
    socket.on('typing', (data: { userId: string; userName: string }) => {
      if (data.userId === userId) return

      setTypingUsers((prev) => (prev.includes(data.userName) ? prev : [...prev, data.userName]))

      // Clear existing timeout for this user
      const existing = typingTimeoutsRef.current.get(data.userId)
      if (existing) clearTimeout(existing)

      const timeout = setTimeout(() => {
        setTypingUsers((prev) => prev.filter((n) => n !== data.userName))
        typingTimeoutsRef.current.delete(data.userId)
      }, CHAT.TYPING_TIMEOUT_MS)

      typingTimeoutsRef.current.set(data.userId, timeout)
    })

    return () => {
      socket.emit('leave', { teamId })
      socket.disconnect()
      socketRef.current = null
      // Clear all typing timeouts
      typingTimeoutsRef.current.forEach((t) => clearTimeout(t))
      typingTimeoutsRef.current.clear()
    }
    // channelId in deps: switching channels should rewire the
    // history fetch to the new scope; reconnecting the socket on
    // every switch is fine (cheap) and simpler than threading channel
    // changes through the existing connected socket.
  }, [token, teamId, channelId, apiUrl, userId, loadHistory, markPendingDelivered])

  useEffect(() => {
    if (!token || !clubId || !teamId) return

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 12000)

    fetch(`${apiUrl}/clubs/${clubId}/teams/${teamId}/messages/pinned`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then((response) => {
        clearTimeout(timeoutId)
        if (!response.ok) return null
        return response.json()
      })
      .then((message) => {
        setPinnedMessage(message ?? null)
      })
      .catch(() => {
        clearTimeout(timeoutId)
        setPinnedMessage(null)
      })
  }, [apiUrl, clubId, teamId, token])

  // Send message
  const sendMessage = useCallback(
    (content: string, clubId: string, replyToId?: string | null): Promise<boolean> => {
      const socket = socketRef.current
      const trimmed = content.trim()

      if (!trimmed) {
        return Promise.resolve(false)
      }

      const e2eSession = getE2ESession()
      if (e2eSession) {
        const createdAt = new Date().toISOString()
        setMessages((prev) => [
          ...prev,
          {
            id: `e2e-local-${Date.now().toString(36)}`,
            teamId,
            senderId: userId,
            senderName: e2eSession.user.name,
            senderAvatar: e2eSession.user.avatarUrl,
            content: trimmed,
            sourceLanguage: null,
            translation: null,
            messageType: 'TEXT',
            attachmentUrl: null,
            attachmentMeta: null,
            replyToId: replyToId ?? null,
            replyTo: null,
            reactions: [],
            readByMe: true,
            readCount: 1,
            isAnnouncement: false,
            isPinned: false,
            editedAt: null,
            deletedAt: null,
            createdAt,
          },
        ])
        return Promise.resolve(true)
      }

      if (!socket?.connected) {
        setLastError('offline')
        return Promise.resolve(false)
      }

      setLastError(null)

      return new Promise((resolve) => {
        const pendingKey = `${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`
        const clientMessageId = `cm_${pendingKey}`
        pendingOutgoingRef.current.push({
          key: pendingKey,
          clientMessageId,
          delivered: false,
        })
        socket.timeout(5000).emit(
          'message',
          {
            teamId,
            clubId,
            content: trimmed,
            clientMessageId,
            channelId: channelId ?? null,
            ...(replyToId ? { replyToId } : {}),
          },
          (...args: unknown[]) => {
            const { error, response } = normalizeMessageSendAck(args)
            if (error) {
              resolve(completePendingOutgoing(pendingKey, false))
              return
            }

            if (response?.event === 'error') {
              resolve(completePendingOutgoing(pendingKey, false))
              return
            }

            resolve(completePendingOutgoing(pendingKey, true))
          },
        )
      })
    },
    [teamId, channelId, userId, completePendingOutgoing],
  )

  // Send typing indicator
  const sendTyping = useCallback(() => {
    socketRef.current?.emit('typing', { teamId })
  }, [teamId])

  // Load more history
  const loadMore = useCallback(() => {
    const socket = socketRef.current
    if (!socket?.connected || !hasMore || loadingHistory) return

    setLoadingHistory(true)
    const oldest = messages[0]
    const cursor = oldest?.createdAt

    socket.emit(
      'history',
      { teamId, channelId: channelId ?? null, cursor },
      (response: { data: { messages: ChatMessage[]; hasMore: boolean } }) => {
        if (response?.data) {
          setMessages((prev) => [...response.data.messages, ...prev])
          setHasMore(response.data.hasMore)
        }
        setLoadingHistory(false)
      },
    )
  }, [teamId, channelId, hasMore, loadingHistory, messages])

  // Track scroll position
  const setIsAtBottom = useCallback(
    (atBottom: boolean) => {
      isAtBottomRef.current = atBottom
      if (atBottom) {
        setUnreadCount(0)
        // Scrolling to the bottom = caught up; clear the server-side unread too.
        if (channelId) socketRef.current?.emit('markChannelRead', { teamId, channelId })
      }
    },
    [teamId, channelId],
  )

  // Search messages
  const searchMessages = useCallback(
    (query: string): Promise<ChatMessage[]> => {
      const socket = socketRef.current
      if (!socket?.connected || !query.trim()) return Promise.resolve([])

      return new Promise((resolve) => {
        socket.emit(
          'search',
          { teamId, query: query.trim() },
          (response: { data?: ChatMessage[] }) => {
            resolve(response?.data || [])
          },
        )
      })
    },
    [teamId],
  )

  // REST mutations layered on top of the realtime gateway.
  const callRest = useCallback(
    async (path: string, init?: { method?: string; body?: unknown }) => {
      if (!token) return null
      // E2E/demo has no reachable backend; hitting it makes fetch reject. The
      // reaction/edit/delete handlers don't await this, so an unhandled
      // rejection would red-screen the app. Short-circuit in demo, and wrap the
      // real call so a network blip degrades to a no-op instead of a crash.
      if (getE2ESession()) return null
      try {
        const res = await fetch(`${apiUrl}${path}`, {
          method: init?.method ?? 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: init?.body ? JSON.stringify(init.body) : undefined,
        })
        if (!res.ok) return null
        const text = await res.text()
        return text ? (JSON.parse(text) as ChatMessage) : null
      } catch {
        return null
      }
    },
    [apiUrl, token],
  )

  const patchMessage = useCallback((next: ChatMessage | null) => {
    if (!next) return
    setMessages((prev) => prev.map((m) => (m.id === next.id ? { ...m, ...next } : m)))
  }, [])

  const reactToMessage = useCallback(
    async (messageId: string, emoji: string) => {
      const updated = await callRest(`/messages/${messageId}/reactions`, {
        body: { emoji },
      })
      patchMessage(updated)
    },
    [callRest, patchMessage],
  )

  const unreactToMessage = useCallback(
    async (messageId: string, emoji: string) => {
      const updated = await callRest(
        `/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
        { method: 'DELETE' },
      )
      patchMessage(updated)
    },
    [callRest, patchMessage],
  )

  const editMessage = useCallback(
    async (messageId: string, content: string) => {
      const updated = await callRest(`/messages/${messageId}`, {
        method: 'PATCH',
        body: { content },
      })
      patchMessage(updated)
    },
    [callRest, patchMessage],
  )

  const deleteMessage = useCallback(
    async (messageId: string) => {
      const updated = await callRest(`/messages/${messageId}`, {
        method: 'DELETE',
      })
      patchMessage(updated)
    },
    [callRest, patchMessage],
  )

  const sendMediaMessage = useCallback(
    async (input: {
      messageType: 'VOICE' | 'IMAGE' | 'VIDEO' | 'FILE'
      attachmentUrl: string
      attachmentMeta?: Record<string, unknown>
      content?: string
      replyToId?: string
    }): Promise<boolean> => {
      if (!token) return false
      try {
        const res = await fetch(`${apiUrl}/teams/${teamId}/messages/media`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          // Include the active channelId so media lands in the selected
          // channel (and broadcasts to its channel room). Without it the
          // post is saved null-channel and leaks to the whole team.
          body: JSON.stringify({ ...input, channelId: channelId ?? null }),
        })
        if (!res.ok) return false
        const created = (await res.json()) as ChatMessage
        // Append locally; Socket gateway has no broadcast hook for REST-posted
        // messages yet (see follow-up commit), so other clients refresh on
        // next history fetch.
        setMessages((prev) => [...prev, created])
        return true
      } catch {
        return false
      }
    },
    [apiUrl, teamId, token, channelId],
  )

  const fetchPollForMessage = useCallback(
    async (
      messageId: string,
    ): Promise<{
      id: string
      question: string
      multiSelect: boolean
      closesAt: string | null
      closedAt: string | null
      totalVotes: number
      options: Array<{ id: string; label: string; votes: number }>
      myVoteOptionIds: string[]
    } | null> => {
      if (!token) return null
      try {
        const res = await fetch(`${apiUrl}/messages/${messageId}/poll`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return null
        return (await res.json()) as Awaited<ReturnType<typeof fetchPollForMessage>>
      } catch {
        return null
      }
    },
    [apiUrl, token],
  )

  const fetchPoll = useCallback(
    async (
      pollId: string,
    ): Promise<{
      id: string
      question: string
      multiSelect: boolean
      closesAt: string | null
      closedAt: string | null
      totalVotes: number
      options: Array<{ id: string; label: string; votes: number }>
      myVoteOptionIds: string[]
    } | null> => {
      if (!token) return null
      try {
        const res = await fetch(`${apiUrl}/polls/${pollId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return null
        return (await res.json()) as Awaited<ReturnType<typeof fetchPoll>>
      } catch {
        return null
      }
    },
    [apiUrl, token],
  )

  const votePollOption = useCallback(
    async (pollId: string, optionId: string): Promise<void> => {
      if (!token) return
      await fetch(`${apiUrl}/polls/${pollId}/vote`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ optionId }),
      })
    },
    [apiUrl, token],
  )

  const refreshHistory = useCallback(() => {
    const socket = socketRef.current
    if (!socket?.connected) return
    socket.emit(
      'history',
      { teamId, channelId: channelId ?? null },
      (response: {
        event?: string
        data: { messages?: ChatMessage[]; hasMore?: boolean; message?: string }
      }) => {
        if (response?.data?.messages) {
          setMessages(response.data.messages)
          setMessagesOwnerKey(cacheKey)
          setHasMore(response.data.hasMore ?? false)
        }
      },
    )
  }, [teamId, channelId])

  return {
    messages,
    pinnedMessage,
    connectionState,
    lastError,
    typingUsers,
    hasMore,
    loadingHistory,
    unreadCount,
    sendMessage,
    sendTyping,
    loadMore,
    setIsAtBottom,
    searchMessages,
    refreshHistory,
    reactToMessage,
    unreactToMessage,
    editMessage,
    deleteMessage,
    fetchPollForMessage,
    fetchPoll,
    votePollOption,
    sendMediaMessage,
  }
}
