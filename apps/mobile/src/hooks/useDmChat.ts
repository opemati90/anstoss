import { useCallback, useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { CHAT } from '@anstoss/shared'

export type DmMessage = {
  id: string
  conversationId: string
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

export function useDmChat({ conversationId, token, userId, apiUrl }: UseDmChatOptions) {
  const [messages, setMessages] = useState<DmMessage[]>([])
  const [connectionState, setConnectionState] = useState<DmConnectionState>('offline')
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(false)

  const socketRef = useRef<Socket | null>(null)
  const typingTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

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

    // Load initial history
    socket.emit('dm:history', { conversationId }, (response: DmHistoryResponse) => {
      if (response?.data) {
        setMessages(response.data.messages ?? [])
        setHasMore(response.data.hasMore ?? false)
      }
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
      typingTimeoutsRef.current.forEach((t) => clearTimeout(t))
      typingTimeoutsRef.current.clear()
    }
  }, [token, conversationId, userId, apiUrl])

  const [lastError, setLastError] = useState<string | null>(null)

  const sendMessage = useCallback(
    async (content: string): Promise<boolean> => {
      if (!socketRef.current?.connected || !content.trim()) {
        setLastError('send_error')
        return false
      }

      return new Promise<boolean>((resolve) => {
        const timeoutId = setTimeout(() => {
          resolve(false)
          setLastError('send_error')
        }, 5000)

        socketRef.current!.emit(
          'dm:message',
          { conversationId, content: content.trim() },
          (ack: { ok?: boolean; error?: string }) => {
            clearTimeout(timeoutId)
            if (ack?.ok) {
              setLastError(null)
              resolve(true)
            } else {
              setLastError('send_error')
              resolve(false)
            }
          },
        )
      })
    },
    [conversationId],
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
