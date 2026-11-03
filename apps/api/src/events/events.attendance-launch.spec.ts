/** Default 18+ release; do not import future-capabilities. */
import { ForbiddenException } from '@nestjs/common'
import { EventsService } from './events.service'
import { FakePrisma } from '../test-utils/fake-prisma'

function createCheckIn(phase: 'FULL' | 'TRIAL' | null = 'FULL') {
  const event = { id: 'event', clubId: 'club', teamId: 'team', date: new Date(), cancelledAt: null, archivedAt: null }
  const db: any = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    $queryRaw: jest.fn(async (sql: TemplateStringsArray) => sql.join('').includes('FROM "Event"') ? [event] : []),
    event: { findUnique: jest.fn().mockResolvedValue(event), findMany: jest.fn().mockResolvedValue([event]) },
    user: { findFirst: jest.fn().mockResolvedValue({ dateOfBirth: new Date('1990-01-01') }) },
    membership: { findUnique: jest.fn().mockResolvedValue({ id: 'membership' }) },
    teamAccess: { findFirst: jest.fn().mockResolvedValue({ id: 'access' }), findMany: jest.fn().mockResolvedValue(phase ? [{ phase }] : []) },
    teamMember: { findMany: jest.fn().mockResolvedValue([]) },
    trialInvite: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    eventCheckIn: { upsert: jest.fn().mockResolvedValue({ checkedInAt: new Date() }) },
    rsvp: { upsert: jest.fn(async ({ create }) => create), updateMany: jest.fn() },
  }
  db.$transaction = jest.fn(async (callback) => callback(db))
  const teams = { assertReadableAccess: jest.fn().mockResolvedValue({}) }
  const service = new EventsService(db, teams as never, {} as never, {} as never,
    { emitRsvpUpdate: jest.fn() } as never, {} as never)
  return { db, event, service }
}

