import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import type { InboxNotification, InboxNotificationPage } from '@anstoss/shared'
import { api } from '../api/client'

const POLL_MS = 60_000

// The bell and the inbox screen live in different navigators; the screen
// publishes the new unread count here so the dot clears without a refetch.
type Listener = (count: number) => void
const listeners = new Set<Listener>()
function publishUnread(count: number) {
  listeners.forEach((listener) => listener(count))
}

/**
 * Unread count for the bell dot. Loads on mount, refreshes when the app
 * returns to the foreground and once a minute, and follows changes made on
 * the inbox screen.
 */
export function useInboxUnreadCount(enabled = true): { unreadCount: number; refresh: () => void } {
  const [unreadCount, setUnreadCount] = useState(0)

  const refresh = useCallback(() => {
    if (!enabled) return
    void api<{ unreadCount: number }>('/me/notifications/unread-count')
      .then((res) => setUnreadCount(res?.unreadCount ?? 0))
      .catch(() => {})
  }, [enabled])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, POLL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  useEffect(() => {
    const listener: Listener = (count) => setUnreadCount(count)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') refresh()
    })
    return () => sub.remove()
  }, [refresh])

  return { unreadCount, refresh }
}

/** Paged inbox list with mark-read helpers (screen 09 Mitteilungen). */
export function useNotificationInbox() {
  const [items, setItems] = useState<InboxNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)
  const cursorRef = useRef<string | null>(null)

  useEffect(() => {
    if (!loading) publishUnread(unreadCount)
  }, [loading, unreadCount])

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'refresh') setRefreshing(true)
    setError(false)
    try {
      const page = await api<InboxNotificationPage>('/me/notifications?limit=30')
      cursorRef.current = page.nextCursor
      setItems(page.items)
      setUnreadCount(page.unreadCount)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load('initial')
  }, [load])

  const loadMore = useCallback(async () => {
    const cursor = cursorRef.current
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await api<InboxNotificationPage>(
        `/me/notifications?limit=30&cursor=${encodeURIComponent(cursor)}`,
      )
      cursorRef.current = page.nextCursor
      setItems((prev) => {
        const seen = new Set(prev.map((n) => n.id))
        return [...prev, ...page.items.filter((n) => !seen.has(n.id))]
      })
    } catch {
      // Keep what is shown; the next scroll retries.
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore])

  const markRead = useCallback(async (id: string) => {
    const now = new Date().toISOString()
    setItems((prev) => prev.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: now } : n)))
    setUnreadCount((n) => Math.max(0, n - 1))
    try {
      const res = await api<{ unreadCount: number }>(`/me/notifications/${id}/read`, { method: 'POST' })
      setUnreadCount(res.unreadCount)
    } catch {
      // Optimistic; the next refresh corrects the count.
    }
  }, [])

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString()
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })))
    setUnreadCount(0)
    try {
      await api('/me/notifications/read-all', { method: 'POST' })
    } catch {
      void load('refresh')
    }
  }, [load])

  return {
    items,
    unreadCount,
    loading,
    refreshing,
    loadingMore,
    error,
    hasMore: cursorRef.current !== null,
    refresh: () => load('refresh'),
    reload: () => {
      setLoading(true)
      return load('initial')
    },
    loadMore,
    markRead,
    markAllRead,
  }
}
