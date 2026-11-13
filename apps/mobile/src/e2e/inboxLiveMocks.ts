import type {
  InboxNotification,
  MatchLiveEventDto,
  MatchLiveStateDto,
  MatchLiveStatus,
} from '@anstoss/shared'

/**
 * E2E / preview mocks for the notifications inbox (GET /me/notifications…)
 * and the coach-recorded live match (/clubs/:clubId/events/:eventId/live…).
 * State lives in memory and is reset when a persona is activated.
 */

type Response =
  | { handled: true; ok: boolean; status: number; body?: unknown; message?: string }
  | null

type Ctx = {
  scenario: string
  pathname: string
  method: string
  query: URLSearchParams | null
  body: unknown
  clubId: string
  teamId: string
  /** Display name of a team member, for timeline entries. */
  nameFor?: (userId: string) => string | null
}

let inbox: InboxNotification[] | null = null
const live = new Map<string, MatchLiveStateDto>()
let liveCounter = 0

export function resetInboxLiveMocks() {
  inbox = null
  live.clear()
  liveCounter = 0
}

const ok = (body: unknown, status = 200): Response => ({ handled: true, ok: true, status, body })

function minutesAgo(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString()
}

function seedInbox(ctx: Ctx): InboxNotification[] {
  const manager = ctx.scenario === 'coach' || ctx.scenario === 'club-admin'
  const base = (n: Partial<InboxNotification> & Pick<InboxNotification, 'id' | 'type' | 'title' | 'body' | 'createdAt'>): InboxNotification => ({
    clubId: ctx.clubId,
    teamId: ctx.teamId,
    target: null,
    readAt: null,
    ...n,
  })
  if (manager) {
    return [
      base({
        id: 'inbox-join',
        type: 'JOIN_REQUEST',
        title: 'Neue Beitrittsanfrage',
        body: 'Paul Krüger möchte der 1. Herren beitreten.',
        createdAt: minutesAgo(20),
        target: { type: 'join_request', clubId: ctx.clubId, requestId: 'jr-e2e-paul', actorName: 'Paul Krüger' },
      }),
      base({
        id: 'inbox-decline',
        type: 'RSVP_UPDATE',
        title: 'Mert Yılmaz hat für Sonntag abgesagt',
        body: 'Arbeit',
        createdAt: minutesAgo(95),
        target: { type: 'event_rsvp', clubId: ctx.clubId, eventId: 'event-match-next', actorName: 'Mert Yılmaz' },
      }),
      base({
        id: 'inbox-dues',
        type: 'CONTRIBUTION_PAID',
        title: '3 Beiträge sind eingegangen',
        body: '',
        createdAt: minutesAgo(180),
        target: { kind: 'CONTRIBUTION_PAID' },
      }),
      base({
        id: 'inbox-poll',
        type: 'POLL_CLOSED',
        title: 'Umfrage beendet',
        body: 'Mannschaftsabend im Vereinsheim',
        createdAt: minutesAgo(60 * 50),
        readAt: minutesAgo(60 * 49),
      }),
      base({
        id: 'inbox-fixture',
        type: 'FIXTURE_CHANGED',
        title: 'Spielplan von fussball.de aktualisiert',
        body: '',
        createdAt: minutesAgo(60 * 98),
        readAt: minutesAgo(60 * 97),
      }),
    ]
  }
  return [
    base({
      id: 'inbox-event',
      type: 'EVENT_CREATED',
      title: 'Neuer Termin · 1. Herren',
      body: 'Training am Dienstag, 18:30',
      createdAt: minutesAgo(45),
    }),
    base({
      id: 'inbox-lineup',
      type: 'LINEUP_POSTED',
      title: 'Aufstellung steht',
      body: '1. Herren · 4-2-3-1',
      createdAt: minutesAgo(60 * 30),
      readAt: minutesAgo(60 * 29),
    }),
  ]
}

function liveState(ctx: Ctx, eventId: string): MatchLiveStateDto {
  let state = live.get(eventId)
  if (!state) {
    state = {
      eventId,
      status: 'NOT_STARTED',
      goalsFor: 0,
      goalsAgainst: 0,
      scoreHome: 0,
      scoreAway: 0,
      homeAway: null,
      opponent: null,
      minute: null,
      kickoffAt: null,
      secondHalfAt: null,
      finishedAt: null,
      events: [],
      canRecord: false,
      opponentColor: '#B23A3A',
    }
    // Preview of design 15's running match: open /match-live?…&liveDemo=running.
    if (runningDemoRequested()) seedRunningDemo(state, ctx)
    live.set(eventId, state)
  }
  const canRecord = ctx.scenario === 'coach' || ctx.scenario === 'club-admin'
  return { ...state, canRecord, events: [...state.events] }
}

function runningDemoRequested(): boolean {
  try {
    return typeof window !== 'undefined' && /[?&]liveDemo=running\b/.test(window.location?.search ?? '')
  } catch {
    return false
  }
}

