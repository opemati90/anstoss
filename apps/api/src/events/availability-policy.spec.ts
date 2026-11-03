import '../../test/future-capabilities'

import { updateAvailabilityPolicySchema } from '../../../../packages/shared/src/schemas/rsvp'
import { assertAvailabilityOpen, validateAvailabilityDeadline } from './availability-policy'
import { EventsService } from './events.service'

describe('availability policy', () => {
  const now = new Date('2026-10-28T12:00:00Z')
  const starts = new Date('2026-10-29T12:00:00Z')
  it.each([true, false])('manual lock=%s is enforced', (locked) => {
    const check = () => assertAvailabilityOpen({ cancelledAt: null, date: starts, rsvpLocked: locked }, now)
    if (locked) expect(check).toThrow('Availability is closed')
    else expect(check).not.toThrow()
  })
  it.each([-1, 0, 1])('closes at the exact deadline boundary (%d ms)', (offset) => {
    const check = () => assertAvailabilityOpen({ cancelledAt: null, date: starts, rsvpDeadline: new Date(now.getTime() + offset) }, now)
    if (offset <= 0) expect(check).toThrow('Availability is closed')
    else expect(check).not.toThrow()
  })
  it('a reschedule earlier than the deadline closes at the new start', () => {
    expect(() => assertAvailabilityOpen({ cancelledAt: null, date: new Date(now.getTime() - 1), rsvpDeadline: starts }, now)).toThrow('Availability is closed')
  })
  it('rejects a cancelled event and invalid deadline values', () => {
    expect(() => assertAvailabilityOpen({ cancelledAt: now, date: starts }, now)).toThrow('cancelled')
    for (const value of [now, new Date('bad'), new Date(starts.getTime() + 1)]) {
      expect(() => validateAvailabilityDeadline(value, starts, now)).toThrow('Availability deadline')
    }
    expect(() => validateAvailabilityDeadline(starts, starts, now)).not.toThrow()
    expect(() => validateAvailabilityDeadline(null, starts, now)).not.toThrow()
  })
  it('validates strict policy requests without accepting privilege/routing fields', () => {
    expect(updateAvailabilityPolicySchema.safeParse({}).success).toBe(false)
    expect(updateAvailabilityPolicySchema.safeParse({ locked: true, userId: 'other' }).success).toBe(false)
    expect(updateAvailabilityPolicySchema.safeParse({ deadline: 'invalid' }).success).toBe(false)
    expect(updateAvailabilityPolicySchema.parse({ deadline: null, locked: false })).toEqual({ deadline: null, locked: false })
  })
})

