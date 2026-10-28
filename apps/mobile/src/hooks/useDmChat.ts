import { useCallback, useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import {
  CHAT,
  type DirectMessageItem,
  type DmLineupInput,
  type MessageAttachmentMeta,
  type SendDirectMessageInput,
} from '@anstoss/shared'
import { getE2ESession } from '../e2e/session'
import { buildE2EDmMessages } from '../e2e/chatSeed'
import type { ChatMessageType, ChatReactionAggregate } from './useChat'
import { deleteDirectMessage, postDirectMessage, setDmReaction } from './dmMedia'

export type DmMessage = {
  id: string
  conversationId: string
  clientMessageId?: string | null
  senderId: string
  senderName: string
  content: string
  createdAt: string
  /** History rows carry the sender relation instead of a flat name. */
  sender?: { id: string; name: string; avatarUrl?: string | null } | null
  translation?: { content: string; sourceLanguage: string } | null
  // Chat revamp: DM attachments, replies, reactions, deletes.
  messageType?: ChatMessageType
  attachmentUrl?: string | null
  attachmentMeta?: MessageAttachmentMeta | null
  replyToId?: string | null
  replyTo?: {
    id: string
    senderName: string | null
    contentPreview: string
    messageType: ChatMessageType
  } | null
  reactions?: ChatReactionAggregate[]
  deletedAt?: string | null
}

export type DmAttachmentInput = Extract<SendDirectMessageInput, { attachmentUrl: string }>

/** Map the API's DirectMessageItem onto the hook's message row. */
export function fromDirectMessageItem(item: DirectMessageItem, clientMessageId?: string | null): DmMessage {
  return normalizeDmMessage({
    ...(item as unknown as DmMessage),
    clientMessageId: clientMessageId ?? (item as { clientMessageId?: string | null }).clientMessageId ?? null,
    senderName: item.sender?.name ?? '',
  })
}

/** History rows embed `sender`; live rows carry `senderName`. Unify them. */
export function normalizeDmMessage(message: DmMessage): DmMessage {
  return {
    ...message,
    senderName: message.senderName || message.sender?.name || '',
  }
}

export type DmConnectionState = 'connected' | 'reconnecting' | 'offline'

type UseDmChatOptions = {
  conversationId: string
  token: string | null
  userId: string
  apiUrl: string
  /** Needed for REST sends (attachments, lineups), reactions and deletes. */
  clubId?: string | null
}

type DmHistoryResponse = {
  id?: string
  clientMessageId?: string | null
  ok?: boolean
  error?: string
  data?: {
    id?: string
    messages?: DmMessage[]
    hasMore?: boolean
    peerLastReadAt?: string | null
  }
}

type PendingOutgoingMessage = {
  key: string
  clientMessageId: string
  delivered: boolean
}

const dmMessagesCache = new Map<string, DmMessage[]>()

function getDmHistoryCacheKey(userId: string, conversationId: string) {
  return `dm:${userId}:${conversationId}`
}

export function useDmChat({ conversationId, token, userId, apiUrl, clubId = null }: UseDmChatOptions) {
  const cacheKey = getDmHistoryCacheKey(userId, conversationId)
  const [messages, setMessages] = useState<DmMessage[]>([])
  const [connectionState, setConnectionState] = useState<DmConnectionState>('offline')
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [messagesOwnerKey, setMessagesOwnerKey] = useState(cacheKey)
  const [historyLoaded, setHistoryLoaded] = useState(() => dmMessagesCache.has(cacheKey))
  /** The peer's read watermark: own messages at or before it show ✓✓. */
  const [peerLastReadAt, setPeerLastReadAt] = useState<string | null>(null)

  const socketRef = useRef<Socket | null>(null)
  const typingTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map())
  const pendingOutgoingRef = useRef<PendingOutgoingMessage[]>([])

  useEffect(() => {
    const cached = dmMessagesCache.get(cacheKey)
    setMessages(cached ?? [])
    setMessagesOwnerKey(cacheKey)
    setHistoryLoaded(Boolean(cached))
  }, [cacheKey])

  useEffect(() => {
    if (messagesOwnerKey !== cacheKey) return
    dmMessagesCache.set(cacheKey, messages)
  }, [cacheKey, messages, messagesOwnerKey])

  const loadHistory = useCallback(() => {
    const socket = socketRef.current
    if (!socket?.connected) return
    socket.emit('dm:history', { conversationId }, (response: DmHistoryResponse) => {
      setHistoryLoaded(true)
      if (Array.isArray(response?.data?.messages)) {
        setMessages((response.data.messages ?? []).map(normalizeDmMessage))
        setMessagesOwnerKey(cacheKey)
        setHasMore(response.data.hasMore ?? false)
        if (response.data.peerLastReadAt !== undefined) {
          setPeerLastReadAt(response.data.peerLastReadAt ?? null)
        }
      }
    })
  }, [cacheKey, conversationId])

  useEffect(() => {
    if (!token || !conversationId) return

    // E2E / demo: no Socket.io server behind the request mock. Seed the
    // thread so the conversation screen renders a real exchange.
    const e2e = getE2ESession()
    if (e2e) {
      setConnectionState('connected')
      setMessages(buildE2EDmMessages(conversationId, userId, e2e.user.name))
      setPeerLastReadAt(new Date().toISOString())
      setHasMore(false)
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

    socket.on('connect', () => {
      setConnectionState('connected')
      socket.emit('dm:join', { conversationId })
      loadHistory()
    })

    socket.on('disconnect', (reason) => {
      // 'io server disconnect' means server kicked us — don't expect reconnect
      if (reason === 'io server disconnect') {
        setConnectionState('offline')
      } else {
        setConnectionState('reconnecting')
      }
      // Clear typing indicators on disconnect
      setTypingUsers([])
    })

    socket.io.on('reconnect_failed', () => {
      setConnectionState('offline')
    })

    socket.on('dm:message', (raw: DmMessage) => {
      const msg = normalizeDmMessage(raw)
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
      if (msg.senderId === userId && msg.clientMessageId) {
        const pending = pendingOutgoingRef.current.find(
          (item) => !item.delivered && item.clientMessageId === msg.clientMessageId,
        )
        if (pending) {
          pending.delivered = true
          setLastError(null)
        }
      }
    })

    // Reactions and deletes arrive as full rows.
    socket.on('dm:event', (payload: { kind?: string; message?: DirectMessageItem }) => {
      const next = payload?.message
      if (!next?.id) return
      const row = fromDirectMessageItem(next)
      setMessages((prev) => prev.map((m) => (m.id === row.id ? { ...m, ...row } : m)))
    })

    // The peer read the thread: advance the ✓✓ watermark.
    socket.on('dm:read', (data: { userId?: string; readAt?: string | null }) => {
      if (!data || data.userId === userId) return
      setPeerLastReadAt(data.readAt ?? new Date().toISOString())
    })

    socket.on('dm:typing', (data: { userId: string; userName: string; conversationId?: string }) => {
      if (data.userId === userId) return
      if (data.conversationId && data.conversationId !== conversationId) return

      setTypingUsers((prev) =>
        prev.includes(data.userName) ? prev : [...prev, data.userName],
      )

      const existing = typingTimeoutsRef.current.get(data.userId)
      if (existing) clearTimeout(existing)

      typingTimeoutsRef.current.set(
        data.userId,
        setTimeout(() => {
          setTypingUsers((prev) => prev.filter((n) => n !== data.userName))
          typingTimeoutsRef.current.delete(data.userId)
        }, 3000),
      )
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
      typingTimeoutsRef.current.forEach((t) => clearTimeout(t))
      typingTimeoutsRef.current.clear()
    }
  }, [token, conversationId, userId, apiUrl, loadHistory])

  const [lastError, setLastError] = useState<string | null>(null)

  const completePendingOutgoing = useCallback(
    (key: string, ok: boolean, response?: DmHistoryResponse | null) => {
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

  const sendMessage = useCallback(
    async (content: string, replyToId?: string | null): Promise<boolean> => {
      const e2e = getE2ESession()
      if (e2e && content.trim()) {
        setMessages((prev) => [
          ...prev,
          {
            id: `e2e-dm-${Date.now().toString(36)}`,
            conversationId,
            senderId: userId,
            senderName: e2e.user.name,
            content: content.trim(),
            messageType: 'TEXT',
            replyToId: replyToId ?? null,
            replyTo: replyToId ? replyPreviewFor(replyToId) : null,
            createdAt: new Date().toISOString(),
          },
        ])
        return true
      }
      if (!socketRef.current?.connected || !content.trim()) {
        setLastError('send_error')
        return false
      }

      return new Promise<boolean>((resolve) => {
        const pendingKey = `${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`
        const clientMessageId = `dm_${pendingKey}`
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
            conversationId,
            clientMessageId,
            senderId: userId,
            senderName: '',
            content: content.trim(),
            messageType: 'TEXT',
            replyToId: replyToId ?? null,
            replyTo: replyToId ? replyPreviewFor(replyToId) : null,
            createdAt,
          },
        ])
        const timeoutId = setTimeout(() => {
          resolve(completePendingOutgoing(pendingKey, false))
        }, 5000)

        socketRef.current!.emit(
          'dm:message',
          {
            conversationId,
            content: content.trim(),
            clientMessageId,
            ...(replyToId ? { replyToId } : {}),
          },
          (ack: DmHistoryResponse) => {
            clearTimeout(timeoutId)
            if (ack?.ok) {
              resolve(completePendingOutgoing(pendingKey, true, ack))
            } else {
              resolve(completePendingOutgoing(pendingKey, false, ack))
            }
          },
        )
      })
    },
    // replyPreviewFor reads the latest messages via a ref, so it is not a dep.
    [conversationId, completePendingOutgoing, userId],
  )

  /**
   * REST send for attachments and lineup cards. The server echoes the row as
   * `dm:message` to the room too; the append dedupes by id.
   */
  const sendRest = useCallback(
    async (input: SendDirectMessageInput): Promise<'ok' | 'forbidden' | 'failed'> => {
      if (!clubId) return 'failed'
      const result = await postDirectMessage(clubId, conversationId, input)
      if (!result.ok) {
        setLastError(result.reason === 'forbidden' ? 'dm_forbidden' : 'send_error')
        return result.reason
      }
      const row = fromDirectMessageItem(result.message)
      setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]))
      setLastError(null)
      return 'ok'
    },
    [clubId, conversationId],
  )

  const sendAttachment = useCallback(
    (input: Omit<DmAttachmentInput, 'clientMessageId'>) => sendRest(input as SendDirectMessageInput),
    [sendRest],
  )

  const sendLineup = useCallback(
    (lineup: DmLineupInput, replyToId?: string | null) =>
      sendRest({ messageType: 'LINEUP', lineup, ...(replyToId ? { replyToId } : {}) }),
    [sendRest],
  )

  const react = useCallback(
    async (messageId: string, emoji: string, on: boolean) => {
      if (!clubId) return
      const updated = await setDmReaction(clubId, conversationId, messageId, emoji, on)
      if (!updated) return
      const row = fromDirectMessageItem(updated)
      setMessages((prev) => prev.map((m) => (m.id === row.id ? { ...m, ...row } : m)))
    },
    [clubId, conversationId],
  )

  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!clubId) return
      const updated = await deleteDirectMessage(clubId, conversationId, messageId)
      if (!updated) return
      const row = fromDirectMessageItem(updated)
      setMessages((prev) => prev.map((m) => (m.id === row.id ? { ...m, ...row } : m)))
    },
    [clubId, conversationId],
  )

  const sendTyping = useCallback(() => {
    socketRef.current?.emit('dm:typing', { conversationId })
  }, [conversationId])

  const markAsRead = useCallback(() => {
    socketRef.current?.emit('dm:read', { conversationId })
  }, [conversationId])

  // Local reply preview for optimistic rows (the server row replaces it).
  const messagesRef = useRef<DmMessage[]>([])
  messagesRef.current = messages
  function replyPreviewFor(id: string): DmMessage['replyTo'] {
    const parent = messagesRef.current.find((m) => m.id === id)
    if (!parent) return null
    return {
      id,
      senderName: parent.senderName || parent.sender?.name || null,
      contentPreview: parent.content.slice(0, 80),
      messageType: parent.messageType ?? 'TEXT',
    }
  }

  const loadMore = useCallback(() => {
    if (!socketRef.current || !hasMore || loadingHistory) return

    const oldest = messages[0]
    if (!oldest) return

    setLoadingHistory(true)
    socketRef.current.emit(
      'dm:history',
      { conversationId, cursor: oldest.createdAt },
      (response: DmHistoryResponse) => {
        const data = response?.data
        if (Array.isArray(data?.messages)) {
          setMessages((prev) => [...(data.messages ?? []).map(normalizeDmMessage), ...prev])
          setHasMore(data.hasMore ?? false)
        }
        setLoadingHistory(false)
      },
    )
  }, [conversationId, hasMore, loadingHistory, messages])

  const reconnect = useCallback(() => {
    if (socketRef.current) {
      setConnectionState('reconnecting')
      socketRef.current.connect()
    }
  }, [])

  return {
    messages,
    connectionState,
    lastError,
    historyLoaded,
    typingUsers,
    hasMore,
    loadingHistory,
    peerLastReadAt,
    sendMessage,
    sendAttachment,
    sendLineup,
    react,
    deleteMessage,
    sendTyping,
    markAsRead,
    loadMore,
    reconnect,
  }
}
