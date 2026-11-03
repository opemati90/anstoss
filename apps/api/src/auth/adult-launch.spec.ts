/** Default public capabilities. Do NOT opt in to the future-capabilities fixture. */
import { ForbiddenException } from '@nestjs/common'
import { LAUNCH_FEATURES, proxyRsvpSchema, updateRsvpSchema } from '@anstoss/shared'
import { AgeGateService } from './age-gate.service'
import { assertLaunchBirthDate, assertLaunchParticipant, launchClubParticipantWhere, launchParticipantWhere, requireYouthParticipation } from './launch-access-policy'
import { classifyPrivateMessaging } from '../dm/private-messaging'
import { evaluateGroupSafeguarding } from '../channels/group-safeguarding'
import { UsersService } from '../users/users.service'
import { ManagedSubProfilesService } from '../users/managed-sub-profiles.service'
import { ParentHandoffService } from '../users/parent-handoff.service'
import { ConsentService } from '../consent/consent.service'
import { EventsService } from '../events/events.service'
import { InvitesService } from '../invites/invites.service'
import { ClubActivationService } from '../club-activation/club-activation.service'
import { ContributionsService } from '../contributions/contributions.service'
import { TeamsService } from '../teams/teams.service'
import { DmService } from '../dm/dm.service'
import { ChannelsService } from '../channels/channels.service'