describe('availability policy persistence', () => {
  let event: any, db: any, teams: any, service: EventsService
  beforeEach(() => {
    event = { id: 'event', clubId: 'club', teamId: 'team', date: new Date(Date.now() + 86_400_000), cancelledAt: null, archivedAt: null, rsvpLocked: false, rsvpDeadline: null }
    db = {
      $executeRaw: jest.fn(),
      $queryRaw: jest.fn(async () => [event]),
      event: { findUnique: jest.fn(async () => event), findFirst: jest.fn(async () => event), update: jest.fn(async ({ data }) => ({ ...event, ...data })) },
      rsvp: { upsert: jest.fn(async ({ create }) => create), updateMany: jest.fn() },
      teamAccess: { findFirst: jest.fn(async () => ({ id: 'access' })), findMany: jest.fn(async ({ where }: any) => where.loanedFromTeamId ? [] : [{ phase: 'FULL' }]) },
      teamMember: { findMany: jest.fn(async () => []) },
      membership: { findUnique: jest.fn(async () => ({ id: 'membership' })) },
      guardianRelationship: { findFirst: jest.fn(async () => ({ id: 'guardian' })) },
      eventReminderPreference: { upsert: jest.fn() },
    }
    db.$transaction = jest.fn(async (callback) => callback(db))
    teams = { assertReadableAccess: jest.fn(), assertEventManagementAccess: jest.fn() }
    service = new EventsService(db, teams, { getOverdueContributionsForUser: jest.fn(async () => []) } as any, {} as any, { emitRsvpUpdate: jest.fn() } as any, {} as any)
  })
  it('re-reads the locked event before writing instead of trusting preflight state', async () => {
    db.$queryRaw.mockImplementation(async () => [{ ...event, rsvpLocked: true }])
    await expect(service.upsertRsvp('event', 'player', 'NO')).rejects.toThrow('Availability is closed')
    expect(db.rsvp.upsert).not.toHaveBeenCalled()
    expect(db.rsvp.updateMany).not.toHaveBeenCalled()
  })
  it('enforces the same lock for guardian responses', async () => {
    event.rsvpLocked = true
    await expect(service.upsertRsvp('event', 'parent', 'YES', undefined, undefined, 'child')).rejects.toThrow('Availability is closed')
    expect(db.guardianRelationship.findFirst).toHaveBeenCalled()
    expect(db.rsvp.upsert).not.toHaveBeenCalled()
  })
  it('refuses archived events without a deadline', async () => {
    event.archivedAt = new Date()
    await expect(service.upsertRsvp('event', 'player', 'MAYBE')).rejects.toThrow('archived')
    expect(db.rsvp.upsert).not.toHaveBeenCalled()
  })
  it('rechecks coach authority after acquiring locks', async () => {
    teams.assertEventManagementAccess.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('revoked'))
    await expect(service.updateAvailabilityPolicy('club', 'event', 'coach', { locked: true })).rejects.toThrow('revoked')
    expect(db.event.update).not.toHaveBeenCalled()
  })
  it('does not report a saved response as failed when reminder scheduling fails', async () => {
    db.eventReminderPreference.upsert.mockRejectedValueOnce(new Error('reminder unavailable'))
    await expect(service.upsertRsvp('event', 'player', 'YES')).resolves.toMatchObject({ status: 'YES' })
  })
  it('allows responses while open', async () => {
    await expect(service.upsertRsvp('event', 'player', 'MAYBE')).resolves.toMatchObject({ status: 'MAYBE' })
    expect(db.$queryRaw.mock.calls[0][0].join('')).toContain('FOR UPDATE')
  })
  it('never accepts another club guardian link after the original is revoked', async () => {
    db.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) => strings.join('').includes('GuardianRelationship')
      ? [{ id: 'other-link', clubId: 'other-club' }] : [event])
    await expect(service.upsertRsvp('event', 'parent', 'YES', undefined, undefined, 'child')).rejects.toThrow('Guardian relationship unavailable')
    expect(db.rsvp.upsert).not.toHaveBeenCalled()
    const query = db.$queryRaw.mock.calls.find((call: unknown[]) => (call[0] as TemplateStringsArray).join('').includes('GuardianRelationship'))
    expect(query[0].join('')).toContain('WHERE "clubId" = ')
    expect(query.slice(1)).toEqual(['club', 'parent', 'child'])
  })
  it('only event managers can configure the policy', async () => {
    teams.assertEventManagementAccess.mockRejectedValue(new Error('denied'))
    await expect(service.updateAvailabilityPolicy('club', 'event', 'player', { locked: true })).rejects.toThrow('denied')
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(db.event.update).not.toHaveBeenCalled()
  })
  it('sets and clears policy fields under the same event-row lock', async () => {
    await expect(service.updateAvailabilityPolicy('club', 'event', 'coach', { deadline: null, locked: true })).resolves.toEqual({ deadline: null, locked: true })
    expect(db.event.update).toHaveBeenCalledWith({ where: { id: 'event' }, data: { rsvpDeadline: null, rsvpLocked: true } })
    expect(db.$queryRaw.mock.calls[0][0].join('')).toContain('FOR UPDATE')
  })
  it('exposes only policy state after team read authorization', async () => {
    event.rsvpDeadline = new Date(Date.now() - 1)
    await expect(service.getAvailabilityPolicy('club', 'event', 'player')).resolves.toEqual({
      deadline: event.rsvpDeadline.toISOString(), locked: false, closed: true,
    })
    expect(teams.assertReadableAccess).toHaveBeenCalledWith('player', 'team', { eventId: 'event' })
    teams.assertReadableAccess.mockRejectedValueOnce(new Error('denied'))
    await expect(service.getAvailabilityPolicy('club', 'event', 'outsider')).rejects.toThrow('denied')
  })
})
