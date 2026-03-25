import { useCallback, useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { CHAT, type PinnedMessage } from '@anstoss/shared'

export type ChatMessage = {
  id: string
  teamId: string
  senderId: string
  senderName: string
  content: string
  isAnnouncement?: boolean
  isPinned?: boolean
  createdAt: string
}

export type ConnectionState = 'connected' | 'reconnecting' | 'offline'

type UseChatOptions = {
  clubId: string
  teamId: string
  token: string | null
  userId: string
  apiUrl: string
}

export function useChat({ clubId, teamId, token, userId, apiUrl }: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [pinnedMessage, setPinnedMessage] = useState<PinnedMessage | null>(null)
  const [connectionState, setConnectionState] = useState<ConnectionState>('offline')
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  const socketRef = useRef<Socket | null>(null)
  const typingTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map())
  const isAtBottomRef = useRef(true)

  // Connect socket
  useEffect(() => {
    if (!token || !teamId) return

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
      socket.emit('join', { teamId })
    })

    socket.on('disconnect', () => {
      setConnectionState('offline')
    })

    socket.on('reconnecting', () => {
      setConnectionState('reconnecting')
    })

    socket.on('reconnect_attempt', () => {
      setConnectionState('reconnecting')
    })

    // Incoming message
    socket.on('message', (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg])

      if (!isAtBottomRef.current && msg.senderId !== userId) {
        setUnreadCount((c) => c + 1)
      }
    })

    // Typing indicator
    socket.on('typing', (data: { userId: string; userName: string }) => {
      if (data.userId === userId) return

      setTypingUsers((prev) =>
        prev.includes(data.userName) ? prev : [...prev, data.userName],
      )

      // Clear existing timeout for this user
      const existing = typingTimeoutsRef.current.get(data.userId)
      if (existing) clearTimeout(existing)

      const timeout = setTimeout(() => {
        setTypingUsers((prev) => prev.filter((n) => n !== data.userName))
        typingTimeoutsRef.current.delete(data.userId)
      }, CHAT.TYPING_TIMEOUT_MS)

      typingTimeoutsRef.current.set(data.userId, timeout)
    })

    // Load initial history
    socket.emit('history', { teamId }, (response: { data: { messages: ChatMessage[]; hasMore: boolean } }) => {
      if (response?.data) {
        setMessages(response.data.messages)
        setHasMore(response.data.hasMore)
      }
    })

    return () => {
      socket.emit('leave', { teamId })
      socket.disconnect()
      socketRef.current = null
      // Clear all typing timeouts
      typingTimeoutsRef.current.forEach((t) => clearTimeout(t))
      typingTimeoutsRef.current.clear()
    }
  }, [token, teamId, apiUrl, userId])

  useEffect(() => {
    if (!token || !clubId || !teamId) return

    fetch(`${apiUrl}/clubs/${clubId}/teams/${teamId}/messages/pinned`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((response) => {
        if (!response.ok) return null
        return response.json()
      })
      .then((message) => {
        setPinnedMessage(message ?? null)
      })
      .catch(() => {
        setPinnedMessage(null)
      })
  }, [apiUrl, clubId, teamId, token])

  // Send message
  const sendMessage = useCallback(
    (content: string, clubId: string) => {
      const socket = socketRef.current
      if (!socket?.connected || !content.trim()) return

      socket.emit('message', { teamId, clubId, content: content.trim() })
    },
    [teamId],
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
      { teamId, cursor },
      (response: { data: { messages: ChatMessage[]; hasMore: boolean } }) => {
        if (response?.data) {
          setMessages((prev) => [...response.data.messages, ...prev])
          setHasMore(response.data.hasMore)
        }
        setLoadingHistory(false)
      },
    )
  }, [teamId, hasMore, loadingHistory, messages])

  // Track scroll position
  const setIsAtBottom = useCallback((atBottom: boolean) => {
    isAtBottomRef.current = atBottom
    if (atBottom) setUnreadCount(0)
  }, [])

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

  return {
    messages,
    pinnedMessage,
    connectionState,
    typingUsers,
    hasMore,
    loadingHistory,
    unreadCount,
    sendMessage,
    sendTyping,
    loadMore,
    setIsAtBottom,
    searchMessages,
  }
}