describe('default adult launch boundaries', () => {
  const now = new Date('2026-10-28T12:00:00Z')
  const adult = { id: 'adult', dateOfBirth: new Date('1990-01-01'), managedById: null }
  it('is source-controlled 18+, without youth/guardian or health capabilities', () => {
    expect(LAUNCH_FEATURES).toEqual({ minimumAccountAge: 18, youthParticipation: false, healthReporting: false })
    expect(() => requireYouthParticipation()).toThrow(ForbiddenException)
  })
  it.each(['2008-10-29', '2010-01-01', '2016-01-01'])('blocks an adult DM to youth %s, including a managing guardian', (dob) => {
    expect(classifyPrivateMessaging(adult, { id: 'child', dateOfBirth: new Date(dob), managedById: adult.id }, now).kind).toBe('MINOR_BLOCKED')
  })
  it('allows the exact 18th birthday but never an unknown/invalid DOB', () => {
    expect(classifyPrivateMessaging(adult, { ...adult, id: 'second', dateOfBirth: new Date('2008-10-28') }, now).kind).toBe('ALLOWED')
    expect(classifyPrivateMessaging(adult, { ...adult, dateOfBirth: null }, now).kind).toBe('AGE_UNVERIFIED')
    expect(classifyPrivateMessaging(adult, { ...adult, dateOfBirth: new Date(NaN) }, now).kind).toBe('AGE_UNVERIFIED')
  })
  it.each([new Date('2009-01-01'), null])('rejects supervised 3-person groups with under18/unknown targets (%p)', (dateOfBirth) => {
    const users = [adult, { ...adult, id: 'staff2' }, { id: 'child', dateOfBirth, managedById: adult.id, adultConfirmedAt: new Date() }]
    expect(evaluateGroupSafeguarding(users.map((user) => user.id), {
      users, staffIds: new Set(['adult', 'staff2']), guardianPairs: new Set(['adult:child']),
    }, now)).toEqual({ ok: false, code: 'GROUP_ADULT_LAUNCH_ONLY' })
  })
  it('allows adult groups with ordinary safeguarding intact', () => {
    const users = [adult, { ...adult, id: 'b' }, { ...adult, id: 'c' }]
    expect(evaluateGroupSafeguarding(users.map((user) => user.id), { users, staffIds: new Set(), guardianPairs: new Set() }, now)).toEqual({ ok: true })
  })
  it.each([null, new Date(NaN), new Date('2010-01-01'), new Date(new Date().getFullYear() - 17, 0, 1)])('denies participation despite a legacy adult declaration/approved consent: %p', async (dateOfBirth) => {
    const prisma = { user: { findMany: jest.fn().mockResolvedValue([{ id: 'user', dateOfBirth, adultConfirmedAt: new Date() }]) },
      parentalConsent: { findMany: jest.fn().mockResolvedValue([{ status: 'APPROVED' }]) } }
    const gate = new AgeGateService(prisma as never)
    expect((await gate.evaluate('user', { clubId: 'club' })).allowed).toBe(false)
    expect(prisma.parentalConsent.findMany).not.toHaveBeenCalled()
  })
  it('fails target checks closed for missing DOB and deleted accounts', async () => {
    const client = { user: { findFirst: jest.fn().mockResolvedValue(null) } }
    await expect(assertLaunchParticipant(client as never, 'user')).rejects.toBeInstanceOf(ForbiddenException)
    client.user.findFirst.mockResolvedValue({ dateOfBirth: null } as never)
    await expect(assertLaunchParticipant(client as never, 'user')).rejects.toBeInstanceOf(ForbiddenException)
    expect(client.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'user', deletedAt: null } }))
    expect(() => assertLaunchBirthDate(new Date('2010-01-01'))).toThrow(ForbiddenException)
  })
  it('uses the correct leap-day cutoff for operational lists', () => {
    const where = launchParticipantWhere(new Date('2028-02-29T12:00:00'))
    expect((where.dateOfBirth as { lte: Date }).lte.getMonth()).toBe(1)
    expect((where.dateOfBirth as { lte: Date }).lte.getDate()).toBe(28)
    expect(where.deletedAt).toBeNull()
  })
  it.each(['injury', 'injured', 'sick', 'work', 'personal'])('does not accept RSVP explanations (%s)', (reason) => {
    expect(updateRsvpSchema.safeParse({ status: 'NO', reason }).success).toBe(false)
    expect(proxyRsvpSchema.safeParse({ status: 'NO', childUserId: 'child', reason }).success).toBe(false)
  })
  it('accepts bare replies but no free-text RSVP note', () => {
    for (const status of ['YES', 'MAYBE', 'NO']) expect(updateRsvpSchema.safeParse({ status }).success).toBe(true)
    expect(updateRsvpSchema.safeParse({ status: 'NO', note: 'Medical information' }).success).toBe(false)
  })
  it('rejects underage profile input without persisting DOB or deleting/tombstoning an account', async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'u', dateOfBirth: null, registrationRole: 'PLAYER' }), update: jest.fn() }, $transaction: jest.fn() }
    const users = new UsersService(prisma as never, {} as never, {} as never, {} as never, {} as never)
    await expect(users.updateProfile('u', { dateOfBirth: '2015-01-01' })).rejects.toBeInstanceOf(ForbiddenException)
    expect(prisma.user.update).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  const futureEntrypoints: Array<[string, () => Promise<unknown>]> = [
    ['parent handoff', () => Object.create(UsersService.prototype).sendParentHandoff('u', {})],
    ['children events', () => Object.create(UsersService.prototype).getChildrenEvents('u')],
    ['children overview', () => Object.create(UsersService.prototype).getChildrenOverview('u', 'club')],
    ['managed child', () => Object.create(ManagedSubProfilesService.prototype).create('u', {})],
    ['managed child tx', () => Object.create(ManagedSubProfilesService.prototype).createInTransaction({}, 'u', {})],
    ['handoff preview', () => Object.create(ParentHandoffService.prototype).getByCode('u', 'code')],
    ['handoff team preview', () => Object.create(ParentHandoffService.prototype).getTeamForCode('u', 'code', 'team')],
    ['handoff redeem', () => Object.create(ParentHandoffService.prototype).redeem('u', {})],
    ['consent creation', () => Object.create(ConsentService.prototype).createConsentRequest({})],
    ['consent approval', () => Object.create(ConsentService.prototype).approveConsent('consent', 'guardian')],
    ['proxy availability', () => Object.create(EventsService.prototype).upsertRsvpProxy('event', 'parent', 'child', 'YES')],
    ['parent invite', () => Object.create(InvitesService.prototype).create('club', 'u', { role: 'PARENT' }, 'OWNER')],
  ]
  it.each(futureEntrypoints)('gates %s before database/email side effects', async (_label, invoke) => {
    await expect(invoke()).rejects.toMatchObject({ response: expect.objectContaining({ code: 'FEATURE_COMING_SOON' }) })
  })
})

