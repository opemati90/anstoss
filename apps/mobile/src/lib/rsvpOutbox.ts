import { useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { ApiError, api } from '../api/client'

/**
 * Offline RSVP outbox (redesign board 29, handoff "Answers given offline are
 * queued and sent on reconnect, with visible 'Wartet' state").
 *
 * A reply that fails for lack of a connection is kept here (persisted) and
 * the screen keeps the optimistic answer. `flushRsvpOutbox` re-sends every
 * queued reply once the device is back online; a reply the server rejects
 * for any other reason is dropped so it never blocks the queue.
 */

export type QueuedRsvp = {
  /** One entry per (event, person): a newer answer replaces the older one. */
  key: string
  clubId: string
  eventId: string
  status: 'YES' | 'MAYBE' | 'NO'
  reason?: string
  note?: string
  /** Set when a parent answers for a child (rsvp-proxy). */
  childUserId?: string | null
  /** For the "1 Zusage wartet · Training Di 18:30" row. */
  title: string
  date: string
  queuedAt: string
}

const STORAGE_KEY = 'anstoss:rsvp-outbox'

let items: QueuedRsvp[] = []
let hydrated = false
let flushing = false
const listeners = new Set<() => void>()

function emit(next: QueuedRsvp[]) {
  items = next
  listeners.forEach((listener) => listener())
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {})
}

async function hydrate() {
  if (hydrated) return
  hydrated = true
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    if (Array.isArray(parsed) && parsed.length > 0) {
      items = [...(parsed as QueuedRsvp[]), ...items.filter((i) => !parsed.some((p: QueuedRsvp) => p.key === i.key))]
      listeners.forEach((listener) => listener())
    }
  } catch {
    // A corrupt outbox is dropped rather than blocking every reply.
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  void hydrate()
  return () => {
    listeners.delete(listener)
  }
}

export function getRsvpOutbox(): QueuedRsvp[] {
  return items
}

export function useRsvpOutbox(): QueuedRsvp[] {
  return useSyncExternalStore(subscribe, getRsvpOutbox, getRsvpOutbox)
}

/** True when the request never reached the server (no connection, timeout). */
export function isOfflineError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status === 0 || error.code === 'network_error' || error.code === 'timeout'
  }
  return error instanceof TypeError
}

export function enqueueRsvp(entry: Omit<QueuedRsvp, 'queuedAt'>) {
  emit([...items.filter((item) => item.key !== entry.key), { ...entry, queuedAt: new Date().toISOString() }])
}

export function clearRsvpOutbox() {
  emit([])
}

/** Sends every queued reply; keeps only those that still cannot reach the server. */
export async function flushRsvpOutbox(): Promise<void> {
  if (flushing || items.length === 0) return
  flushing = true
  try {
    const remaining: QueuedRsvp[] = []
    for (const item of items) {
      const body = {
        status: item.status,
        ...(item.status === 'NO' && item.reason ? { reason: item.reason } : {}),
        ...(item.status === 'NO' && item.note ? { note: item.note } : {}),
        ...(item.childUserId ? { childUserId: item.childUserId } : {}),
      }
      const path = item.childUserId
        ? `/clubs/${item.clubId}/events/${item.eventId}/rsvp-proxy`
        : `/clubs/${item.clubId}/events/${item.eventId}/rsvp`
      try {
        await api(path, { method: 'PUT', body })
      } catch (error) {
        if (isOfflineError(error)) remaining.push(item)
      }
    }
    emit(remaining)
  } finally {
    flushing = false
  }
}
