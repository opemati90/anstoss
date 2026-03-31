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

    socket.on('disconnect', () => {
      setConnectionState('reconnecting')
    })

    socket.on('reconnect_failed', () => {
      setConnectionState('offline')
    })

    socket.on('dm:message', (msg: DmMessage) => {
      setMessages((prev) => [...prev, msg])
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
    socket.emit('dm:history', { conversationId }, (response: any) => {
      if (response?.data) {
        setMessages(response.data.messages || [])
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

  const sendMessage = useCallback(
    (content: string) => {
      if (!socketRef.current || !content.trim()) return

      socketRef.current.emit('dm:message', {
        conversationId,
        content: content.trim(),
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
      (response: any) => {
        if (response?.data) {
          setMessages((prev) => [...(response.data.messages || []), ...prev])
          setHasMore(response.data.hasMore ?? false)
        }
        setLoadingHistory(false)
      },
    )
  }, [conversationId, hasMore, loadingHistory, messages])

  return {
    messages,
    connectionState,
    typingUsers,
    hasMore,
    loadingHistory,
    sendMessage,
    sendTyping,
    markAsRead,
    loadMore,
  }
}