describe('adult-release event attendance', () => {
  it('filters historical youth, revoked and other-team players without deleting history', async () => {
    const users = [
      { id: 'adult', dateOfBirth: new Date('1990-01-01'), deletedAt: null },
      { id: 'trial', dateOfBirth: new Date('1990-01-01'), deletedAt: null },
      { id: 'other-trial', dateOfBirth: new Date('1990-01-01'), deletedAt: null },
      { id: 'closed-trial', dateOfBirth: new Date('1990-01-01'), deletedAt: null },
      { id: 'legacy-current-player', dateOfBirth: new Date('1990-01-01'), deletedAt: null },
      { id: 'minor', dateOfBirth: new Date('2013-01-01'), deletedAt: null },
      { id: 'unknown', dateOfBirth: null, deletedAt: null },
      { id: 'removed', dateOfBirth: new Date('1990-01-01'), deletedAt: null },
      { id: 'other', dateOfBirth: new Date('1990-01-01'), deletedAt: null },
    ].map((user) => ({ ...user, name: user.id, avatarUrl: null }))
    const db = new FakePrisma({
      event: {}, user: { teamAccess: { kind: 'many', model: 'teamAccess', to: 'userId' } },
      teamAccess: { user: { kind: 'one', model: 'user', from: 'userId' } },
      teamMember: {}, membership: {}, trialInvite: { freeAgentProfile: { kind: 'one', model: 'freeAgentProfile', from: 'freeAgentProfileId' } },
      freeAgentProfile: {}, rsvp: { user: { kind: 'one', model: 'user', from: 'userId' } },
      eventCheckIn: { user: { kind: 'one', model: 'user', from: 'userId' } },
    }, {
      event: [
        { id: 'event', clubId: 'club', teamId: 'team', date: new Date(Date.now() - 4 * 3600_000) },
        { id: 'other-event', clubId: 'club', teamId: 'team', date: new Date(Date.now() + 3600_000), cancelledAt: null },
      ],
      user: users,
      membership: [{ id: 'trial-member', clubId: 'club', userId: 'trial', role: 'PLAYER' },
        { id: 'closed-member', clubId: 'club', userId: 'closed-trial', role: 'PLAYER' }],
      teamAccess: users.map((user) => ({ id: `access-${user.id}`, userId: user.id,
        clubId: user.id === 'other' ? 'other-club' : 'club', teamId: 'team', role: 'PLAYER',
        phase: user.id.includes('trial') ? 'TRIAL' : 'FULL', status: user.id === 'removed' ? 'REVOKED' : 'ACTIVE', loanEndDate: null })),
      freeAgentProfile: [{ id: 'other-trial-profile', userId: 'other-trial' }, { id: 'closed-profile', userId: 'closed-trial' }],
      trialInvite: [{ id: 'other-invite', freeAgentProfileId: 'other-trial-profile', clubId: 'club', teamId: 'team',
        status: 'ACCEPTED', sessionEventIds: ['other-event'] },
      { id: 'closed-invite', freeAgentProfileId: 'closed-profile', clubId: 'club', teamId: 'team', status: 'REJECTED', sessionEventIds: ['event'] }],
      rsvp: users.map((user) => ({ id: `rsvp-${user.id}`, eventId: 'event', userId: user.id, status: 'YES',
        playerEligibilityVerifiedAt: ['adult', 'trial', 'removed', 'minor'].includes(user.id) ? new Date() : null })),
      eventCheckIn: users.map((user) => ({ id: `check-${user.id}`, eventId: 'event', userId: user.id, checkedInAt: new Date(),
        playerEligibilityVerifiedAt: ['adult', 'trial', 'removed', 'minor'].includes(user.id) ? new Date() : null })),
    })
    const service = new EventsService(db as never, { assertEventManagementAccess: jest.fn() } as never,
      {} as never, {} as never, {} as never, {} as never)
    const before = db.rows('rsvp').length
    const squad = await (service as any).loadTeamPlayers('team', db, 'club')
    const roster = await (service as any).loadEventResponseMembers('club', 'team', 'event', squad)
    expect(roster.map((row: { userId: string }) => row.userId)).not.toContain('closed-trial')
    const result = await service.getAttendance('club', 'event', 'coach')
    expect(result.rsvps.map((row) => row.userId)).toEqual(['adult', 'trial', 'removed'])
    expect(result.checkIns.map((row) => row.userId)).toEqual(['adult', 'trial', 'removed'])
    expect(db.rows('rsvp')).toHaveLength(before)
  })

  it('requires current player access, not just readable coach or guardian access', async () => {
    const { db, service } = createCheckIn(null)
    await expect(service.checkIn('club', 'event', 'coach')).rejects.toBeInstanceOf(ForbiddenException)
    expect(db.eventCheckIn.upsert).not.toHaveBeenCalled()
  })

  it('allows a valid trial session, but not another event', async () => {
    const { db, event, service } = createCheckIn('TRIAL')
    db.membership.findUnique.mockResolvedValue(null)
    db.trialInvite.findMany.mockResolvedValue([{ sessionEventIds: ['event'] }])
    await service.checkIn('club', 'event', 'trial')
    expect(db.eventCheckIn.upsert).toHaveBeenCalledTimes(1)
    db.event.findMany.mockResolvedValue([{ ...event, id: 'another-event' }])
    await expect(service.checkIn('club', 'event', 'trial')).rejects.toThrow('not part of your trial')
    expect(db.eventCheckIn.upsert).toHaveBeenCalledTimes(1)
  })

  it('permits RSVP only with a current player role and the matching trial session', async () => {
    const { db, event, service } = createCheckIn('TRIAL')
    db.membership.findUnique.mockResolvedValue(null)
    db.trialInvite.findMany.mockResolvedValue([{ sessionEventIds: ['event'] }])
    await service.upsertRsvp('event', 'trial', 'MAYBE')
    expect(db.rsvp.upsert).toHaveBeenCalledTimes(1)
    expect(db.rsvp.upsert.mock.calls[0][0].create.playerEligibilityVerifiedAt).toBeInstanceOf(Date)
    db.event.findMany.mockResolvedValue([{ ...event, id: 'another-event' }])
    await expect(service.upsertRsvp('event', 'trial', 'MAYBE')).rejects.toThrow('not part of your trial')
    db.teamAccess.findMany.mockResolvedValue([])
    await expect(service.upsertRsvp('event', 'trial', 'MAYBE')).rejects.toThrow('Only an active player')
    expect(db.rsvp.upsert).toHaveBeenCalledTimes(1)
  })

  it('does not downgrade an ended marketplace trial to unrestricted legacy access', async () => {
    const { db, service } = createCheckIn('TRIAL')
    db.trialInvite.findFirst.mockResolvedValue({ id: 'closed-invite' })
    await expect(service.upsertRsvp('event', 'trial', 'MAYBE')).rejects.toThrow('not part of your trial')
    expect(db.rsvp.upsert).not.toHaveBeenCalled()
  })

  it('rejects inactive and loaned-out players at the locked eligibility check', async () => {
    const { db, service } = createCheckIn('FULL')
    db.teamMember.findMany.mockResolvedValue([{ userId: 'player', operationalStatus: 'INACTIVE' }])
    await expect(service.upsertRsvp('event', 'player', 'MAYBE')).rejects.toThrow('Only an active player')
    db.teamMember.findMany.mockResolvedValue([])
    db.teamAccess.findMany.mockImplementation(async ({ where }: { where: { loanedFromTeamId?: string } }) => where.loanedFromTeamId
      ? [{ userId: 'player', loanedFromTeamId: 'team' }] : [{ phase: 'FULL' }])
    await expect(service.upsertRsvp('event', 'player', 'MAYBE')).rejects.toThrow('Only an active player')
    expect(db.rsvp.upsert).not.toHaveBeenCalled()
  })

  it('does not write after an event is cancelled while waiting for its lock', async () => {
    const { db, event, service } = createCheckIn()
    db.$queryRaw.mockImplementation(async (sql: TemplateStringsArray) => sql.join('').includes('FROM "Event"')
      ? [{ ...event, cancelledAt: new Date() }] : [])
    await expect(service.checkIn('club', 'event', 'adult')).rejects.toThrow('cancelled')
    expect(db.eventCheckIn.upsert).not.toHaveBeenCalled()
  })

  it('does not write when the account is erased before its locked recheck', async () => {
    const { db, service } = createCheckIn()
    db.user.findFirst.mockResolvedValue(null)
    await expect(service.checkIn('club', 'event', 'adult')).rejects.toBeInstanceOf(ForbiddenException)
    expect(db.eventCheckIn.upsert).not.toHaveBeenCalled()
  })
})