describe('default adult target and preservation regressions', () => {
  beforeEach(() => jest.useFakeTimers({ now: new Date('2026-10-28T12:00:00Z') }))
  afterEach(() => jest.useRealTimers())
  it.each([null, { dateOfBirth: null }, { dateOfBirth: new Date('2012-01-01') }])('never promotes an excluded dispute recovery target (%p)', async (user) => {
    const tx = { $executeRaw: jest.fn(), user: { findFirst: jest.fn().mockResolvedValue(user) },
      clubDispute: { findUnique: jest.fn().mockResolvedValue({ id: 'dispute', clubId: 'club', status: 'OPEN' }), updateMany: jest.fn() },
      membership: { updateMany: jest.fn(), findUnique: jest.fn() } }
    const service = Object.assign(Object.create(ClubActivationService.prototype), { prisma: { $transaction: (run: any) => run(tx) } })
    await expect(service.resolvePlatformDispute('platform', 'dispute', { newOwnerUserId: 'target', resolution: 'Recovery' })).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.membership.updateMany).not.toHaveBeenCalled()
    expect(tx.membership.findUnique).not.toHaveBeenCalled()
    expect(tx.clubDispute.updateMany).not.toHaveBeenCalled()
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1) // target lifecycle, before club ownership
  })

  it.each([null, { dateOfBirth: null }, { dateOfBirth: new Date('2012-01-01') }])('rejects excluded coach before creating a team or consuming quota (%p)', async (user) => {
    const tx = { $executeRaw: jest.fn(), user: { findFirst: jest.fn().mockResolvedValue(user) }, team: { create: jest.fn() } }
    const prisma = { teamGroup: { findFirst: jest.fn().mockResolvedValue({ id: 'group', displayName: 'Adults' }) }, $transaction: (run: any) => run(tx) }
    const eventEmitter = { emit: jest.fn() }
    const clubEntitlements = { assertCanCreateTeam: jest.fn() }
    const service = new TeamsService(prisma as never, eventEmitter as never, clubEntitlements as never)
    jest.spyOn(service as any, 'assertClubAdministrator').mockResolvedValue({ role: 'OWNER' })
    jest.spyOn(service as any, 'assertCoachAssignmentsAreValid').mockResolvedValue(undefined)
    jest.spyOn(service as any, 'generateUniqueJoinCode').mockResolvedValue('CODE1234')
    await expect(service.createTeam('club', 'group', 'owner', { name: 'First', headCoachUserId: 'target' })).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.team.create).not.toHaveBeenCalled()
    expect(clubEntitlements.assertCanCreateTeam).not.toHaveBeenCalled()
    expect(eventEmitter.emit).not.toHaveBeenCalled()
  })

  it.each([false, true])('requires independent adult role for parent-scoped access (independent=%s)', async (independent) => {
    const prisma = { user: { findMany: jest.fn().mockResolvedValue([{ id: 'u', dateOfBirth: new Date('1990-01-01') }]) },
      membership: { findUnique: jest.fn().mockResolvedValue({ role: 'PARENT' }) },
      teamAccess: { findFirst: jest.fn().mockResolvedValue(independent ? { id: 'player' } : null) } }
    const decision = await new AgeGateService(prisma as never).evaluate('u', { clubId: 'club', teamId: 'team' })
    expect(decision.allowed).toBe(independent)
    expect(prisma.teamAccess.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ clubId: 'club', teamId: 'team', role: { not: 'PARENT' }, phase: 'FULL', status: 'ACTIVE' }) }))
  })

  it('does not permit a parent-only DM target or channel member based on age alone', async () => {
    const where = launchClubParticipantWhere('club')
    const dm = Object.assign(Object.create(DmService.prototype), { prisma: { membership: { findFirst: jest.fn().mockResolvedValue(null) } } })
    await expect(dm.assertClubMembership('guardian', 'club')).rejects.toBeInstanceOf(ForbiddenException)
    expect(dm.prisma.membership.findFirst).toHaveBeenCalledWith({ where: { userId: 'guardian', clubId: 'club', user: expect.objectContaining({ OR: where.OR }) } })
    const db = { membership: { findMany: jest.fn().mockResolvedValue([]) }, teamAccess: { findMany: jest.fn().mockResolvedValue([]) }, guardianRelationship: { findMany: jest.fn().mockResolvedValue([{ parentUserId: 'guardian' }]) } }
    const channels = Object.assign(Object.create(ChannelsService.prototype), { prisma: db })
    await expect(channels.assertEligibleGroupMembers('club', 'team', ['guardian'])).rejects.toThrow('not a member')
    expect(db.membership.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ user: expect.objectContaining({ OR: where.OR }) }) }))
  })

  function contributions(user: unknown) {
    const db = { $executeRaw: jest.fn(), user: { findFirst: jest.fn().mockResolvedValue(user) }, membership: { findMany: jest.fn().mockResolvedValue([]) },
      teamAccess: { findMany: jest.fn().mockResolvedValue([]) },
      contributionPlan: { findFirst: jest.fn().mockResolvedValue({ id: 'plan', targetRole: 'PLAYER' }), create: jest.fn() },
      contributionAssignment: { findMany: jest.fn().mockResolvedValue([{ memberUserId: 'historical-youth', endDate: null }, { memberUserId: 'omitted-adult', endDate: null }]), findFirst: jest.fn(), upsert: jest.fn(), updateMany: jest.fn() },
      contributionReminder: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn() },
      contributionRecord: { upsert: jest.fn(), update: jest.fn() }, auditLog: { create: jest.fn() } }
    const service = Object.assign(Object.create(ContributionsService.prototype), { prisma: { ...db, $transaction: (run: any) => run(db) },
      pushService: { sendToUser: jest.fn().mockResolvedValue('unknown') }, auditService: { log: jest.fn() } })
    jest.spyOn(service as any, 'assertBillingAccess').mockResolvedValue(undefined)
    jest.spyOn(service, 'getOverview').mockResolvedValue({})
    return { db, service }
  }
  it.each([null, { dateOfBirth: null }, { dateOfBirth: new Date('2012-01-01') }])('does not assign new dues or record payments for excluded user (%p)', async (user) => {
    const { db, service } = contributions(user)
    await expect(service.replaceAssignments('club', 'owner', { planId: 'plan', memberUserIds: ['target'] })).rejects.toBeInstanceOf(ForbiddenException)
    await expect(service.updateMemberStatus('club', 'target', 'owner', { planId: 'plan', status: 'PAID' })).rejects.toBeInstanceOf(ForbiddenException)
    expect(db.contributionAssignment.upsert).not.toHaveBeenCalled()
    expect(db.contributionAssignment.updateMany).not.toHaveBeenCalled()
    expect(db.contributionRecord.upsert).not.toHaveBeenCalled()
    expect(db.contributionRecord.update).not.toHaveBeenCalled()
  })
  it('preserves excluded historical assignments when replacing the visible adult selection', async () => {
    const { db, service } = contributions({ dateOfBirth: new Date('1990-01-01') })
    await service.replaceAssignments('club', 'owner', { planId: 'plan', memberUserIds: [] })
    expect(db.contributionAssignment.updateMany).toHaveBeenCalledWith({ where: {
      planId: 'plan', memberUserId: { in: ['historical-youth', 'omitted-adult'] }, endDate: null,
      member: expect.objectContaining({ deletedAt: null, dateOfBirth: expect.anything(), OR: launchClubParticipantWhere('club').OR }),
    }, data: { endDate: expect.any(Date) } })
  })
  it('does not reserve or send a reminder for an excluded historical youth record', async () => {
    const { db, service } = contributions(null)
    const result = await service.dispatchReminder({ assignment: { member: { dateOfBirth: new Date('2012-01-01') } } }, {})
    expect(result).toEqual({ sent: false })
    expect(db.contributionReminder.findFirst).not.toHaveBeenCalled()
    expect(db.contributionReminder.create).not.toHaveBeenCalled()
    expect(service.pushService.sendToUser).not.toHaveBeenCalled()
  })
  it('persists unknown push acceptance as UNCONFIRMED, not SENT, and never retries it', async () => {
    const { db, service } = contributions(null)
    const item = { assignment: { planId: 'plan', memberUserId: 'adult', assignedById: 'owner', plan: { name: 'Dues', graceDays: 0 },
      member: { id: 'adult', name: 'Player', email: null, dateOfBirth: new Date('1990-01-01'), preferredLanguage: 'en' } },
      record: { id: 'record', status: 'PENDING', amount: 2500, currency: 'eur', paidAmount: null, dueDate: new Date(Date.now() + 86400000) } }
    const input = { clubId: 'club', clubName: 'Club', trigger: 'MANUAL', reminderKey: 'manual:today' }
    expect(await service.dispatchReminder(item, input)).toEqual({ sent: false, uncertain: true })
    expect(db.contributionReminder.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'UNCONFIRMED', pushSent: false, emailSent: false }) }))
    expect(db.contributionRecord.update).not.toHaveBeenCalled()
    expect(service.auditService.log).toHaveBeenCalledWith(expect.objectContaining({ type: 'contribution.reminder_unconfirmed' }))
    db.contributionReminder.findFirst.mockResolvedValue({ status: 'UNCONFIRMED' })
    expect(await service.dispatchReminder(item, input)).toEqual({ sent: false, uncertain: true })
    expect(service.pushService.sendToUser).toHaveBeenCalledTimes(1)
  })
})

