import { RegistrationRole } from '@anstoss/shared'
import {
  activateE2EScenario,
  activateE2EPostSignupRole,
  clearE2ESession,
  handleE2EApiRequest,
  isE2ESupported,
} from '../e2e/session'

describe('E2E API session shim', () => {
  afterEach(async () => {
    await clearE2ESession()
  })

  it('handles tab conversation requests without falling through to the real API', async () => {
    await activateE2EScenario('player')

    const response = handleE2EApiRequest('/clubs/club-e2e-sv-albatros/conversations', {
      method: 'GET',
    })

    expect(response.handled).toBe(true)
    if (!response.handled) {
      throw new Error('Expected E2E request to be handled')
    }
    expect(response.ok).toBe(true)
    expect(response.status).toBe(200)
    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'conversation-e2e-team',
          unreadCount: 0,
        }),
      ]),
    )
  })

  it('only supports E2E sessions in dev runtimes', () => {
    const devGlobal = global as typeof globalThis & { __DEV__?: boolean }
    const originalDev = devGlobal.__DEV__

    try {
      devGlobal.__DEV__ = false
      expect(isE2ESupported()).toBe(false)

      devGlobal.__DEV__ = true
      expect(isE2ESupported()).toBe(true)
    } finally {
      devGlobal.__DEV__ = originalDev
    }
  })

  it('resets scenario-scoped team state when switching post-signup roles', async () => {
    await activateE2EScenario('club-admin')
    const before = handleE2EApiRequest('/clubs/club-e2e-sv-albatros/team-groups', {
      method: 'GET',
    })
    expect(before.handled && before.body).toEqual([
      expect.objectContaining({ id: 'group-e2e-senior' }),
    ])

    await activateE2EPostSignupRole(RegistrationRole.PLAYER)
    const after = handleE2EApiRequest('/clubs/club-e2e-sv-albatros/team-groups', {
      method: 'GET',
    })
    expect(after.handled).toBe(true)
    if (!after.handled) throw new Error('Expected team groups to be handled')
    expect(after.body).toEqual([])
  })

  it('persists a player join request so pending approval can poll it', async () => {
    await activateE2EScenario('signup-player')

    const search = handleE2EApiRequest('/clubs/search?q=Albatros', { method: 'GET' })
    expect(search.handled).toBe(true)
    if (!search.handled) throw new Error('Expected search to be handled')
    expect(search.body).toEqual(
      expect.objectContaining({
        results: expect.arrayContaining([
          expect.objectContaining({ slug: 'sv-albatros', isActive: true }),
        ]),
      }),
    )

    const request = handleE2EApiRequest('/clubs/club-e2e-sv-albatros/join-requests', {
      method: 'POST',
      body: { role: 'PLAYER' },
    })
    expect(request.handled).toBe(true)
    if (!request.handled) throw new Error('Expected request to be handled')
    expect(request.status).toBe(201)

    const active = handleE2EApiRequest('/me/join-requests/active', { method: 'GET' })
    expect(active.handled).toBe(true)
    if (!active.handled) throw new Error('Expected active request to be handled')
    expect(active.body).toEqual({
      request: expect.objectContaining({
        clubId: 'club-e2e-sv-albatros',
        status: 'PENDING',
      }),
    })
  })

  it('turns post-signup club setup into an active owner membership', async () => {
    await activateE2EScenario('signup-club-admin')

    const setup = handleE2EApiRequest('/clubs/setup', {
      method: 'POST',
      body: {
        club: { name: 'Smoke FC', primaryColor: '#1E3A5F' },
        team: { name: 'First Team', ageGroup: 'Herren' },
      },
    })
    expect(setup.handled).toBe(true)
    if (!setup.handled) throw new Error('Expected setup to be handled')
    expect(setup.status).toBe(201)
    expect(setup.body).toEqual(
      expect.objectContaining({
        club: expect.objectContaining({
          id: 'club-e2e-sv-albatros',
          name: 'Smoke FC',
          slug: 'smoke-fc',
        }),
      }),
    )

    const events = handleE2EApiRequest('/clubs/club-e2e-sv-albatros/events', {
      method: 'GET',
    })
    expect(events.handled).toBe(true)
    if (!events.handled) throw new Error('Expected events to be handled')
    expect(events.ok).toBe(true)
  })

  it('redeems invites with the same joined contract as the API', async () => {
    await activateE2EScenario('signup-player')

    const invite = handleE2EApiRequest('/public/invites/E2EINV01', { method: 'GET' })
    expect(invite.handled).toBe(true)
    if (!invite.handled) throw new Error('Expected invite lookup to be handled')
    expect(invite.body).toEqual(expect.objectContaining({ code: 'E2EINV01' }))

    const redeem = handleE2EApiRequest('/invites/E2EINV01/redeem', { method: 'POST' })
    expect(redeem.handled).toBe(true)
    if (!redeem.handled) throw new Error('Expected invite redeem to be handled')
    expect(redeem.body).toEqual(
      expect.objectContaining({
        status: 'joined',
        membership: expect.objectContaining({
          role: 'PLAYER',
          club: expect.objectContaining({ id: 'club-e2e-sv-albatros' }),
        }),
        teamAccess: expect.objectContaining({
          role: 'PLAYER',
          status: 'ACTIVE',
          team: expect.objectContaining({ id: 'team-e2e-senior-1' }),
        }),
        club: expect.objectContaining({ id: 'club-e2e-sv-albatros' }),
        team: expect.objectContaining({ id: 'team-e2e-senior-1' }),
      }),
    )
  })

  it('validates invite creation against the shared schema and returns API-shaped links', async () => {
    await activateE2EScenario('club-admin')

    const invalid = handleE2EApiRequest('/clubs/club-e2e-sv-albatros/invites', {
      method: 'POST',
      body: {
        teamId: 'team-e2e-senior-1',
        role: 'PLAYER',
        phase: 'FULL',
        deliveryChannel: 'EMAIL',
        recipientEmail: 'player@example.com',
        guardianEmail: 'guardian@example.com',
      },
    })
    expect(invalid.handled).toBe(true)
    if (!invalid.handled) throw new Error('Expected invalid invite to be handled')
    expect(invalid.ok).toBe(false)
    expect(invalid.status).toBe(400)
    expect(invalid.message).toContain('Guardian metadata')

    const created = handleE2EApiRequest('/clubs/club-e2e-sv-albatros/invites', {
      method: 'POST',
      body: {
        teamId: 'team-e2e-senior-1',
        role: 'PLAYER',
        phase: 'FULL',
        deliveryChannel: 'LINK',
      },
    })
    expect(created.handled).toBe(true)
    if (!created.handled) throw new Error('Expected invite creation to be handled')
    expect(created.ok).toBe(true)
    expect(created.status).toBe(201)
    expect(created.body).toEqual(
      expect.objectContaining({
        clubId: 'club-e2e-sv-albatros',
        teamId: 'team-e2e-senior-1',
        kind: 'MEMBER_INVITE',
        role: 'PLAYER',
        phase: 'FULL',
        deliveryChannel: 'LINK',
        recipientEmail: null,
        status: 'PENDING',
      }),
    )

    const body = created.body as { code: string; link: string }
    expect(body.code).toHaveLength(8)
    expect(body.link).toBe(`https://anstoss.io/join/sv-albatros/${body.code}`)
  })
})
