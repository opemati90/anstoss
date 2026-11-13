import {
  ActingSessionForbiddenError,
  ActingSessionNotActiveError,
  ActingSessionTeamNotFoundError,
  ClubOperationalRole,
} from '@anstoss/shared'
import { ActingService } from './acting.service'
import { canStartActingSession, hasActiveCoachActingSession } from './acting-access'

const TEAM = { id: 't-aj', displayName: 'A-Jugend', name: 'U19' }

function build(opts: {
  membership?: { role: string; operationalRoles: string[] } | null
  team?: typeof TEAM | null
  active?: { id: string } | null
  headCoaches?: string[]
} = {}) {
  const sessions: Array<Record<string, unknown>> = []
  const tx = {
    actingSession: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: 'as1', endedAt: null, team: TEAM, ...data }
        sessions.push(row)
        return row
      }),
    },
  }
  const prisma = {
    membership: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          opts.membership === undefined ? { role: 'ADMIN', operationalRoles: [] } : opts.membership,
        ),
    },
    team: {
      findFirst: jest.fn().mockResolvedValue(opts.team === undefined ? TEAM : opts.team),
      findMany: jest.fn().mockResolvedValue([
        { id: 't-h1', displayName: '1. Herren', name: 'Herren', access: [{ userId: 'actor', role: 'HEAD_COACH', user: { name: 'Yemi' } }], members: [] },
        { id: 't-h2', displayName: 'Herren II', name: 'Herren II', access: [{ userId: 'c2', role: 'HEAD_COACH', user: { name: 'Tom' } }], members: [{ userId: 'c2', absence: 'NONE', absenceUntil: null }] },
        { id: 't-aj', displayName: 'A-Jugend', name: 'U19', access: [{ userId: 'c3', role: 'HEAD_COACH', user: { name: 'Jonas' } }], members: [{ userId: 'c3', absence: 'AWAY', absenceUntil: null }] },
        { id: 't-e', displayName: 'E-Jugend', name: 'U11', access: [], members: [] },
      ]),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ name: 'Yemi Adeyemi' }) },
    teamAccess: {
      findMany: jest
        .fn()
        .mockResolvedValue((opts.headCoaches ?? ['coach-1', 'actor']).map((userId) => ({ userId }))),
    },
    actingSession: {
      findFirst: jest.fn(async () => (opts.active === undefined ? null : opts.active)),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'as1',
        clubId: 'c1',
        teamId: TEAM.id,
        role: 'COACH',
        reason: null,
        startedAt: new Date('2026-11-13T10:00:00Z'),
        expiresAt: new Date('2026-11-13T10:30:00Z'),
        team: TEAM,
        ...data,
      })),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  }
  const audit = { log: jest.fn().mockResolvedValue(undefined) }
  const push = { sendToUserLocalized: jest.fn().mockResolvedValue(undefined) }
  const service = new ActingService(prisma as never, audit as never, push as never)
  return { service, prisma, tx, audit, push, sessions }
}

describe('canStartActingSession', () => {
  it('allows owners, admins, board members and team coordinators', () => {
    expect(canStartActingSession({ role: 'OWNER', operationalRoles: [] })).toBe(true)
    expect(canStartActingSession({ role: 'ADMIN' })).toBe(true)
    expect(
      canStartActingSession({ role: 'PLAYER', operationalRoles: [ClubOperationalRole.BOARD_MEMBER] }),
    ).toBe(true)
    expect(
      canStartActingSession({ role: 'PARENT', operationalRoles: [ClubOperationalRole.TEAM_COORDINATOR] }),
    ).toBe(true)
  })

  it('denies coaches, players, parents, other operational roles and non-members', () => {
    expect(canStartActingSession({ role: 'COACH', operationalRoles: [] })).toBe(false)
    expect(canStartActingSession({ role: 'PLAYER', operationalRoles: [ClubOperationalRole.CAPTAIN] })).toBe(false)
    expect(canStartActingSession({ role: 'PARENT' })).toBe(false)
    expect(canStartActingSession(null)).toBe(false)
  })
})

describe('hasActiveCoachActingSession', () => {
  it('queries only unexpired, not-ended coach sessions for the team and club', async () => {
    const now = new Date('2026-11-13T10:00:00Z')
    const prisma = { actingSession: { findFirst: jest.fn().mockResolvedValue({ id: 'as1' }) } }
    await expect(
      hasActiveCoachActingSession(prisma, { userId: 'u1', teamId: 't1', clubId: 'c1' }, now),
    ).resolves.toBe(true)
    expect(prisma.actingSession.findFirst).toHaveBeenCalledWith({
      where: {
        actorUserId: 'u1',
        endedAt: null,
        expiresAt: { gt: now },
        teamId: 't1',
        clubId: 'c1',
        role: 'COACH',
      },
      select: { id: true },
    })
    prisma.actingSession.findFirst.mockResolvedValue(null)
    await expect(
      hasActiveCoachActingSession(prisma, { userId: 'u1', teamId: 't1', clubId: 'c1' }, now),
    ).resolves.toBe(false)
  })
})