/** Second half, 63rd minute, 1:0 with a goal and a booking (design 15). */
function seedRunningDemo(state: MatchLiveStateDto, ctx: Ctx) {
  const at = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString()
  state.status = 'SECOND_HALF'
  state.kickoffAt = at(63 + 15 - 1)
  state.secondHalfAt = at(63 - 45 - 1)
  const entry = (id: string, kind: MatchLiveEventDto['kind'], minute: number, name: string) => ({
    id,
    kind,
    minute,
    playerUserId: null,
    playerName: name,
    relatedUserId: null,
    relatedName: null,
    createdAt: at(63 - minute),
  })
  state.events = [
    entry('live-demo-2', 'YELLOW', 41, ctx.nameFor?.('player-2') ?? 'Tomasz Nowak'),
    entry('live-demo-1', 'GOAL', 23, ctx.nameFor?.('player-1') ?? 'Kofi Osei'),
  ]
  recount(state)
}

function recount(state: MatchLiveStateDto) {
  state.goalsFor = state.events.filter((e) => e.kind === 'GOAL').length
  state.goalsAgainst = state.events.filter((e) => e.kind === 'CONCEDED').length
  const away = state.homeAway === 'AWAY'
  state.scoreHome = away ? state.goalsAgainst : state.goalsFor
  state.scoreAway = away ? state.goalsFor : state.goalsAgainst
}

function runningMinute(state: MatchLiveStateDto): number {
  const since = (iso: string | null) =>
    iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)) + 1 : 0
  if (state.status === 'FIRST_HALF') return since(state.kickoffAt)
  if (state.status === 'SECOND_HALF') return 45 + since(state.secondHalfAt)
  if (state.status === 'HALF_TIME') return 45
  return 90
}

export function handleInboxLiveMock(ctx: Ctx): Response {
  const { pathname, method } = ctx

  // ── inbox ──
  if (pathname.startsWith('/me/notifications')) {
    if (!inbox) inbox = seedInbox(ctx)
    const unread = () => inbox!.filter((n) => !n.readAt).length
    if (method === 'GET' && pathname === '/me/notifications') {
      return ok({ items: inbox, nextCursor: null, unreadCount: unread() })
    }
    if (method === 'GET' && pathname === '/me/notifications/unread-count') {
      return ok({ unreadCount: unread() })
    }
    if (method === 'POST' && pathname === '/me/notifications/read-all') {
      const now = new Date().toISOString()
      inbox = inbox.map((n) => (n.readAt ? n : { ...n, readAt: now }))
      return ok({ unreadCount: 0 })
    }
    const read = pathname.match(/^\/me\/notifications\/([^/]+)\/read$/)
    if (method === 'POST' && read) {
      const now = new Date().toISOString()
      inbox = inbox.map((n) => (n.id === read[1] && !n.readAt ? { ...n, readAt: now } : n))
      return ok({ unreadCount: unread() })
    }
  }

  // ── live match ──
  const liveMatch = pathname.match(/^\/clubs\/[^/]+\/events\/([^/]+)\/live(?:\/events(?:\/([^/]+))?)?$/)
  if (liveMatch) {
    const eventId = liveMatch[1]
    const isEvents = pathname.includes('/live/events')
    const state = live.get(eventId) ?? (liveState(ctx, eventId), live.get(eventId)!)
    if (method === 'GET' && !isEvents) {
      return ok({ ...liveState(ctx, eventId), minute: state.status === 'NOT_STARTED' ? null : runningMinute(state) })
    }
    if (method === 'PATCH' && !isEvents) {
      const status = (ctx.body as { status?: MatchLiveStatus })?.status
      const now = new Date().toISOString()
      if (status === 'FIRST_HALF') state.kickoffAt = now
      if (status === 'SECOND_HALF') state.secondHalfAt = now
      if (status === 'FINISHED') state.finishedAt = now
      if (status) state.status = status
      return ok({ ...liveState(ctx, eventId), minute: runningMinute(state) })
    }
    if (method === 'POST' && isEvents) {
      const input = ctx.body as {
        kind: MatchLiveEventDto['kind']
        minute?: number
        playerUserId?: string
        relatedUserId?: string
      }
      liveCounter += 1
      state.events.unshift({
        id: `live-e2e-${liveCounter}`,
        kind: input.kind,
        minute: input.minute ?? runningMinute(state),
        playerUserId: input.playerUserId ?? null,
        playerName: input.playerUserId ? ctx.nameFor?.(input.playerUserId) ?? null : null,
        relatedUserId: input.relatedUserId ?? null,
        relatedName: input.relatedUserId ? ctx.nameFor?.(input.relatedUserId) ?? null : null,
        createdAt: new Date().toISOString(),
      })
      recount(state)
      return ok({ ...liveState(ctx, eventId), minute: runningMinute(state) })
    }
    if (method === 'DELETE' && liveMatch[2]) {
      state.events = state.events.filter((e) => e.id !== liveMatch[2])
      recount(state)
      return ok({ ...liveState(ctx, eventId), minute: runningMinute(state) })
    }
  }

  return null
}
