import type { AdminInbox, MemberListPage } from '@anstoss/shared'
import { activateE2EScenario, clearE2ESession, handleE2EApiRequest } from '../e2e/session'

const CLUB = '/clubs/club-e2e-sv-albatros'

function get<T>(path: string): T {
  const response = handleE2EApiRequest(path, { method: 'GET' })
  if (!response.handled || !response.ok) throw new Error(`Expected ${path} to be mocked`)
  return response.body as T
}

describe('club-admin e2e world', () => {
  beforeEach(async () => {
    await activateE2EScenario('club-admin')
  })

  afterEach(async () => {
    await clearE2ESession()
  })

  it('agrees on 126 members and 8 teams across stats, members and the inbox', () => {
    const stats = get<{ memberCount: number; teamCount: number }>(`${CLUB}/stats`)
    const page = get<MemberListPage>(`${CLUB}/members?limit=50&offset=0&filter=all`)
    const inbox = get<AdminInbox>(`${CLUB}/admin-inbox`)
    const groups = get<Array<{ teams: unknown[] }>>(`${CLUB}/team-groups`)

    expect(stats).toEqual(expect.objectContaining({ memberCount: 126, teamCount: 8 }))
    expect(page.total).toBe(126)
    expect(page.items).toHaveLength(50)
    expect(page.counts.all).toBe(126)
    expect(page.counts.active + page.counts.passive).toBe(126)
    expect(inbox.memberCount).toBe(126)
    expect(inbox.teamCount).toBe(8)
    expect(groups.flatMap((group) => group.teams)).toHaveLength(8)
  })

  it('seeds the admin tasks the Aufgaben inbox shows', () => {
    const inbox = get<AdminInbox>(`${CLUB}/admin-inbox`)

    expect(inbox.joinRequests.count).toBe(2)
    expect(inbox.overdueDues.count).toBe(4)
    expect(inbox.overdueDues.amount).toBe(15000)
    expect(inbox.teamsWithoutHeadCoach.items.map((team) => team.teamName)).toEqual([
      'D-Jugend (U13)',
    ])
    expect(inbox.safeguarding.items.map((item) => item.name).sort()).toEqual([
      'Katrin Vogt',
      'Stefan Braun',
    ])
    expect(inbox.unfilledOffices.items).toEqual([{ office: 'TREASURER' }])
    expect(inbox.totalOpen).toBe(10)
  })

  it('clears a Führungszeugnis task once it is marked presented', () => {
    const inbox = get<AdminInbox>(`${CLUB}/admin-inbox`)
    const stefan = inbox.safeguarding.items.find((item) => item.name === 'Stefan Braun')
    if (!stefan) throw new Error('Expected Stefan Braun to need a Führungszeugnis')

    const post = handleE2EApiRequest(`${CLUB}/compliance`, {
      method: 'POST',
      body: {
        memberUserId: stefan.memberUserId,
        kind: 'FUEHRUNGSZEUGNIS',
        issuedAt: new Date().toISOString(),
      },
    })
    expect(post.handled && post.ok).toBe(true)

    const after = get<AdminInbox>(`${CLUB}/admin-inbox`)
    expect(after.safeguarding.count).toBe(1)
    const summary = get<{ safeguarding: { status: string } | null }>(
      `${CLUB}/members/${stefan.memberUserId}/admin-summary`,
    )
    expect(summary.safeguarding?.status).toBe('VALID')
  })

  it('filters members into active, passive and youth', () => {
    const passive = get<MemberListPage<{ isActive: boolean }>>(
      `${CLUB}/members?limit=100&filter=passive`,
    )
    const youth = get<MemberListPage<{ isYouth: boolean }>>(`${CLUB}/members?limit=100&filter=youth`)

    expect(passive.items.every((item) => item.isActive === false)).toBe(true)
    expect(passive.total).toBe(passive.counts.passive)
    expect(youth.items.every((item) => item.isYouth)).toBe(true)
    expect(youth.total).toBe(youth.counts.youth)
  })

  it('seeds two open chat reports, one overdue, and resolves them', () => {
    const open = get<Array<{ id: string; overdue: boolean }>>(
      `${CLUB}/moderation/reports?status=open&limit=100`,
    )
    expect(open).toHaveLength(2)
    expect(open.filter((report) => report.overdue)).toHaveLength(1)
    const resolved = handleE2EApiRequest(`${CLUB}/moderation/reports/report-1/resolve`, {
      method: 'POST',
      body: { action: 'remove' },
    })
    expect(resolved.handled && resolved.ok).toBe(true)
    expect(get<unknown[]>(`${CLUB}/moderation/reports?status=open`)).toHaveLength(1)
  })

  it('serves report evidence and escalates a staff-sender report on resolve', () => {
    const open = get<Array<{ id: string; message: { attachment: { url: string } | null } }>>(
      `${CLUB}/moderation/reports?status=open&limit=100`,
    )
    expect(open.find((r) => r.id === 'report-1')?.message.attachment?.url).toMatch(/^https:/)
    expect(open.some((r) => 'escalateOnResolve' in r)).toBe(false)
    const escalated = handleE2EApiRequest(`${CLUB}/moderation/reports/report-2/resolve`, {
      method: 'POST',
      body: { action: 'dismiss' },
    })
    expect(escalated.handled && !escalated.ok && escalated.status).toBe(403)
    expect(get<Array<{ id: string }>>(`${CLUB}/moderation/reports?status=open`).map((r) => r.id)).toEqual([
      'report-1',
    ])
  })

  it('exports members server-side without emails unless asked, formulas neutralised', () => {
    const plain = get<{ csv: string; includeEmails: boolean }>(`${CLUB}/members/export`)
    expect(plain.includeEmails).toBe(false)
    expect(plain.csv.startsWith('\uFEFF"Name";"Rolle"')).toBe(true)
    expect(plain.csv).not.toContain('@')
    const withEmails = get<{ csv: string }>(`${CLUB}/members/export?includeEmails=true`)
    expect(withEmails.csv).toContain('"E-Mail"')
  })

  it('enforces the 24h compliance reminder cooldown', () => {
    const remind = () =>
      handleE2EApiRequest(`${CLUB}/compliance/remind`, {
        method: 'POST',
        body: { memberUserId: 'user-coach-1', kind: 'FUEHRUNGSZEUGNIS' },
      })
    const first = remind()
    const second = remind()
    expect(first.handled && first.ok && first.body).toEqual({ sent: true })
    expect(second.handled && second.ok && second.body).toEqual(
      expect.objectContaining({ sent: false, reason: 'cooldown' }),
    )
  })

  it('searches members ignoring accents and by email', () => {
    const page = get<MemberListPage<{ user: { email: string } }>>(`${CLUB}/members?limit=100&filter=all`)
    const email = page.items[0].user.email
    const byEmail = get<MemberListPage>(`${CLUB}/members?limit=100&filter=all&q=${encodeURIComponent(email)}`)
    expect(byEmail.total).toBeGreaterThanOrEqual(1)
  })

  it('mocks the endpoints that used to fall through', () => {
    expect(get<unknown[]>(`${CLUB}/staff-access-requests`)).toEqual([])
    expect(get<unknown[]>('/ownership-transfers/mine')).toEqual([])
    expect(get<{ children: unknown[] }>('/me/children-overview').children).toEqual([])
    expect(get<{ features: string[] }>(`${CLUB}/billing/entitlements`).features).toContain(
      'contribution_intake',
    )
    expect(get<{ status: string }>(`${CLUB}/billing/status`).status).toBe('active')
    expect(get<unknown[]>(`${CLUB}/sponsors`).length).toBeGreaterThan(0)
    expect(get<{ played: number }>(`${CLUB}/teams/team-e2e-senior-1/season-stats`).played).toBe(9)
  })
})
