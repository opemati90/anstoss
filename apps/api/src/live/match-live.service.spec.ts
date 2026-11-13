import {
  MatchLiveTransitionError,
  MatchLiveUnavailableError,
  TeamAccessDeniedError,
} from '@anstoss/shared'
import { MatchLiveService, deriveMinute } from './match-live.service'

const MATCH = {
  id: 'e1',
  clubId: 'c1',
  teamId: 't1',
  type: 'MATCH',
  opponent: 'RW Köpenick III',
  homeAway: 'AWAY' as const,
}

function build(opts: { live?: Record<string, unknown> | null; manager?: boolean; event?: unknown } = {}) {
  let live: Record<string, unknown> | null = opts.live === undefined ? null : opts.live
  const liveEvents: Array<Record<string, unknown>> = []
  const tx = {
    matchLiveEvent: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `le${liveEvents.length + 1}`, createdAt: new Date(), deletedAt: null, ...data }
        liveEvents.push(row)
        return row
      }),
      updateMany: jest.fn(async ({ where }: { where: { id: string } }) => {
        const row = liveEvents.find((r) => r.id === where.id && !r.deletedAt)
        if (!row) return { count: 0 }
        row.deletedAt = new Date()
        return { count: 1 }
      }),
      count: jest.fn(async ({ where }: { where: { kind: string } }) =>
        liveEvents.filter((r) => r.kind === where.kind && !r.deletedAt).length,
      ),
    },
    matchLive: {
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        live = { ...(live ?? {}), ...data }
        return live
      }),
    },
  }
  const prisma = {
    event: { findFirst: jest.fn().mockResolvedValue(opts.event === undefined ? MATCH : opts.event) },
    matchLive: {
      findFirst: jest.fn(async () => live),
      upsert: jest.fn(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        live = live ? { ...live, ...update } : { goalsFor: 0, goalsAgainst: 0, ...create }
        return live
      }),
    },
    matchLiveEvent: {
      findMany: jest.fn(async () => liveEvents.filter((r) => !r.deletedAt)),
    },
    teamAccess: {
      findFirst: jest.fn(async ({ where }: { where: { userId: string } }) =>
        where.userId === 'p9' ? { user: { name: 'Kofi Osei' } } : null,
      ),
    },
    team: { findFirst: jest.fn().mockResolvedValue({ name: 'SV Spreewiese' }) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  }
  const teams = {
    assertReadableAccess: jest.fn().mockResolvedValue({}),
    assertEventManagementAccess: jest.fn(async () => {
      if (opts.manager === false) throw new TeamAccessDeniedError('no')
      return {}
    }),
  }
  const push = { sendToTeamLocalized: jest.fn().mockResolvedValue(undefined) }
  const gateway = { broadcastMatchState: jest.fn() }
  const service = new MatchLiveService(prisma as never, teams as never, push as never, gateway as never)
  return { service, prisma, teams, push, gateway, liveEvents }
}