describe('ActingService', () => {
  it('starts a session, ends any previous one, audits it and notifies the head coach', async () => {
    const { service, tx, audit, push } = build()
    const before = Date.now()
    const dto = await service.start('c1', 'actor', { teamId: TEAM.id, minutes: 30 })

    expect(tx.actingSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ actorUserId: 'actor', endedAt: null, clubId: 'c1' }),
      }),
    )
    expect(dto).toMatchObject({ teamId: TEAM.id, teamName: 'A-Jugend', role: 'COACH', endedAt: null })
    const minutes = (Date.parse(dto.expiresAt) - Date.parse(dto.startedAt)) / 60_000
    expect(minutes).toBe(30)
    expect(Date.parse(dto.startedAt)).toBeGreaterThanOrEqual(before - 1000)

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        clubId: 'c1',
        type: 'acting_session.started',
        actorId: 'actor',
        actorLabel: 'Yemi Adeyemi (Vorstand) als Trainer',
      }),
    )
    // The actor is never notified about their own session.
    expect(push.sendToUserLocalized).toHaveBeenCalledTimes(1)
    expect(push.sendToUserLocalized).toHaveBeenCalledWith(
      'coach-1',
      'ACTING_SESSION_STARTED',
      { actorName: 'Yemi Adeyemi', teamName: 'A-Jugend', minutes: 30 },
      { type: 'acting_session', clubId: 'c1', teamId: TEAM.id },
      { clubId: 'c1' },
    )
  })

  it('keeps the session when the push fails', async () => {
    const { service, push } = build()
    push.sendToUserLocalized.mockRejectedValue(new Error('expo down'))
    await expect(service.start('c1', 'actor', { teamId: TEAM.id, minutes: 15 })).resolves.toMatchObject({
      id: 'as1',
    })
  })

  it('lists candidate teams, away coaches first, without teams the caller coaches', async () => {
    const { service } = build()
    await expect(service.candidates('c1', 'actor')).resolves.toEqual({
      items: [
        { teamId: 't-aj', teamName: 'A-Jugend', headCoachName: 'Jonas', coachAway: true },
        { teamId: 't-h2', teamName: 'Herren II', headCoachName: 'Tom', coachAway: false },
        { teamId: 't-e', teamName: 'E-Jugend', headCoachName: null, coachAway: false },
      ],
    })
  })

  it('denies candidates to members without a board role', async () => {
    const { service } = build({ membership: { role: 'PLAYER', operationalRoles: [] } })
    await expect(service.candidates('c1', 'actor')).rejects.toBeInstanceOf(ActingSessionForbiddenError)
  })

  it('rejects members without a board or manager role', async () => {
    const { service, tx } = build({ membership: { role: 'COACH', operationalRoles: [] } })
    await expect(service.start('c1', 'actor', { teamId: TEAM.id, minutes: 30 })).rejects.toBeInstanceOf(
      ActingSessionForbiddenError,
    )
    expect(tx.actingSession.create).not.toHaveBeenCalled()
  })

  it('rejects non-members', async () => {
    const { service } = build({ membership: null })
    await expect(service.start('c1', 'actor', { teamId: TEAM.id, minutes: 30 })).rejects.toBeInstanceOf(
      ActingSessionForbiddenError,
    )
  })

  it('rejects a team outside the club', async () => {
    const { service, prisma } = build({ team: null })
    await expect(service.start('c1', 'actor', { teamId: 'other', minutes: 30 })).rejects.toBeInstanceOf(
      ActingSessionTeamNotFoundError,
    )
    expect(prisma.team.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'other', clubId: 'c1' } }),
    )
  })

  it('ends the running session and audits it', async () => {
    const { service, prisma, audit } = build({ active: { id: 'as1' } })
    const dto = await service.end('c1', 'actor')
    expect(prisma.actingSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'as1' }, data: { endedAt: expect.any(Date) } }),
    )
    expect(dto.endedAt).not.toBeNull()
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ type: 'acting_session.ended' }))
  })

  it('throws a named error when nothing is running', async () => {
    const { service } = build({ active: null })
    await expect(service.end('c1', 'actor')).rejects.toBeInstanceOf(ActingSessionNotActiveError)
  })

  it('returns the current session or null', async () => {
    const { service, prisma } = build()
    await expect(service.current('actor')).resolves.toEqual({ session: null })
    prisma.actingSession.findFirst.mockResolvedValueOnce({
      id: 'as1',
      clubId: 'c1',
      teamId: TEAM.id,
      role: 'COACH',
      reason: 'Trainer im Urlaub',
      startedAt: new Date('2026-11-13T10:00:00Z'),
      expiresAt: new Date('2026-11-13T10:30:00Z'),
      endedAt: null,
      team: TEAM,
    } as never)
    await expect(service.current('actor')).resolves.toEqual({
      session: {
        id: 'as1',
        clubId: 'c1',
        teamId: TEAM.id,
        teamName: 'A-Jugend',
        role: 'COACH',
        reason: 'Trainer im Urlaub',
        startedAt: '2026-11-13T10:00:00.000Z',
        expiresAt: '2026-11-13T10:30:00.000Z',
        endedAt: null,
      },
    })
  })
})
