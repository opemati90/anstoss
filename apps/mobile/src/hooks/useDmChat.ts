import { useCallback, useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { CHAT } from '@anstoss/shared'

export type DmMessage = {
  id: string
  conversationId: string
  clientMessageId?: string | null
  senderId: string
  senderName: string
  content: string
  createdAt: string
}

export type DmConnectionState = 'connected' | 'reconnecting' | 'offline'

type UseDmChatOptions = {
  conversationId: string
  token: string | null
  userId: string
  apiUrl: string
}

type DmHistoryResponse = {
  data?: {
    messages?: DmMessage[]
    hasMore?: boolean
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

export function useDmChat({ conversationId, token, userId, apiUrl }: UseDmChatOptions) {
  const cacheKey = getDmHistoryCacheKey(userId, conversationId)
  const [messages, setMessages] = useState<DmMessage[]>([])
  const [connectionState, setConnectionState] = useState<DmConnectionState>('offline')
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [messagesOwnerKey, setMessagesOwnerKey] = useState(cacheKey)

  const socketRef = useRef<Socket | null>(null)
  const typingTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map())
  const pendingOutgoingRef = useRef<PendingOutgoingMessage[]>([])

  useEffect(() => {
    const cached = dmMessagesCache.get(cacheKey)
    setMessages(cached ?? [])
    setMessagesOwnerKey(cacheKey)
  }, [cacheKey])

  useEffect(() => {
    if (messagesOwnerKey !== cacheKey) return
    dmMessagesCache.set(cacheKey, messages)
  }, [cacheKey, messages, messagesOwnerKey])

  const loadHistory = useCallback(() => {
    const socket = socketRef.current
    if (!socket?.connected) return
    socket.emit('dm:history', { conversationId }, (response: DmHistoryResponse) => {
      if (response?.data) {
        setMessages(response.data.messages ?? [])
        setMessagesOwnerKey(cacheKey)
        setHasMore(response.data.hasMore ?? false)
      }
    })
  }, [cacheKey, conversationId])

  useEffect(() => {
    if (!token || !conversationId) return

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

    socket.on('dm:message', (msg: DmMessage) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev
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

    socket.on('dm:typing', (data: { userId: string; userName: string }) => {
      if (data.userId === userId) return

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

  const sendMessage = useCallback(
    async (content: string): Promise<boolean> => {
      if (!socketRef.current?.connected || !content.trim()) {
        setLastError('send_error')
        return false
      }

      return new Promise<boolean>((resolve) => {
        const pendingKey = `${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`
        const clientMessageId = `dm_${pendingKey}`
        pendingOutgoingRef.current.push({
          key: pendingKey,
          clientMessageId,
          delivered: false,
        })
        const timeoutId = setTimeout(() => {
          resolve(completePendingOutgoing(pendingKey, false))
        }, 5000)

        socketRef.current!.emit(
          'dm:message',
          { conversationId, content: content.trim(), clientMessageId },
          (ack: { ok?: boolean; error?: string }) => {
            clearTimeout(timeoutId)
            if (ack?.ok) {
              resolve(completePendingOutgoing(pendingKey, true))
            } else {
              resolve(completePendingOutgoing(pendingKey, false))
            }
          },
        )
      })
    },
    [conversationId, completePendingOutgoing],
  )

  const sendTyping = useCallback(() => {
    socketRef.current?.emit('dm:typing', { conversationId })
  }, [conversationId])

  const markAsRead = useCallback(() => {
    socketRef.current?.emit('dm:read', { conversationId })
  }, [conversationId])

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
        if (data) {
          setMessages((prev) => [...(data.messages ?? []), ...prev])
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
    typingUsers,
    hasMore,
    loadingHistory,
    sendMessage,
    sendTyping,
    markAsRead,
    loadMore,
    reconnect,
  }
}