it('suppresses historical health fields and derived readiness without modifying the stored event', async () => {
  const event = { id: 'event', clubId: 'club', teamId: 'team', title: 'Match', type: 'MATCH',
    date: new Date(Date.now() + 86400000), createdAt: new Date(), cancelledAt: null,
    rsvps: [{ id: 'reply', userId: 'player', status: 'NO', reason: 'injured', note: 'Historical health note', nominated: false, updatedAt: new Date(), user: { id: 'player', name: 'Player' } }],
    checkIns: [], reminderPreferences: [], team: { id: 'team', name: 'Team', _count: { access: 1 } },
    _count: { rsvps: 1, checkIns: 0, carpoolRides: 0 }, fixture: null, series: null }
  const db = { event: { findFirst: jest.fn().mockResolvedValue(event) }, teamAccess: {
    findFirst: jest.fn().mockResolvedValue({ id: 'access' }),
    findMany: jest.fn(async ({ where }: any) => where.loanedFromTeamId || where.phase === 'TRIAL' ? [] : [{ userId: 'player', teamId: 'team', user: { id: 'player', name: 'Player' } }]),
  }, teamMember: { findMany: jest.fn().mockResolvedValue([]) } }
  const teams = { assertReadableAccess: jest.fn(), assertEventManagementAccess: jest.fn() }
  const service = new EventsService(db as never, teams as never, {} as never, {} as never, {} as never, {} as never)
  const result = await service.findById('club', 'event', 'player')
  expect(result.myRsvpReason).toBeNull(); expect(result.myRsvpNote).toBeNull()
  expect(result.rsvps[0].reason).toBeNull(); expect(result.rsvps[0].note).toBeNull()
  expect(result.readiness?.metrics.injuryRiskCount).toBe(0)
  expect(result.readiness?.signals.some((signal) => signal.key === 'injury_risks')).toBe(false)
  expect(event.rsvps[0].note).toBe('Historical health note')
})
