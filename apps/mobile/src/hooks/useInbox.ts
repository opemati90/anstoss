import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { useFocusEffect } from 'expo-router'
import { io, type Socket } from 'socket.io-client'
import { CHAT, type InboxItem } from '@anstoss/shared'
import { api, API_URL } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { getE2ESession } from '../e2e/session'
import { totalUnread } from '../components/chat/inboxModel'
import {
  applyTyping,
  createRefetchThrottle,
  pruneTyping,
  type InboxTypingEvent,
  type InboxTypingMap,
} from './inboxLive'

/**
 * One inbox per club, shared by the Chat tab and the tab-bar badge.
 *
 * A tiny external store (not React state) so the badge and the list read the
 * same snapshot without fetching twice. Refetches on focus, on the
 * `inbox:update` socket event the gateway sends to the user's room, and
 * after a conversation is read or muted.
 */

export type InboxStatus = 'idle' | 'loading' | 'ready' | 'error'

type InboxSnapshot = {
  clubId: string | null
  items: InboxItem[]
  status: InboxStatus
}

let snapshot: InboxSnapshot = { clubId: null, items: [], status: 'idle' }
const listeners = new Set<() => void>()
let inflight: Promise<void> | null = null
let inflightClubId: string | null = null
let queuedRefetch = false

function emit(next: InboxSnapshot) {
  snapshot = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot() {
  return snapshot
}

/** Fetch the inbox for a club. Coalesces concurrent calls. */
export function refreshInbox(clubId: string | null | undefined): Promise<void> {
  if (!clubId) {
    if (snapshot.clubId !== null || snapshot.items.length > 0) {
      emit({ clubId: null, items: [], status: 'ready' })
    }
    return Promise.resolve()
  }
  if (inflight && inflightClubId === clubId) {
    queuedRefetch = true
    return inflight
  }
  if (snapshot.clubId !== clubId) {
    emit({ clubId, items: [], status: 'loading' })
  } else if (snapshot.status !== 'ready') {
    emit({ ...snapshot, status: 'loading' })
  }
  inflightClubId = clubId
  inflight = api<InboxItem[]>(`/clubs/${clubId}/inbox`)
    .then((items) => {
      if (snapshot.clubId !== clubId) return
      emit({ clubId, items: Array.isArray(items) ? items : [], status: 'ready' })
    })
    .catch(() => {
      if (snapshot.clubId !== clubId) return
      // Keep the last good list on a failed refresh; only an empty first
      // load surfaces the error state.
      emit({ ...snapshot, status: snapshot.items.length > 0 ? 'ready' : 'error' })
    })
    .finally(() => {
      inflight = null
      inflightClubId = null
      if (queuedRefetch) {
        queuedRefetch = false
        void refreshInbox(clubId)
      }
    })
  return inflight
}

/** Optimistically patch one row (mute toggle, mark read) before the refetch. */
export function patchInboxItem(id: string, patch: Partial<InboxItem>) {
  if (!snapshot.items.some((item) => item.id === id)) return
  emit({
    ...snapshot,
    items: snapshot.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
  })
}

/** Test hook. */
export function __resetInboxStore() {
  snapshot = { clubId: null, items: [], status: 'idle' }
  inflight = null
  inflightClubId = null
  queuedRefetch = false
  listeners.clear()
}

/** Unread count of one inbox row right now (the thread's "Neue Nachrichten" divider). */
export function getInboxUnread(id: string): number {
  return snapshot.items.find((item) => item.id === id)?.unreadCount ?? 0
}

export function useInboxSnapshot(): InboxSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Unread total across unmuted conversations for the tab badge. */
export function useInboxUnreadCount(): number {
  const { activeClub } = useAuth()
  const clubId = activeClub?.club.id ?? null
  const state = useInboxSnapshot()

  // The Chat tab screen is mounted eagerly (lazy: false), but refetch on
  // club change here too so the badge is right before the tab is visited.
  useEffect(() => {
    if (clubId && state.clubId !== clubId) void refreshInbox(clubId)
  }, [clubId, state.clubId])

  if (!clubId || state.clubId !== clubId) return 0
  return totalUnread(state.items)
}

/**
 * The inbox list. Loads on focus and live-refreshes from `inbox:update`
 * (coalesced to at most one refetch per ~2s). `typing` maps a row id to who
 * is typing there right now (from `inbox:typing`, expires after ~4s).
 */
export function useInbox() {
  const { activeClub, token, user } = useAuth()
  const clubId = activeClub?.club.id ?? null
  const state = useInboxSnapshot()
  const [typing, setTyping] = useState<InboxTypingMap>({})

  const refetch = useCallback(() => refreshInbox(clubId), [clubId])

  useFocusEffect(
    useCallback(() => {
      void refreshInbox(clubId)
    }, [clubId]),
  )

  useEffect(() => {
    if (!clubId || !token || !user?.id || getE2ESession()) return
    let socket: Socket | null = io(`${API_URL}/chat`, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: CHAT.RECONNECT_BACKOFF[0],
      reconnectionDelayMax: CHAT.RECONNECT_BACKOFF[CHAT.RECONNECT_BACKOFF.length - 1],
      transports: ['websocket'],
    })
    // Bursts (a busy match-day thread) collapse into one refetch per window.
    const throttle = createRefetchThrottle(() => void refreshInbox(clubId))
    const schedule = () => throttle.schedule()
    socket.on('inbox:update', schedule)
    socket.on('inbox:typing', (event: InboxTypingEvent) => {
      setTyping((prev) => applyTyping(prev, event, Date.now()))
    })
    // After a reconnect we may have missed updates.
    socket.io.on('reconnect', schedule)
    return () => {
      throttle.cancel()
      socket?.disconnect()
      socket = null
      setTyping({})
    }
  }, [clubId, token, user?.id])

  // Expire typing entries; the interval only runs while someone is typing.
  const typingActive = Object.keys(typing).length > 0
  useEffect(() => {
    if (!typingActive) return
    const timer = setInterval(() => setTyping((prev) => pruneTyping(prev, Date.now())), 1000)
    return () => clearInterval(timer)
  }, [typingActive])

  const matchesClub = state.clubId === clubId
  return {
    items: matchesClub ? state.items : [],
    status: (clubId ? (matchesClub ? state.status : 'loading') : 'ready') as InboxStatus,
    refetch,
    typing,
  }
}
