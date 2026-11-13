import type { MemberRoleKey, MoreSummary, TeamMemberProfile } from '@anstoss/shared'

/**
 * Redesign team boards (17 Spielerprofil, 18 Mehr): the e2e side of the
 * contracts in packages/shared/src/schemas/team-boards.ts. Data is
 * deterministic per user so captures stay stable.
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
  /** Unsettled dues rows the treasurer sees (club-admin persona). */
  openClubDues: () => number
  /** Our place in the mocked league table, if any. */
  tablePosition: () => number | null
}

const ok = (body: unknown, status = 200): Response => ({ handled: true, ok: true, status, body })

// Role overrides made through PUT …/roles during the session.
let roleOverrides: Record<string, MemberRoleKey[]> = {}

export function resetTeamBoardMocks() {
  roleOverrides = {}
}

function hash(value: string) {
  let h = 0
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) >>> 0
  return h
}

function defaultRoles(userId: string): MemberRoleKey[] {
  if (userId.startsWith('coach') || userId.includes('coach')) return ['COACH']
  // One captain in the demo squad (the shirt-9 striker in the design).
  if (userId === 'user-player-12') return ['PLAYER', 'CAPTAIN']
  if (userId === 'user-player-1') return ['PLAYER', 'TEAM_MANAGER']
  return ['PLAYER']
}

export function mockMemberProfile(userId: string): TeamMemberProfile {
  const h = hash(userId)
  const items = Array.from({ length: 8 }, (_, i) => ((h >> i) & 7) !== 0)
  const roles = roleOverrides[userId] ?? defaultRoles(userId)
  const isPlayer = roles.includes('PLAYER')
  return {
    userId,
    roles,
    memberSince: `${2019 + (h % 6)}-08-01T00:00:00.000Z`,
    season: '2026/27',
    stats: isPlayer
      ? { appearances: 4 + (h % 7), goals: h % 7, assists: (h >> 3) % 5 }
      : null,
    attendance: {
      items,
      attended: items.filter(Boolean).length,
      total: items.length,
    },
    duesState: userId === 'user-player-2' ? 'OVERDUE' : userId === 'user-player-1' ? 'OPEN' : 'CURRENT',
    playerPass: isPlayer
      ? { number: `${100000 + (h % 899999)}`, validUntil: '2027-06-30T00:00:00.000Z' }
      : null,
  }
}

export function handleTeamBoardMock(ctx: Ctx): Response {
  const { pathname, method, query } = ctx

  if (method === 'GET' && pathname === '/me/summary') {
    const admin = ctx.scenario === 'club-admin'
    const body: MoreSummary = {
      openDues: admin ? ctx.openClubDues() : null,
      tablePosition: query?.get('teamId') === ctx.teamId ? ctx.tablePosition() : null,
      newFreeAgents: 3,
      teamInviteCode: query?.get('teamId') === ctx.teamId ? 'SVA-7K2Q' : null,
    }
    return ok(body)
  }

  const profile = pathname.match(
    new RegExp(`^/clubs/${ctx.clubId}/teams/${ctx.teamId}/members/([^/]+)/(profile|roles)$`),
  )
  if (profile) {
    const userId = profile[1]
    if (method === 'GET' && profile[2] === 'profile') return ok(mockMemberProfile(userId))
    if (method === 'PUT' && profile[2] === 'roles') {
      const roles = ((ctx.body as { roles?: MemberRoleKey[] } | null)?.roles ?? []).slice()
      roleOverrides[userId] = roles
      return ok(mockMemberProfile(userId))
    }
  }

  return null
}
