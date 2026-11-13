import type { ActingCandidateDto, ActingSessionDto } from '@anstoss/shared'
import { WORLD_TEAM_IDS } from './clubAdminWorld'

/**
 * E2E / preview mocks for Vorschau und Vertretung (boards 29/31):
 * GET /me/acting-session, GET /clubs/:clubId/acting-sessions/candidates,
 * POST /clubs/:clubId/acting-sessions, DELETE /acting-sessions/:id.
 * Only Vorstand (club-admin persona) may stand in; state is in memory and
 * reset when a persona is activated.
 */
type Response = { handled: true; ok: boolean; status: number; body?: unknown; message?: string; code?: string } | null

type Ctx = { scenario: string; pathname: string; method: string; body: unknown; clubId: string }

let current: ActingSessionDto | null = null
let counter = 0

export function resetActingMocks() {
  current = null
  counter = 0
}

const ok = (body: unknown, status = 200): Response => ({ handled: true, ok: true, status, body })
const fail = (status: number, code: string, message: string): Response => ({
  handled: true,
  ok: false,
  status,
  code,
  message,
})

function candidates(): ActingCandidateDto[] {
  return [
    { teamId: WORLD_TEAM_IDS.aJugend, teamName: 'A-Jugend', headCoachName: 'Jonas Brandt', coachAway: true },
    { teamId: WORLD_TEAM_IDS.eJugend, teamName: 'E-Jugend', headCoachName: 'Sabine Kraus', coachAway: false },
    { teamId: WORLD_TEAM_IDS.herren2, teamName: 'Herren II', headCoachName: 'Tobias Lenz', coachAway: false },
    { teamId: WORLD_TEAM_IDS.damen, teamName: 'Damen', headCoachName: 'Nina Arslan', coachAway: false },
    { teamId: WORLD_TEAM_IDS.cJugend, teamName: 'C-Jugend', headCoachName: null, coachAway: false },
  ]
}

function live(): ActingSessionDto | null {
  if (current && Date.parse(current.expiresAt) <= Date.now()) current = null
  return current
}

export function handleActingMock(ctx: Ctx): Response {
  const { method, pathname, clubId } = ctx
  const board = ctx.scenario === 'club-admin'

  if (method === 'GET' && pathname === '/me/acting-session') return ok({ session: live() })

  if (method === 'GET' && pathname === `/clubs/${clubId}/acting-sessions/candidates`) {
    return board ? ok({ items: candidates() }) : fail(403, 'ACTING_SESSION_FORBIDDEN', 'Forbidden')
  }

  if (method === 'POST' && pathname === `/clubs/${clubId}/acting-sessions`) {
    if (!board) return fail(403, 'ACTING_SESSION_FORBIDDEN', 'Forbidden')
    const input = (ctx.body ?? {}) as { teamId?: string; durationMin?: number; reason?: string }
    const team = candidates().find((item) => item.teamId === input.teamId)
    if (!team) return fail(404, 'ACTING_SESSION_TEAM_NOT_FOUND', 'Team not found')
    const minutes = input.durationMin === 15 || input.durationMin === 60 ? input.durationMin : 30
    const now = Date.now()
    counter += 1
    current = {
      id: `acting-e2e-${counter}`,
      clubId,
      teamId: team.teamId,
      teamName: team.teamName,
      role: 'COACH',
      reason: input.reason ?? null,
      startedAt: new Date(now).toISOString(),
      // Started a few seconds ago in the design ("Noch 28 Min" of 30).
      expiresAt: new Date(now + minutes * 60_000 - 90_000).toISOString(),
      endedAt: null,
    }
    return ok(current, 201)
  }

  const end = pathname.match(/^\/acting-sessions\/([^/]+)$/)
  if (method === 'DELETE' && end) {
    if (!current || current.id !== end[1]) return fail(404, 'ACTING_SESSION_NOT_ACTIVE', 'Not active')
    const ended = { ...current, endedAt: new Date().toISOString() }
    current = null
    return ok(ended)
  }

  return null
}
