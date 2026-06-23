import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { getE2ESession } from '../e2e/session'

/**
 * Fresh RSVP counts pushed by the API's `/events` gateway when any member
 * RSVPs. Lets the events feed self-heal stale counts without a refetch.
 */
export type EventRsvpUpdate = {
  eventId: string
  teamId: string
  yesCount: number
  maybeCount: number
  noCount: number
  responseCount: number
}

export type EventUpsert = {
  eventId: string
  teamId: string
}

type UseEventsSocketOptions = {
  teamId: string | null
  token: string | null
  apiUrl: string
  /** Called with fresh counts whenever an RSVP changes for any event in the team. */
  onRsvpUpdate?: (update: EventRsvpUpdate) => void
  /** Called when an event is created or updated; consumers typically refetch. */
  onEventUpsert?: (event: EventUpsert) => void
}

/**
 * Subscribe to the team's `/events` Socket.io room and forward realtime
 * deltas to the caller. Connects only when both teamId and token are present.
 *
 * The callbacks are stored in refs so a parent re-render (new closure each
 * time) doesn't tear down and rebuild the socket — the connection's lifecycle
 * is keyed purely on teamId/token/apiUrl.
 */
export function useEventsSocket({
  teamId,
  token,
  apiUrl,
  onRsvpUpdate,
  onEventUpsert,
}: UseEventsSocketOptions) {
  const onRsvpUpdateRef = useRef(onRsvpUpdate)
  const onEventUpsertRef = useRef(onEventUpsert)
  onRsvpUpdateRef.current = onRsvpUpdate
  onEventUpsertRef.current = onEventUpsert

  useEffect(() => {
    if (!teamId || !token) return
    // E2E/demo sessions stub the network; no live socket to connect to.
    if (getE2ESession()) return

    const socket: Socket = io(`${apiUrl}/events`, {
      auth: { token },
      reconnection: true,
      transports: ['websocket'],
    })

    socket.on('connect', () => {
      socket.emit('join', { teamId })
    })

    socket.on('connect_error', () => {
      // Refresh the token for the next reconnection attempt.
      socket.auth = { token }
    })

    socket.on('event:rsvp', (update: EventRsvpUpdate) => {
      onRsvpUpdateRef.current?.(update)
    })

    socket.on('event:upsert', (event: EventUpsert) => {
      onEventUpsertRef.current?.(event)
    })

    return () => {
      socket.emit('leave', { teamId })
      socket.disconnect()
    }
  }, [teamId, token, apiUrl])
}
