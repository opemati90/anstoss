import { useCallback, useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { bindSocketLifecycle } from '../lib/socketLifecycle'
import { CHAT, type MessageAttachmentMeta, type PinnedMessage } from '@anstoss/shared'
import { getE2ESession } from '../e2e/session'
import { notifyAccessChanged } from '../auth/accessChanges'
import { buildE2EChatMessages } from '../e2e/chatSeed'
import { useTypingPresence } from './useTypingPresence'

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
  channelId?: string | null
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

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'offline'

/** History has a nested Prisma sender; live broadcasts use flattened names. */
export function normalizeChatMessage(message: ChatMessage & { sender?: { name?: string | null; avatarUrl?: string | null } | null }): ChatMessage {
  return {
    ...message,
    senderName: message.senderName ?? message.sender?.name ?? null,
    senderAvatar: message.senderAvatar ?? message.sender?.avatarUrl ?? null,
  }
}

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
  id?: string
  clientMessageId?: string | null
  event?: string
  data?: {
    id?: string
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
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting')
  const [lastError, setLastError] = useState<string | null>(null)
  const { names: typingUsers, touch: touchTyping, remove: removeTyping, clear: clearTyping } = useTypingPresence(cacheKey, CHAT.TYPING_TIMEOUT_MS)
  const [hasMore, setHasMore] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [messagesOwnerKey, setMessagesOwnerKey] = useState(cacheKey)
  // True once the first history response (or error) for this scope landed,
  // so screens can tell "still loading" from "genuinely empty".
  const [historyLoaded, setHistoryLoaded] = useState(() => chatMessagesCache.has(cacheKey))

  const socketRef = useRef<Socket | null>(null)
  const accessGeneration = useRef(0)
  const scopeKey = JSON.stringify([clubId, teamId, channelId, userId, token, apiUrl])
  const scopeRef = useRef({ key: scopeKey })
  if (scopeRef.current.key !== scopeKey) {
    scopeRef.current = { key: scopeKey }
    accessGeneration.current += 1
  }
  const scope = scopeRef.current
  const mounted = useRef(true)
  const revoked = useRef(false)
  const renderGeneration = accessGeneration.current
  const isCurrent = useCallback((generation: number) => mounted.current &&
    scopeRef.current === scope && generation === accessGeneration.current && !revoked.current, [scope])
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; accessGeneration.current += 1 }
  }, [])
  const isAtBottomRef = useRef(true)
  const pendingOutgoingRef = useRef<PendingOutgoingMessage[]>([])

  const completePendingOutgoing = useCallback(
    (key: string, ok: boolean, response?: ChatHistoryResponse | null) => {
      const pending = pendingOutgoingRef.current.find((item) => item.key === key)
      pendingOutgoingRef.current = pendingOutgoingRef.current.filter((item) => item.key !== key)
      if (ok || pending?.delivered) {
        const serverId = response?.id ?? response?.data?.id
        const clientMessageId = response?.clientMessageId ?? pending?.clientMessageId
        if (serverId && clientMessageId) {
          setMessages((prev) =>
            prev.map((item) =>
              item.clientMessageId === clientMessageId && item.id.startsWith('pending:')
                ? { ...item, id: serverId }
                : item,
            ),
          )
        }
        setLastError(null)
        return true
      }
      if (pending?.clientMessageId) {
        setMessages((prev) =>
          prev.filter((item) => item.clientMessageId !== pending.clientMessageId),
        )
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
    setHistoryLoaded(Boolean(cached))
  }, [cacheKey])

  useEffect(() => {
    if (messagesOwnerKey !== cacheKey) return
    chatMessagesCache.set(cacheKey, messages)
  }, [cacheKey, messages, messagesOwnerKey])

  const loadHistory = useCallback(() => {
    const socket = socketRef.current
    if (!socket?.connected) return
    // L3: the legacy channel-less team stream is gone server-side; every
    // history/send/typing call names its channel.
    if (!channelId) {
      setHistoryLoaded(true)
      setLastError('channel_required')
      return
    }

    const generation = accessGeneration.current
    socket.emit(
      'history',
      { teamId, channelId },
      (response: ChatHistoryResponse) => {
        if (socketRef.current !== socket || !isCurrent(generation)) return
        setHistoryLoaded(true)
        if (response?.event === 'error') {
          if (__DEV__) console.warn('Chat history error:', response.data?.message)
          setLastError('history_error')
          chatMessagesCache.delete(cacheKey)
          setMessages([])
          setPinnedMessage(null)
          return
        }
        if (response?.data?.messages) {
          setMessages(response.data.messages.map(normalizeChatMessage))
          setMessagesOwnerKey(cacheKey)
          setHasMore(response.data.hasMore ?? false)
          if (channelId) socket.emit('markChannelRead', { teamId, channelId })
        }
      },
    )
  }, [cacheKey, teamId, channelId, isCurrent])

  // Connect socket
  useEffect(() => {
    if (!token || !teamId) return
    revoked.current = false
    let alive = true
    let acceptsEvents = true
    setConnectionState('connecting')
    setLastError(null)

    // E2E / demo: chat history streams over Socket.io, which the request mock
    // does not intercept. Short-circuit to a seeded conversation so the Chat
    // tab shows a live team thread instead of the empty state.
    if (getE2ESession()) {
      setConnectionState('connected')
      setMessages(buildE2EChatMessages(teamId, channelId ?? null, userId ?? null))
      setHasMore(false)
      setLoadingHistory(false)
      setHistoryLoaded(true)
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
    const unbindLifecycle = bindSocketLifecycle(socket, loadHistory)

    const currentSocket = () => alive && acceptsEvents && socketRef.current === socket && isCurrent(accessGeneration.current)
    socket.on('connect', () => {
      if (!alive || scopeRef.current !== scope || socketRef.current !== socket) return
      revoked.current = false
      acceptsEvents = true
      setConnectionState('connected')
      setLastError(null)
      socket.emit('join', { teamId })
      // Channel-scoped room: authorised by the channel itself, so groups
      // spanning teams and club-level channels receive live messages too.
      if (channelId) socket.emit('channel:join', { channelId })
      loadHistory()
    })

    socket.on('disconnect', (reason) => {
      if (!alive || scopeRef.current !== scope || socketRef.current !== socket) return
      accessGeneration.current += 1
      acceptsEvents = false
      pendingOutgoingRef.current = []
      setLoadingHistory(false)
      clearTyping()
      setConnectionState(reason === 'io server disconnect' ? 'offline' : 'reconnecting')
      if (reason === 'io server disconnect') {
        revoked.current = true
        chatMessagesCache.delete(cacheKey)
        setMessages([])
        setPinnedMessage(null)
        notifyAccessChanged()
      }
    })

    socket.on('connect_error', (err) => {
      if (!currentSocket()) return
      setConnectionState('offline')
      setLastError('connect_error')
      if (__DEV__) console.warn('[Chat] connect_error:', err?.message || err)
      // Refresh auth token for next reconnection attempt
      if (token) {
        socket.auth = { token }
      }
    })

    socket.io.on('reconnect_attempt', () => {
      if (!alive || scopeRef.current !== scope) return
      setConnectionState('reconnecting')
    })

    socket.io.on('reconnect_failed', () => {
      if (!alive || scopeRef.current !== scope) return
      setConnectionState('offline')
    })

    // Source-language detection result — patches message so translation
    // becomes available without the user needing to reload history.
    socket.on(
      'message:source',
      ({ messageId, sourceLanguage }: { messageId: string; sourceLanguage: string }) => {
        if (!currentSocket()) return
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, sourceLanguage } : m)))
      },
    )

    socket.on('message:translation', (payload: {
      messageId: string; conversationId: string; translation: NonNullable<ChatMessage['translation']>
    }) => {
      if (!currentSocket() || payload.conversationId !== channelId) return
      setMessages((prev) => prev.map((message) => message.id === payload.messageId && !message.deletedAt
        ? { ...message, translation: payload.translation } : message))
    })

    // Incoming message
    socket.on('message', (msg: ChatMessage) => {
      if (!currentSocket()) return
      // One socket per thread; ignore rows of another channel it still hears.
      if (msg.channelId && channelId && msg.channelId !== channelId) return
      removeTyping(msg.senderId)
      // Dedupe by id: the gateway echoes the sender's own message back to the
      // whole room (no sender exclusion), and reconnect can replay; without
      // this guard the same message could render twice.
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev
        if (msg.clientMessageId && msg.senderId === userId) {
          const pendingIndex = prev.findIndex(
            (m) =>
              m.senderId === userId &&
              m.clientMessageId === msg.clientMessageId &&
              m.id.startsWith('pending:'),
          )
          if (pendingIndex >= 0) {
            const next = prev.slice()
            next[pendingIndex] = msg
            return next
          }
        }
        return [...prev, msg]
      })
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
        if (!currentSocket() || !payload?.message) return
        const next = payload.message
        // REST-posted messages (media, polls, event cards, lineups) arrive
        // here rather than on 'message'; they are new rows, not patches.
        if (
          payload.kind === 'media' ||
          payload.kind === 'poll' ||
          payload.kind === 'rsvp-poll' ||
          payload.kind === 'lineup'
        ) {
          setMessages((prev) => (prev.some((m) => m.id === next.id) ? prev : [...prev, next]))
          if (!isAtBottomRef.current && next.senderId !== userId) {
            setUnreadCount((c) => c + 1)
          }
          return
        }
        setMessages((prev) => prev.map((m) => (m.id === next.id ? { ...m, ...next } : m)))
      },
    )

    // Typing indicator (L4: the server scopes it to the channel room; the
    // channelId check also drops strays from other channels on this socket).
    socket.on('typing', (data: { userId: string; userName: string; channelId?: string | null }) => {
      if (!currentSocket() || data.userId === userId) return
      if (data.channelId && data.channelId !== channelId) return

      touchTyping(data.userId, data.userName)
    })

    return () => {
      alive = false
      pendingOutgoingRef.current = []
      unbindLifecycle()
      socket.emit('leave', { teamId })
      socket.disconnect()
      socketRef.current = null
      clearTyping()
    }
    // channelId in deps: switching channels should rewire the
    // history fetch to the new scope; reconnecting the socket on
    // every switch is fine (cheap) and simpler than threading channel
    // changes through the existing connected socket.
  }, [token, teamId, channelId, apiUrl, userId, loadHistory, markPendingDelivered, clearTyping, removeTyping, touchTyping, isCurrent, scope])

  // M5: pins are per channel. Without a channel there is nothing to show
  // (never fall back to a team-wide pin from another channel).
  useEffect(() => {
    if (!token || !clubId || !teamId || !channelId) {
      setPinnedMessage(null)
      return
    }
    if (getE2ESession()) {
      setPinnedMessage(null)
      return
    }
    // Re-authorize the pin after every successful socket reconnect, including
    // role changes that disconnect the socket while retaining channel access.
    if (connectionState !== 'connected') return

    setPinnedMessage(null)
    const generation = accessGeneration.current
    let cancelled = false
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 12000)

    const pinnedQuery = `?channelId=${encodeURIComponent(channelId)}`
    fetch(`${apiUrl}/clubs/${clubId}/teams/${teamId}/messages/pinned${pinnedQuery}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then((response) => {
        clearTimeout(timeoutId)
        if (!response.ok) return null
        return response.json()
      })
      .then((message: PinnedMessage | null) => {
        if (cancelled || !isCurrent(generation)) return
        // Defence in depth: only a pin of THIS channel is shown.
        setPinnedMessage(message && message.channelId === channelId ? message : null)
      })
      .catch(() => {
        clearTimeout(timeoutId)
        if (!cancelled && isCurrent(generation)) setPinnedMessage(null)
      })
    return () => { cancelled = true; clearTimeout(timeoutId); controller.abort() }
  }, [apiUrl, clubId, teamId, token, channelId, isCurrent, connectionState])

  // Send message
  const sendMessage = useCallback(
    (
      content: string,
      clubId: string,
      replyToId?: string | null,
      options?: { isAnnouncement?: boolean },
    ): Promise<boolean> => {
      const isAnnouncement = options?.isAnnouncement === true
      const socket = socketRef.current
      const generation = accessGeneration.current
      if (!isCurrent(generation)) return Promise.resolve(false)
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
            isAnnouncement,
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
      if (!channelId) {
        setLastError('channel_required')
        return Promise.resolve(false)
      }

      setLastError(null)

      return new Promise((resolve) => {
        const pendingKey = `${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`
        const clientMessageId = `cm_${pendingKey}`
        const createdAt = new Date().toISOString()
        pendingOutgoingRef.current.push({
          key: pendingKey,
          clientMessageId,
          delivered: false,
        })
        setMessages((prev) => [
          ...prev,
          {
            id: `pending:${clientMessageId}`,
            teamId,
            clientMessageId,
            senderId: userId,
            senderName: null,
            senderAvatar: null,
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
            readCount: 0,
            isAnnouncement,
            isPinned: false,
            editedAt: null,
            deletedAt: null,
            createdAt,
          },
        ])
        socket.timeout(5000).emit(
          'message',
          {
            teamId,
            clubId,
            content: trimmed,
            clientMessageId,
            channelId,
            ...(isAnnouncement ? { isAnnouncement: true } : {}),
            ...(replyToId ? { replyToId } : {}),
          },
          (...args: unknown[]) => {
            if (socketRef.current !== socket || !isCurrent(generation)) { resolve(false); return }
            const { error, response } = normalizeMessageSendAck(args)
            if (error) {
              resolve(completePendingOutgoing(pendingKey, false, response))
              return
            }

            if (response?.event === 'error') {
              const ok = completePendingOutgoing(pendingKey, false, response)
              const reason = response.data?.message ?? ''
              if (/channel required/i.test(reason)) setLastError('channel_required')
              else if (/forbidden/i.test(reason)) setLastError('forbidden')
              else if (/too fast/i.test(reason)) setLastError('too_fast')
              resolve(ok)
              return
            }

            resolve(completePendingOutgoing(pendingKey, true, response))
          },
        )
      })
    },
    [teamId, channelId, userId, completePendingOutgoing, isCurrent],
  )

  // Send typing indicator
  const sendTyping = useCallback(() => {
    if (!channelId || !socketRef.current?.connected) return
    socketRef.current?.emit('typing', { teamId, channelId })
  }, [teamId, channelId])

  // Load more history
  const loadMore = useCallback(() => {
    const socket = socketRef.current
    if (!socket?.connected || !hasMore || loadingHistory || !channelId) return

    const generation = accessGeneration.current
    if (!isCurrent(generation)) return
    setLoadingHistory(true)
    const oldest = messages[0]
    const cursor = oldest?.createdAt

    socket.emit(
      'history',
      { teamId, channelId, cursor },
      (response: { data: { messages: ChatMessage[]; hasMore: boolean } }) => {
        if (socketRef.current !== socket || !isCurrent(generation)) return
        if (response?.data) {
          setMessages((prev) => [...response.data.messages.map(normalizeChatMessage), ...prev])
          setHasMore(response.data.hasMore)
        }
        setLoadingHistory(false)
      },
    )
  }, [teamId, channelId, hasMore, loadingHistory, messages, isCurrent])

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
      const generation = accessGeneration.current
      if (!socket?.connected || !query.trim() || !isCurrent(generation)) return Promise.resolve([])

      return new Promise((resolve) => {
        socket.emit(
          'search',
          { teamId, query: query.trim() },
          (response: { data?: ChatMessage[] | { messages?: ChatMessage[] } }) => {
            if (socketRef.current !== socket || !isCurrent(generation)) { resolve([]); return }
            // The gateway answers { event, data: { messages } }; older builds
            // returned the array directly. Accept both.
            const data = response?.data
            resolve(Array.isArray(data) ? data : (data?.messages ?? []))
          },
        )
      })
    },
    [teamId, isCurrent],
  )

  // REST mutations layered on top of the realtime gateway.
  const callRest = useCallback(
    async (path: string, init?: { method?: string; body?: unknown }) => {
      const generation = accessGeneration.current
      if (!token || !isCurrent(generation)) return null
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
        return isCurrent(generation) && text ? (JSON.parse(text) as ChatMessage) : null
      } catch {
        return null
      }
    },
    [apiUrl, token, isCurrent],
  )

  const patchMessage = useCallback((next: ChatMessage | null) => {
    if (!next || !isCurrent(renderGeneration)) return
    setMessages((prev) => prev.map((m) => (m.id === next.id ? { ...m, ...next } : m)))
  }, [isCurrent, renderGeneration])

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
      const generation = accessGeneration.current
      if (!token || !channelId || !isCurrent(generation)) return false
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
          body: JSON.stringify({ ...input, channelId }),
        })
        if (!res.ok) return false
        const created = (await res.json()) as ChatMessage
        if (!isCurrent(generation)) return false
        // The gateway also broadcasts it as chat:event 'media'; dedupe by id.
        setMessages((prev) => (prev.some((m) => m.id === created.id) ? prev : [...prev, created]))
        return true
      } catch {
        return false
      }
    },
    [apiUrl, teamId, token, channelId, isCurrent],
  )

  /** Append a message this client created through REST (dedupes by id). */
  const appendMessage = useCallback((created: ChatMessage) => {
    if (!isCurrent(renderGeneration) || (created.channelId && created.channelId !== channelId)) return
    setMessages((prev) => (prev.some((m) => m.id === created.id) ? prev : [...prev, created]))
  }, [isCurrent, renderGeneration, channelId])

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
      const generation = accessGeneration.current
      if (!token || !isCurrent(generation)) return null
      try {
        const res = await fetch(`${apiUrl}/messages/${messageId}/poll`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return null
        const poll = await res.json()
        return isCurrent(generation) ? poll as Awaited<ReturnType<typeof fetchPollForMessage>> : null
      } catch {
        return null
      }
    },
    [apiUrl, token, isCurrent],
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
      const generation = accessGeneration.current
      if (!token || !isCurrent(generation)) return null
      try {
        const res = await fetch(`${apiUrl}/polls/${pollId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return null
        const poll = await res.json()
        return isCurrent(generation) ? poll as Awaited<ReturnType<typeof fetchPoll>> : null
      } catch {
        return null
      }
    },
    [apiUrl, token, isCurrent],
  )

  const votePollOption = useCallback(
    async (pollId: string, optionId: string): Promise<void> => {
      if (!token || !isCurrent(accessGeneration.current)) return
      await fetch(`${apiUrl}/polls/${pollId}/vote`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ optionId }),
      })
    },
    [apiUrl, token, isCurrent],
  )

  const pinMessage = useCallback(
    async (message: ChatMessage): Promise<void> => {
      const generation = accessGeneration.current
      if (!token || !teamId || !isCurrent(generation)) return
      const action = message.isPinned ? 'unpin' : 'pin'
      const response = await fetch(
        `${apiUrl}/clubs/${clubId}/teams/${teamId}/messages/${message.id}/${action}`,
        { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } },
      )
      if (!response.ok) throw new Error(`Could not ${action} message`)
      const updated = (await response.json()) as ChatMessage
      if (!isCurrent(generation)) return
      setPinnedMessage(
        message.isPinned
          ? null
          : ({ ...updated, isPinned: true, channelId: channelId ?? null } as unknown as PinnedMessage),
      )
      setMessages((current) =>
        current.map((item) => ({ ...item, isPinned: item.id === (message.isPinned ? null : message.id) })),
      )
    },
    [apiUrl, clubId, teamId, token, channelId, isCurrent],
  )

  const refreshHistory = useCallback(() => {
    const socket = socketRef.current
    const generation = accessGeneration.current
    if (!socket?.connected || !channelId || !isCurrent(generation)) return
    socket.emit(
      'history',
      { teamId, channelId },
      (response: {
        event?: string
        data: { messages?: ChatMessage[]; hasMore?: boolean; message?: string }
      }) => {
        if (socketRef.current !== socket || !isCurrent(generation)) return
        if (response?.data?.messages) {
          setMessages(response.data.messages.map(normalizeChatMessage))
          setMessagesOwnerKey(cacheKey)
          setHasMore(response.data.hasMore ?? false)
        }
      },
    )
  }, [cacheKey, teamId, channelId, isCurrent])

  return {
    messages: messagesOwnerKey === cacheKey ? messages : [],
    pinnedMessage,
    connectionState,
    lastError,
    historyLoaded,
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
    pinMessage,
    sendMediaMessage,
    appendMessage,
  }
}
