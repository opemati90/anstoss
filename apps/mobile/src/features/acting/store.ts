import { useSyncExternalStore } from 'react'
import type { ActingSessionDto } from '@anstoss/shared'
import { setWriteBlocker } from '../../api/client'

/**
 * Vorschau und Vertretung (redesign 29/31) — app-wide "view as" state.
 *
 * - `preview`: client-only, read-only look at the app as a player or parent
 *   of one team. Every write request is refused while it runs.
 * - `acting`: a server-side stand-in session (POST /clubs/:id/acting-sessions);
 *   the API grants coach permissions for that team until it expires.
 *
 * AuthContext reads this store to present the matching role mode and team, so
 * every screen renders as that role without knowing about this feature.
 */
export type PreviewMode = 'PLAYER' | 'PARENT'
export type ViewAsTeam = { id: string; name: string; clubId: string }
export type ViewAsState = {
  preview: { mode: PreviewMode; team: ViewAsTeam } | null
  acting: ActingSessionDto | null
}

let state: ViewAsState = { preview: null, acting: null }
const listeners = new Set<() => void>()

function emit(next: ViewAsState) {
  state = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getViewAsState(): ViewAsState {
  return state
}

export function useViewAs(): ViewAsState {
  return useSyncExternalStore(subscribe, getViewAsState, getViewAsState)
}

/** Writes allowed during a preview: signing in/out and ending the preview itself. */
function isAllowedDuringPreview(path: string) {
  return path.startsWith('/auth/') || path.includes('/acting-sessions')
}

export function startPreview(mode: PreviewMode, team: ViewAsTeam) {
  setWriteBlocker((method, path) => method !== 'GET' && !isAllowedDuringPreview(path))
  emit({ ...state, preview: { mode, team } })
}

export function endPreview() {
  setWriteBlocker(null)
  emit({ ...state, preview: null })
}

export function setActingSession(session: ActingSessionDto | null) {
  emit({ ...state, acting: session })
}

/** Sign-out / account switch: forget everything. */
export function resetViewAs() {
  setWriteBlocker(null)
  emit({ preview: null, acting: null })
}

/** Whole minutes left (rounded up), 0 once expired. */
export function minutesLeft(expiresAt: string, now = Date.now()): number {
  const ms = Date.parse(expiresAt) - now
  return ms > 0 ? Math.ceil(ms / 60_000) : 0
}