describe('MatchLiveService', () => {
  it('reports a match that has not kicked off with canRecord for managers only', async () => {
    const coach = build()
    await expect(coach.service.getState('c1', 'e1', 'coach')).resolves.toMatchObject({
      status: 'NOT_STARTED',
      minute: null,
      canRecord: true,
    })
    const player = build({ manager: false })
    await expect(player.service.getState('c1', 'e1', 'p1')).resolves.toMatchObject({ canRecord: false })
  })

  it('refuses live tracking for a training', async () => {
    const { service } = build({ event: { ...MATCH, type: 'TRAINING' } })
    await expect(service.getState('c1', 'e1', 'coach')).rejects.toBeInstanceOf(MatchLiveUnavailableError)
  })

  it('kicks off, broadcasts without the recorder’s rights, and enforces the clock order', async () => {
    const { service, gateway } = build()
    const state = await service.updateState('c1', 'e1', 'coach', { status: 'FIRST_HALF' })
    expect(state.status).toBe('FIRST_HALF')
    expect(gateway.broadcastMatchState).toHaveBeenCalledWith('e1', expect.objectContaining({ canRecord: false }))
    await expect(
      service.updateState('c1', 'e1', 'coach', { status: 'SECOND_HALF' }),
    ).rejects.toBeInstanceOf(MatchLiveTransitionError)
  })

  it('only lets event managers move the clock or record', async () => {
    const { service } = build({ manager: false, live: { status: 'FIRST_HALF', kickoffAt: new Date() } })
    await expect(service.updateState('c1', 'e1', 'p1', { status: 'HALF_TIME' })).rejects.toBeInstanceOf(
      TeamAccessDeniedError,
    )
    await expect(service.recordEvent('c1', 'e1', 'p1', { kind: 'GOAL' })).rejects.toBeInstanceOf(
      TeamAccessDeniedError,
    )
  })

  it('requires kick-off before recording', async () => {
    const { service } = build()
    await expect(service.recordEvent('c1', 'e1', 'coach', { kind: 'GOAL' })).rejects.toBeInstanceOf(
      MatchLiveUnavailableError,
    )
  })

  it('records goals from our side, maps them to home/away and pushes the scoreline', async () => {
    const kickoff = new Date(Date.now() - 20 * 60_000)
    const { service, push } = build({ live: { status: 'FIRST_HALF', kickoffAt: kickoff, goalsFor: 0, goalsAgainst: 0 } })
    await service.recordEvent('c1', 'e1', 'coach', { kind: 'GOAL', playerUserId: 'p9' })
    const state = await service.recordEvent('c1', 'e1', 'coach', { kind: 'CONCEDED', minute: 33 })

    expect(state.goalsFor).toBe(1)
    expect(state.goalsAgainst).toBe(1)
    // Away match: the opponent is the home side.
    expect(state.scoreHome).toBe(1)
    expect(state.scoreAway).toBe(1)
    expect(state.events.find((e) => e.kind === 'GOAL')).toMatchObject({
      playerUserId: 'p9',
      playerName: 'Kofi Osei',
      minute: 21,
    })
    expect(push.sendToTeamLocalized).toHaveBeenLastCalledWith(
      't1',
      'GOAL',
      { scoreline: 'RW Köpenick III 1:1 SV Spreewiese' },
      expect.objectContaining({ eventId: 'e1', type: 'live_goal' }),
      'coach',
      { clubId: 'c1', category: 'events' },
    )
  })

  it('rejects a named player who is not in the team', async () => {
    const { service } = build({ live: { status: 'FIRST_HALF', kickoffAt: new Date() } })
    await expect(
      service.recordEvent('c1', 'e1', 'coach', { kind: 'YELLOW', playerUserId: 'stranger' }),
    ).rejects.toBeInstanceOf(MatchLiveUnavailableError)
  })

  it('undo removes the entry and recounts the score', async () => {
    const { service } = build({ live: { status: 'SECOND_HALF', kickoffAt: new Date(), secondHalfAt: new Date() } })
    const afterGoal = await service.recordEvent('c1', 'e1', 'coach', { kind: 'GOAL', minute: 50 })
    expect(afterGoal.goalsFor).toBe(1)
    const afterUndo = await service.deleteEvent('c1', 'e1', afterGoal.events[0].id, 'coach')
    expect(afterUndo.goalsFor).toBe(0)
    expect(afterUndo.events).toHaveLength(0)
    await expect(service.deleteEvent('c1', 'e1', afterGoal.events[0].id, 'coach')).rejects.toThrow(
      'Live event not found',
    )
  })

  it('pushes full time when the final whistle is recorded', async () => {
    const { service, push } = build({ live: { status: 'SECOND_HALF', kickoffAt: new Date(), secondHalfAt: new Date() } })
    await service.updateState('c1', 'e1', 'coach', { status: 'FINISHED' })
    await new Promise((r) => setImmediate(r))
    expect(push.sendToTeamLocalized).toHaveBeenCalledWith(
      't1',
      'FULL_TIME',
      expect.any(Object),
      expect.objectContaining({ type: 'live_full_time' }),
      'coach',
      expect.any(Object),
    )
  })
})

describe('deriveMinute', () => {
  const at = (iso: string) => new Date(iso)
  it('counts the first half from kick-off and the second from the restart', () => {
    expect(
      deriveMinute(
        { status: 'FIRST_HALF', kickoffAt: at('2026-11-15T13:00:00Z'), secondHalfAt: null, finishedAt: null },
        at('2026-11-15T13:12:30Z'),
      ),
    ).toBe(13)
    expect(
      deriveMinute(
        { status: 'SECOND_HALF', kickoffAt: null, secondHalfAt: at('2026-11-15T14:00:00Z'), finishedAt: null },
        at('2026-11-15T14:00:10Z'),
      ),
    ).toBe(46)
  })

  it('shows 45 at half time, null before kick-off, and at least 90 at full time', () => {
    const none = { kickoffAt: null, secondHalfAt: null, finishedAt: null }
    expect(deriveMinute({ status: 'HALF_TIME', ...none }, new Date())).toBe(45)
    expect(deriveMinute({ status: 'NOT_STARTED', ...none }, new Date())).toBeNull()
    expect(
      deriveMinute(
        {
          status: 'FINISHED',
          kickoffAt: null,
          secondHalfAt: at('2026-11-15T14:00:00Z'),
          finishedAt: at('2026-11-15T14:49:00Z'),
        },
        new Date(),
      ),
    ).toBe(95)
  })
})
