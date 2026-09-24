/**
 * Live-inbox helpers (chat revamp, H4 client). Pure and timer-injectable so
 * the coalescing and typing expiry are unit-tested without a socket.
 */

type Timers = {
  now: () => number
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
}

const realTimers: Timers = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export const INBOX_REFETCH_INTERVAL_MS = 2000

/**
 * Leading + trailing throttle: the first `inbox:update` refetches at once,
 * every further update inside the window collapses into one trailing
 * refetch at the window's end. A busy match-day thread therefore costs at
 * most one inbox request per ~2s, however many readers fan out to us.
 */
export function createRefetchThrottle(
  run: () => void,
  intervalMs: number = INBOX_REFETCH_INTERVAL_MS,
  timers: Timers = realTimers,
) {
  let lastRun = -Infinity
  let trailing: unknown = null

  const fire = () => {
    trailing = null
    lastRun = timers.now()
    run()
  }

  return {
    schedule() {
      const elapsed = timers.now() - lastRun
      if (elapsed >= intervalMs && trailing === null) {
        fire()
        return
      }
      if (trailing !== null) return
      trailing = timers.setTimeout(fire, Math.max(0, intervalMs - elapsed))
    },
    cancel() {
      if (trailing !== null) timers.clearTimeout(trailing)
      trailing = null
    },
  }
}

export const INBOX_TYPING_TTL_MS = 4000

export type InboxTypingEvent = {
  type?: 'CHANNEL' | 'DM'
  id?: string
  userName?: string
}

export type InboxTypingMap = Record<string, { userName: string | null; until: number }>

/** Record one `inbox:typing` event; the entry expires after the TTL. */
export function applyTyping(
  map: InboxTypingMap,
  event: InboxTypingEvent | null | undefined,
  now: number,
  ttlMs: number = INBOX_TYPING_TTL_MS,
): InboxTypingMap {
  if (!event?.id || typeof event.id !== 'string') return map
  const userName = typeof event.userName === 'string' && event.userName.trim() ? event.userName.trim() : null
  return { ...map, [event.id]: { userName, until: now + ttlMs } }
}

/** Drop expired entries. Returns the same object when nothing changed. */
export function pruneTyping(map: InboxTypingMap, now: number): InboxTypingMap {
  let changed = false
  const next: InboxTypingMap = {}
  for (const [id, entry] of Object.entries(map)) {
    if (entry.until > now) next[id] = entry
    else changed = true
  }
  return changed ? next : map
}
