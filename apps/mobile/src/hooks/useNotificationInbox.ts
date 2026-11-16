import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import type { InboxNotification, InboxNotificationPage } from '@anstoss/shared'
import { api } from '../api/client'
import { subscribeNotifications } from '../lib/notificationEvents'
import { useForegroundRefresh } from './useForegroundRefresh'
import { useAuth } from '../context/AuthContext'

const POLL_MS = 15_000
class InvalidNotificationPageError extends Error {
  constructor() { super('Invalid notification inbox response'); this.name = 'InvalidNotificationPageError' }
}

// The bell and the inbox screen live in different navigators; the screen
// publishes the new unread count here so the dot clears without a refetch.
type Listener = (scope: string, count: number) => void
const listeners = new Set<Listener>()
function publishUnread(scope: string, count: number) {
  listeners.forEach((listener) => listener(scope, count))
}

/** In-memory only: no response or broadcast may cross a login boundary. */
function useInboxScope() {
  const { user, token } = useAuth()
  const key = JSON.stringify([user?.id, token])
  const generation = useRef({ key })
  if (generation.current.key !== key) generation.current = { key }
  const scope = generation.current
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const current = useCallback(() => mounted.current && generation.current === scope, [scope])
  return { scope, current, enabled: !!user?.id }
}

/**
 * Unread count for the bell dot. Loads on mount, refreshes when the app
 * returns to the foreground and every 15 seconds while active, and follows changes made on
 * the inbox screen.
 */
export function useInboxUnreadCount(enabled = true): { unreadCount: number; refresh: () => void } {
  const { scope, current, enabled: signedIn } = useInboxScope()
  const [unreadCount, setUnreadCount] = useState(0)
  const valueScope = useRef(scope)
  const sequence = useRef(0)

  const refresh = useCallback(() => {
    // React Native may not have resolved AppState yet on a cold launch.
    // Still load the initial count; only known background states suppress it.
    if (!enabled || !signedIn || !current() || AppState.currentState === 'background' || AppState.currentState === 'inactive')
      return
    const request = ++sequence.current
    void api<{ unreadCount: number }>('/me/notifications/unread-count')
      .then((res) => {
        if (current() && request === sequence.current) setUnreadCount(res?.unreadCount ?? 0)
      })
      .catch(() => {})
  }, [enabled, signedIn, current])

  useEffect(() => {
    valueScope.current = scope
    setUnreadCount(0)
    refresh()
    const unsubscribe = subscribeNotifications(refresh)
    const timer = setInterval(refresh, POLL_MS)
    return () => {
      clearInterval(timer)
      unsubscribe()
    }
  }, [refresh, scope])

  useEffect(() => {
    const listener: Listener = (key, count) => {
      if (enabled && signedIn && current() && key === scope.key) {
        sequence.current += 1
        setUnreadCount(count)
      }
    }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [scope, enabled, signedIn, current])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') refresh()
    })
    return () => sub.remove()
  }, [refresh])

  return { unreadCount: enabled && signedIn && valueScope.current === scope ? unreadCount : 0, refresh }
}

/** Paged inbox list with mark-read helpers (screen 09 Mitteilungen). */
export function useNotificationInbox() {
  const { scope, current, enabled } = useInboxScope()
  const valueScope = useRef(scope)
  const sequence = useRef(0)
  const mutations = useRef({ scope, count: 0 })
  if (mutations.current.scope !== scope) mutations.current = { scope, count: 0 }
  const [items, setItems] = useState<InboxNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)
  const cursorRef = useRef<string | null>(null)

  useEffect(() => {
    if (!loading && enabled && valueScope.current === scope) publishUnread(scope.key, unreadCount)
  }, [loading, unreadCount, scope, enabled])

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'background') => {
    if (!enabled || !current() || mutations.current.count > 0) return
    const request = ++sequence.current
    if (mode === 'refresh') setRefreshing(true)
    setError(false)
    try {
      const page = await api<InboxNotificationPage>('/me/notifications?limit=30')
      if (!page || !Array.isArray(page.items)) throw new InvalidNotificationPageError()
      if (!current() || request !== sequence.current) return
      if (mode === 'background') {
        // Keep already-paginated history and its cursor while adding arrivals.
        setItems((previous) => {
          const freshIds = new Set(page.items.map((item) => item.id))
          return [...page.items, ...previous.filter((item) => !freshIds.has(item.id))]
        })
      } else {
        cursorRef.current = page.nextCursor
        setItems(page.items)
      }
      setUnreadCount(page.unreadCount)
    } catch {
      if (current() && request === sequence.current) setError(true)
    } finally {
      if (current() && request === sequence.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [enabled, current])

  useEffect(() => {
    valueScope.current = scope
    cursorRef.current = null
    setItems([])
    setUnreadCount(0)
    setLoading(enabled)
    setLoadingMore(false)
    setRefreshing(false)
    setError(false)
    void load('initial')
  }, [load, scope, enabled])

  useForegroundRefresh(useCallback(() => load('background'), [load]), enabled)

  const loadMore = useCallback(async () => {
    const cursor = cursorRef.current
    if (!enabled || !current() || mutations.current.count > 0 || !cursor || loadingMore) return
    const request = sequence.current
    setLoadingMore(true)
    try {
      const page = await api<InboxNotificationPage>(
        `/me/notifications?limit=30&cursor=${encodeURIComponent(cursor)}`,
      )
      if (!current() || request !== sequence.current) return
      cursorRef.current = page.nextCursor
      setItems((prev) => {
        const seen = new Set(prev.map((n) => n.id))
        return [...prev, ...page.items.filter((n) => !seen.has(n.id))]
      })
    } catch {
      // Keep what is shown; the next scroll retries.
    } finally {
      if (current()) setLoadingMore(false)
    }
  }, [loadingMore, enabled, current])

  const markRead = useCallback(async (id: string) => {
    if (!enabled || !current()) return
    const writes = mutations.current
    writes.count += 1
    const request = ++sequence.current
    setRefreshing(false)
    setLoading(false)
    const now = new Date().toISOString()
    setItems((prev) => prev.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: now } : n)))
    setUnreadCount((n) => Math.max(0, n - 1))
    try {
      const res = await api<{ unreadCount: number }>(`/me/notifications/${id}/read`, {
        method: 'POST',
      })
      if (current() && request === sequence.current) setUnreadCount(res.unreadCount)
    } catch {
      // Optimistic; the next refresh corrects the count.
    } finally {
      writes.count -= 1
      if (current() && writes.count === 0) void load('background')
    }
  }, [enabled, current, load])

  const markAllRead = useCallback(async () => {
    if (!enabled || !current()) return
    const writes = mutations.current
    writes.count += 1
    sequence.current += 1
    setRefreshing(false)
    setLoading(false)
    const now = new Date().toISOString()
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })))
    setUnreadCount(0)
    try {
      await api('/me/notifications/read-all', { method: 'POST' })
    } catch {
      // The canonical refresh below also recovers failed optimistic writes.
    } finally {
      writes.count -= 1
      if (current() && writes.count === 0) void load('background')
    }
  }, [load, enabled, current])

  return {
    items: enabled && valueScope.current === scope ? items : [],
    unreadCount: enabled && valueScope.current === scope ? unreadCount : 0,
    loading: enabled && (valueScope.current !== scope || loading),
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
