import { handleE2EChatRequest } from './chatMocks'
import { E2E_CHANNELS, E2E_DMS } from './chatSeed'

const CLUB = 'club-e2e-sv-albatros'

function session(scenario: string, userId = 'user-player-1') {
  return {
    scenario,
    user: { id: userId, name: 'Julian Becker' },
    teamMembers: [{ team: { id: 'team-e2e-senior-1', displayName: 'Senior Team' } }],
  }
}

function body(res: ReturnType<typeof handleE2EChatRequest>) {
  if (!res.handled) throw new Error('expected handled')
  return res.body as any
}

describe('E2E chat mocks', () => {
  it.each(['player', 'coach', 'club-admin', 'parent'])('serves a German inbox for %s', (scenario) => {
    const items = body(handleE2EChatRequest(session(scenario), CLUB, `/clubs/${CLUB}/inbox`, 'GET', null))
    expect(items.length).toBeGreaterThan(3)
    expect(items.some((i: any) => i.type === 'DM')).toBe(true)
    expect(items.some((i: any) => i.kind === 'ANNOUNCEMENTS')).toBe(true)
  })

  it('only shows staff channels to coaches and admins', () => {
    const player = body(handleE2EChatRequest(session('player'), CLUB, `/clubs/${CLUB}/inbox`, 'GET', null))
    const coach = body(handleE2EChatRequest(session('coach', 'user-coach-1'), CLUB, `/clubs/${CLUB}/inbox`, 'GET', null))
    expect(player.some((i: any) => i.id === E2E_CHANNELS.coaches)).toBe(false)
    expect(coach.some((i: any) => i.id === E2E_CHANNELS.coaches)).toBe(true)
  })

  it('persists mute and read state for the session', () => {
    const s = session('player')
    handleE2EChatRequest(s, CLUB, `/clubs/${CLUB}/channels/${E2E_CHANNELS.team}`, 'PATCH', { muted: true })
    handleE2EChatRequest(s, CLUB, `/clubs/${CLUB}/channels/${E2E_CHANNELS.team}/read`, 'POST', null)
    const items = body(handleE2EChatRequest(s, CLUB, `/clubs/${CLUB}/inbox`, 'GET', null))
    const team = items.find((i: any) => i.id === E2E_CHANNELS.team)
    expect(team).toMatchObject({ muted: true, unreadCount: 0 })
  })

  it('creates groups that appear in the inbox and have members', () => {
    const s = session('coach', 'user-coach-1')
    const created = body(
      handleE2EChatRequest(s, CLUB, `/clubs/${CLUB}/channels`, 'POST', {
        name: 'Trainingslager',
        teamId: 'team-e2e-senior-1',
        memberIds: ['user-player-2'],
      }),
    )
    const items = body(handleE2EChatRequest(s, CLUB, `/clubs/${CLUB}/inbox`, 'GET', null))
    expect(items[0]).toMatchObject({ id: created.id, kind: 'CUSTOM', title: 'Trainingslager' })
    const members = body(handleE2EChatRequest(s, CLUB, `/clubs/${CLUB}/channels/${created.id}/members`, 'GET', null))
    expect(members.filter((m: any) => m.isMember).map((m: any) => m.userId)).toContain('user-player-2')
  })

  it('serves DM detail and contacts with disabled minors', () => {
    const s = session('player')
    const dm = body(handleE2EChatRequest(s, CLUB, `/clubs/${CLUB}/conversations/${E2E_DMS.coach}`, 'GET', null))
    expect(dm.otherUser.name).toBe('Markus Hoffmann')
    const groups = body(handleE2EChatRequest(s, CLUB, `/clubs/${CLUB}/chat/contacts`, 'GET', null))
    const minors = groups.flatMap((g: any) => g.contacts).filter((c: any) => c.reason === 'MINOR_ADULT')
    expect(minors.length).toBeGreaterThan(0)
    expect(minors.every((c: any) => c.canMessage === false)).toBe(true)
  })
})
