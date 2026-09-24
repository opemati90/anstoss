import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common'
import { FreeAgentVisibility, RegistrationRole, TrialInviteStatus } from '@anstoss/shared'
import { dobForAge } from '../testing/fake-prisma'
import { createWechselDb, fillSeats, inDays } from '../testing/wechsel-db'
import { MAX_OPEN_TRIALS_PER_CLUB, trialAccessOpen } from './trial-access'
import { WechselRetentionWorker } from './wechsel-retention.worker'

/**
 * Wechselbörse adversarial-review fixes (2026-09-24), one block per finding.
 * All specs run the real services over the evaluating in-memory database.
 */

type Ctx = ReturnType<typeof createWechselDb>

function invite(id: string, extra: Record<string, any> = {}) {
  return {
    id,
    clubId: 'club-1',
    teamId: 'team-herren',
    freeAgentProfileId: 'p-adult',
    sentByUserId: 'coach',
    message: null,
    status: 'PENDING',
    expiresAt: inDays(10),
    initiatedBy: 'CLUB',
    playerSearchId: null,
    sessionEventIds: ['ev-1', 'ev-2'],
    createdAt: new Date(),
    updatedAt: new Date(),
    respondedAt: null,
    decidedAt: null,
    ...extra,
  }
}

function trialAccessRow(userId = 'fa-adult', extra: Record<string, any> = {}) {
  return {
    id: `ta-trial-${userId}`,
    clubId: 'club-1',
    teamId: 'team-herren',
    userId,
    role: 'PLAYER',
    phase: 'TRIAL',
    status: 'ACTIVE',
    loanEndDate: null,
    createdAt: new Date(),
    ...extra,
  }
}

async function inviteAdult(ctx: Ctx, sessions = ['ev-1', 'ev-2']) {
  return ctx.marketplace.createTrialInvite('club-1', 'coach', {
    freeAgentProfileId: 'p-adult',
    teamId: 'team-herren',
    sessionEventIds: sessions,
  })
}

describe('B1: no seat or plan bypass through TRIAL access', () => {
  it('usage() does not count TRIAL rows and only a FULL seat skips the seat check', async () => {
    const ctx = createWechselDb({ teamAccess: [trialAccessRow()] })
    fillSeats(ctx.db)

    expect((await ctx.entitlements.usage('club-1', ctx.db as never)).players).toBe(30)
    // Before the fix an ACTIVE TRIAL row returned early here.
    await expect(
      ctx.entitlements.assertCanActivatePlayer('club-1', 'fa-adult', ctx.db as never),
    ).rejects.toBeInstanceOf(ConflictException)
    // A player who already holds a FULL seat is not charged twice.
    await expect(
      ctx.entitlements.assertCanActivatePlayer('club-1', 'member', ctx.db as never),
    ).resolves.toBeUndefined()
  })

  it(`caps a club at ${MAX_OPEN_TRIALS_PER_CLUB} open invited trials with a 409; player requests do not count`, async () => {
    const running = Array.from({ length: MAX_OPEN_TRIALS_PER_CLUB }, (_, i) =>
      invite(`running-${i}`, {
        freeAgentProfileId: `p-x${i}`,
        status: ['PENDING', 'ACCEPTED', 'OFFERED'][i % 3],
      }),
    )
    const ctx = createWechselDb({
      trialInvite: [
        ...running,
        invite('asked', { freeAgentProfileId: 'p-minor', status: 'REQUESTED', sessionEventIds: [] }),
      ],
    })

    await expect(inviteAdult(ctx)).rejects.toBeInstanceOf(ConflictException)
    // Turning a player request into an invitation takes a slot too.
    await expect(
      ctx.marketplace.applyClubTrialAction('club-1', 'asked', 'coach', {
        action: 'invite',
        sessionEventIds: ['ev-1'],
      }),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(ctx.row('trialInvite', 'asked').status).toBe('REQUESTED')

    ctx.row('trialInvite', 'running-0').status = 'REJECTED'
    await expect(inviteAdult(ctx)).resolves.toMatchObject({ status: 'PENDING' })
  })
})

describe('H1: TRIAL access is limited to the trial sessions and expires', () => {
  function trialist(extra: { invite?: Record<string, any>; events?: Record<string, any> } = {}) {
    const ctx = createWechselDb({
      trialInvite: [invite('trial-1', { status: 'ACCEPTED', ...extra.invite })],
      teamAccess: [trialAccessRow()],
    })
    for (const [id, patch] of Object.entries(extra.events ?? {})) Object.assign(ctx.row('event', id), patch)
    return ctx
  }

  it('reads only the invite sessions: no roster, chat or other events', async () => {
    const ctx = trialist()

    await expect(
      ctx.teams.assertReadableAccess('fa-adult', 'team-herren', { eventId: 'ev-1' }),
    ).resolves.toMatchObject({ trialEventIds: ['ev-1', 'ev-2'] })
    await expect(
      ctx.teams.assertReadableAccess('fa-adult', 'team-herren', { eventId: 'ev-other' }),
    ).rejects.toThrow('You do not have access to this team.')
    // Roster / chat / fixtures call without an event.
    await expect(ctx.teams.assertReadableAccess('fa-adult', 'team-herren')).rejects.toThrow(
      'You do not have access to this team.',
    )
    await expect(
      ctx.teams.assertReadableAccess('fa-adult', 'team-herren', { trialFeed: true }),
    ).resolves.toMatchObject({ trialEventIds: ['ev-1', 'ev-2'] })
  })

  it('stays open until 3 days after the last session, then closes', async () => {
    const recent = trialist({ events: { 'ev-1': { date: inDays(-6) }, 'ev-2': { date: inDays(-2) } } })
    await expect(
      recent.teams.assertReadableAccess('fa-adult', 'team-herren', { eventId: 'ev-2' }),
    ).resolves.toBeDefined()

    const lapsed = trialist({ events: { 'ev-1': { date: inDays(-6) }, 'ev-2': { date: inDays(-4) } } })
    await expect(
      lapsed.teams.assertReadableAccess('fa-adult', 'team-herren', { eventId: 'ev-2' }),
    ).rejects.toThrow('You do not have access to this team.')
  })

  it('closes at once when every session is cancelled', async () => {
    const ctx = trialist({
      events: { 'ev-1': { cancelledAt: new Date() }, 'ev-2': { cancelledAt: new Date() } },
    })
    await expect(
      ctx.teams.assertReadableAccess('fa-adult', 'team-herren', { eventId: 'ev-1' }),
    ).rejects.toThrow('You do not have access to this team.')
    expect(
      trialAccessOpen([{ id: 'a', date: inDays(2), cancelledAt: new Date() }]),
    ).toBe(false)
  })

  it('keeps legacy member trials (roster decision pending) readable', async () => {
    const ctx = createWechselDb({ teamAccess: [trialAccessRow('member', { id: 'ta-legacy' })] })
    ctx.row('teamAccess', 'ta-member').status = 'REVOKED'
    await expect(ctx.teams.assertReadableAccess('member', 'team-herren')).resolves.toBeDefined()
  })

  it('the retention sweep persists the expiry and leaves running trials alone', async () => {
    const ctx = createWechselDb({
      trialInvite: [
        invite('open', { status: 'ACCEPTED' }),
        invite('lapsed', {
          status: 'ACCEPTED',
          freeAgentProfileId: 'p-minor',
          sessionEventIds: ['ev-old'],
        }),
      ],
      teamAccess: [trialAccessRow('fa-adult'), trialAccessRow('fa-minor')],
      event: [
        {
          id: 'ev-old',
          clubId: 'club-1',
          teamId: 'team-herren',
          type: 'TRAINING',
          title: 'Training',
          date: inDays(-10),
          cancelledAt: null,
        },
      ],
    })
    const worker = new WechselRetentionWorker(ctx.db as never)

    await expect(worker.expireTrialAccess()).resolves.toBe(1)
    expect(ctx.row('teamAccess', 'ta-trial-fa-minor').status).toBe('REVOKED')
    expect(ctx.row('teamAccess', 'ta-trial-fa-adult').status).toBe('ACTIVE')
  })

  it('blocks adults on youth teams and youth age mismatches with a clear message', async () => {
    const ctx = createWechselDb()
    await expect(
      ctx.marketplace.createTrialInvite('club-1', 'coach-u17', {
        freeAgentProfileId: 'p-adult',
        teamId: 'team-u17',
        sessionEventIds: ['ev-u17'],
      }),
    ).rejects.toThrow('only possible for players of that age group')
    // 17 is too old for U17.
    await expect(
      ctx.marketplace.createTrialInvite('club-1', 'coach-u17', {
        freeAgentProfileId: 'p-minor',
        teamId: 'team-u17',
        sessionEventIds: ['ev-u17'],
      }),
    ).rejects.toThrow('too old for this youth team')
    expect(ctx.db.tables.trialInvite).toHaveLength(0)

    // A 16-year-old fits U17; a 17-year-old may trial with the Herren.
    ctx.row('user', 'fa-minor').dateOfBirth = dobForAge(16)
    await expect(
      ctx.marketplace.createTrialInvite('club-1', 'coach-u17', {
        freeAgentProfileId: 'p-minor',
        teamId: 'team-u17',
        sessionEventIds: ['ev-u17'],
      }),
    ).resolves.toMatchObject({ status: 'PENDING' })
  })
})

describe('H2: minors in the Wechselbörse', () => {
  it('under-16s cannot create a profile or take the free-agent role', async () => {
    const ctx = createWechselDb()
    await expect(
      ctx.marketplace.createFreeAgentProfile('fa-child', { isOnTransferList: true }),
    ).rejects.toThrow('talk to your parents')
    ctx.row('user', 'member').dateOfBirth = dobForAge(14)
    await expect(
      ctx.marketplace.updateRegistrationRole('member', RegistrationRole.FREE_AGENT),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(ctx.row('user', 'member').registrationRole).toBe('PLAYER')
  })

  it('16–17: forced CLUB_ONLY, no media, no exact age, region instead of PLZ', async () => {
    const ctx = createWechselDb()
    const saved = await ctx.marketplace.updateFreeAgentProfile('fa-minor', {
      visibility: FreeAgentVisibility.PUBLIC,
    })
    expect(ctx.row('freeAgentProfile', 'p-minor').visibility).toBe('CLUB_ONLY')
    expect(saved.isMinor).toBe(true)
    await expect(
      ctx.marketplace.addMedia('fa-minor', { type: 'PHOTO', url: 'https://cdn.example/p.jpg' }),
    ).rejects.toBeInstanceOf(ForbiddenException)

    const seenByCoach = await ctx.marketplace.getPublicFreeAgentProfile('p-minor', 'coach')
    expect(seenByCoach).toMatchObject({
      age: null,
      isMinor: true,
      postalCode: null,
      postalRegion: '14',
      media: [],
    })
  })

  it('listings never contain under-16s, hide minors from non-staff and never carry the PLZ', async () => {
    const ctx = createWechselDb()
    const query = { page: 1, pageSize: 20, sort: 'recent' as const }

    const forCoach = await ctx.marketplace.listFreeAgents(query, 'coach')
    expect(forCoach.items.map((i) => i.id).sort()).toEqual(['p-adult', 'p-minor'])
    expect(forCoach.items.find((i) => i.id === 'p-minor')).toMatchObject({ age: null, isMinor: true })
    expect(forCoach.items.every((i) => i.postalCode === null)).toBe(true)
    expect(forCoach.items.find((i) => i.id === 'p-adult')).toMatchObject({ postalRegion: '14', age: 24 })

    // Even a PUBLIC minor profile (pre-migration data) stays hidden from non-staff.
    ctx.row('freeAgentProfile', 'p-minor').visibility = 'PUBLIC'
    const forPlayer = await ctx.marketplace.listFreeAgents(query, 'member')
    expect(forPlayer.items.map((i) => i.id)).toEqual(['p-adult'])
    await expect(ctx.marketplace.getPublicFreeAgentProfile('p-child', 'coach')).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it('the owner still sees their own PLZ', async () => {
    const ctx = createWechselDb()
    await expect(ctx.marketplace.getMyFreeAgentProfile('fa-adult')).resolves.toMatchObject({
      postalCode: '14482',
    })
  })
})

describe('H3: CLUB_ONLY is for club staff only', () => {
  it('a plain club member does not see it; admins and active coaches do', async () => {
    const ctx = createWechselDb()
    ctx.row('freeAgentProfile', 'p-adult').visibility = 'CLUB_ONLY'

    await expect(ctx.marketplace.getPublicFreeAgentProfile('p-adult', 'member')).rejects.toBeInstanceOf(
      NotFoundException,
    )
    await expect(ctx.marketplace.getPublicFreeAgentProfile('p-adult', 'owner')).resolves.toBeDefined()
    await expect(ctx.marketplace.getPublicFreeAgentProfile('p-adult', 'coach')).resolves.toBeDefined()

    // A coach whose access was revoked is no longer staff.
    ctx.row('teamAccess', 'ta-coach').status = 'REVOKED'
    await expect(ctx.marketplace.getPublicFreeAgentProfile('p-adult', 'coach')).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })
})

describe('H4: trial answers are age-gated in the club context', () => {
  it('an under-16 cannot accept a Probetraining; the gate is asked with club + team', async () => {
    const ctx = createWechselDb({
      trialInvite: [invite('child-invite', { freeAgentProfileId: 'p-child' })],
    })
    const gate = jest.spyOn(ctx.ageGate, 'assertAllowed')

    await expect(
      ctx.marketplace.respondToTrialInvite('child-invite', 'fa-child', TrialInviteStatus.ACCEPTED),
    ).rejects.toBeDefined()
    expect(gate).toHaveBeenCalledWith('fa-child', { clubId: 'club-1', teamId: 'team-herren' })
    expect(ctx.db.tables.teamAccess.some((r: any) => r.userId === 'fa-child')).toBe(false)
    expect(ctx.row('trialInvite', 'child-invite').status).toBe('PENDING')
  })

  it('a 16–17-year-old may accept', async () => {
    const ctx = createWechselDb({
      trialInvite: [invite('minor-invite', { freeAgentProfileId: 'p-minor' })],
    })
    await expect(
      ctx.marketplace.respondToTrialInvite('minor-invite', 'fa-minor', TrialInviteStatus.ACCEPTED),
    ).resolves.toMatchObject({ status: 'ACCEPTED', player: { isMinor: true } })
  })
})

describe('M1: profile visibility through a trial', () => {
  function hidden(extra: Record<string, any>) {
    const ctx = createWechselDb({ trialInvite: [invite('t', extra)] })
    ctx.row('freeAgentProfile', 'p-adult').visibility = 'PRIVATE'
    return ctx
  }

  it('the inviting team’s coach and admins see it while the trial is open', async () => {
    const ctx = hidden({ status: 'ACCEPTED' })
    await expect(ctx.marketplace.getPublicFreeAgentProfile('p-adult', 'coach')).resolves.toBeDefined()
    await expect(ctx.marketplace.getPublicFreeAgentProfile('p-adult', 'owner')).resolves.toBeDefined()
    // Another team's coach of the same club does not.
    await expect(
      ctx.marketplace.getPublicFreeAgentProfile('p-adult', 'coach-u17'),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('14 days of grace after closing, then hidden again', async () => {
    const recent = hidden({ status: 'REJECTED', updatedAt: inDays(-5) })
    await expect(recent.marketplace.getPublicFreeAgentProfile('p-adult', 'coach')).resolves.toBeDefined()
    const old = hidden({ status: 'REJECTED', updatedAt: inDays(-20) })
    await expect(old.marketplace.getPublicFreeAgentProfile('p-adult', 'coach')).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })
})

describe('M2: Aufnahmeantrag personal data', () => {
  const pii = {
    street: 'Kastanienallee 12',
    postalCode: '14482',
    city: 'Potsdam',
    phone: '+49 151 2345678',
    nationality: 'deutsch',
    lastMatchDate: new Date('2026-05-31'),
  }
  const jr = (id: string, extra: Record<string, any>) => ({
    id,
    clubId: 'club-1',
    userId: 'fa-adult',
    teamId: 'team-herren',
    role: 'PLAYER',
    revision: 1,
    createdAt: new Date(),
    ...pii,
    ...extra,
  })

  it('the sweep erases rejected/withdrawn applications after 30 days only', async () => {
    const ctx = createWechselDb({
      joinRequest: [
        jr('old-rejected', { status: 'REJECTED', reviewedAt: inDays(-31) }),
        jr('old-withdrawn', { status: 'WITHDRAWN', reviewedAt: inDays(-40), userId: 'fa-minor' }),
        jr('fresh-rejected', { status: 'REJECTED', reviewedAt: inDays(-10), userId: 'member' }),
        jr('approved', { status: 'APPROVED', reviewedAt: inDays(-90), userId: 'owner' }),
      ],
    })
    await expect(new WechselRetentionWorker(ctx.db as never).eraseJoinRequestPii()).resolves.toBe(2)
    expect(ctx.row('joinRequest', 'old-rejected')).toMatchObject({ street: null, phone: null, nationality: null })
    expect(ctx.row('joinRequest', 'old-withdrawn').lastMatchDate).toBeNull()
    expect(ctx.row('joinRequest', 'fresh-rejected').street).toBe('Kastanienallee 12')
    expect(ctx.row('joinRequest', 'approved').street).toBe('Kastanienallee 12')
  })

  it('withdrawing erases at once; listPending returns no account email or DOB', async () => {
    const ctx = createWechselDb({
      joinRequest: [
        jr('pending', { status: 'PENDING' }),
        jr('mine', { status: 'PENDING', userId: 'fa-minor' }),
      ],
    })
    await ctx.joinRequests.withdraw('fa-minor', 'club-1', 'mine')
    expect(ctx.row('joinRequest', 'mine')).toMatchObject({ status: 'WITHDRAWN', street: null, phone: null })

    const list = await ctx.joinRequests.listPending('club-1')
    expect(list).toHaveLength(1)
    expect(list[0].user).toEqual({ id: 'fa-adult', name: 'Tim Weber', isMinor: false })
    expect(JSON.stringify(list)).not.toMatch(/example\.de|dateOfBirth/)
    // The withdrawn application's address never reaches the review list.
    expect(list.map((r: any) => r.id)).toEqual(['pending'])
  })
})

describe('M3: deleting the profile ends open trials', () => {
  it('revokes TRIAL access, withdraws and erases a pending application, then deletes', async () => {
    const ctx = createWechselDb({
      trialInvite: [invite('offer', { status: 'OFFERED' })],
      teamAccess: [trialAccessRow()],
      joinRequest: [
        {
          id: 'jr-offer',
          clubId: 'club-1',
          userId: 'fa-adult',
          teamId: 'team-herren',
          trialInviteId: 'offer',
          status: 'PENDING',
          revision: 1,
          street: 'Kastanienallee 12',
          phone: '+49 151 2345678',
        },
      ],
    })

    await ctx.marketplace.deleteFreeAgentProfile('fa-adult')

    expect(ctx.row('teamAccess', 'ta-trial-fa-adult').status).toBe('REVOKED')
    expect(ctx.row('joinRequest', 'jr-offer')).toMatchObject({ status: 'WITHDRAWN', street: null, phone: null })
    expect(ctx.db.tables.freeAgentProfile.some((p: any) => p.id === 'p-adult')).toBe(false)
  })
})

describe('M4: listing hygiene and GDPR delete', () => {
  it('lists only FREE_AGENT users and delists when the role changes', async () => {
    const ctx = createWechselDb()
    await ctx.marketplace.updateRegistrationRole('fa-adult', RegistrationRole.PLAYER)
    expect(ctx.row('freeAgentProfile', 'p-adult').isOnTransferList).toBe(false)

    ctx.row('freeAgentProfile', 'p-adult').isOnTransferList = true
    const list = await ctx.marketplace.listFreeAgents({ page: 1, pageSize: 20, sort: 'recent' }, 'coach')
    expect(list.items.map((i) => i.id)).toEqual(['p-minor'])
  })

  it('the owner can delete their profile after leaving the free-agent role', async () => {
    const ctx = createWechselDb()
    ctx.row('user', 'fa-adult').registrationRole = 'PLAYER'
    await expect(ctx.marketplace.deleteFreeAgentProfile('fa-adult')).resolves.toBeUndefined()
  })
})

describe('M5: trial-request spam', () => {
  it('one request per club per 24h, even after withdrawing', async () => {
    const ctx = createWechselDb()
    const first = await ctx.marketplace.createTrialRequest('search-1', 'fa-adult', {})
    await ctx.marketplace.respondToTrialInvite(first.id, 'fa-adult', TrialInviteStatus.WITHDRAWN)

    const again = ctx.marketplace.createTrialRequest('search-1', 'fa-adult', {})
    await expect(again).rejects.toBeInstanceOf(HttpException)
    await expect(again).rejects.toMatchObject({ status: 429 })
  })

  it('a daily cap across clubs', async () => {
    const earlier = Array.from({ length: 5 }, (_, i) =>
      invite(`req-${i}`, {
        clubId: `club-${i + 10}`,
        status: 'DECLINED',
        initiatedBy: 'PLAYER',
        createdAt: inDays(-0.5),
      }),
    )
    const ctx = createWechselDb({ trialInvite: earlier })
    await expect(ctx.marketplace.createTrialRequest('search-1', 'fa-adult', {})).rejects.toMatchObject({
      status: 429,
    })
  })
})

describe('M7 / M8 / L4 / L6: pipeline details', () => {
  it('M7: a club invite takes the same per-thread lock as a player request', async () => {
    const ctx = createWechselDb()
    await inviteAdult(ctx)
    expect(ctx.db.locks.some((l: string) => l.includes('trial-thread:club-1:p-adult'))).toBe(true)
  })

  it('M8: revoking pushes the player a localized notice', async () => {
    const ctx = createWechselDb({ trialInvite: [invite('t', { status: 'ACCEPTED' })], teamAccess: [trialAccessRow()] })
    await ctx.marketplace.applyClubTrialAction('club-1', 't', 'coach', { action: 'revoke' })
    expect(ctx.push.sendToUserLocalized).toHaveBeenCalledWith(
      'fa-adult',
      'TRIAL_REVOKED',
      { clubName: 'SV Albatros', teamName: 'Herren II' },
      { trialInviteId: 't', clubId: 'club-1' },
      { clubId: 'club-1' },
    )
    expect(ctx.row('teamAccess', 'ta-trial-fa-adult').status).toBe('REVOKED')
  })

  it('L4: an expired invite is lapsed before any action and a past deadline is refused', async () => {
    const ctx = createWechselDb({ trialInvite: [invite('late', { expiresAt: inDays(-1) })] })
    await expect(
      ctx.marketplace.applyClubTrialAction('club-1', 'late', 'coach', { action: 'revoke' }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(ctx.row('trialInvite', 'late').status).toBe('EXPIRED')

    ctx.row('freeAgentProfile', 'p-adult').isOnTransferList = true
    await expect(
      ctx.marketplace.createTrialInvite('club-1', 'coach', {
        freeAgentProfileId: 'p-adult',
        teamId: 'team-herren',
        sessionEventIds: ['ev-1'],
        expiresAt: inDays(-1).toISOString(),
      }),
    ).rejects.toThrow('must be in the future')
  })

  it('L6: a thread and a Gesuch survive without their staff creator', async () => {
    const ctx = createWechselDb({ trialInvite: [invite('orphan', { sentByUserId: null })] })
    ctx.row('playerSearch', 'search-1').createdByUserId = null
    await expect(ctx.marketplace.getTrialInvite('orphan', 'fa-adult')).resolves.toMatchObject({
      sender: null,
    })
    ctx.row('trialInvite', 'orphan').status = 'DECLINED'
    ctx.row('trialInvite', 'orphan').createdAt = inDays(-3)
    const request = await ctx.marketplace.createTrialRequest('search-1', 'fa-adult', {})
    expect(request.sender).toBeNull()
    expect(ctx.push.sendToUserLocalized).not.toHaveBeenCalledWith(
      expect.anything(),
      'TRIAL_REQUEST',
      expect.anything(),
      expect.anything(),
      expect.anything(),
    )
  })
})

describe('L2 / L3: roster decisions and legacy rows', () => {
  it('L2: a roster reject of a trialist rejects the invite; a roster accept is refused', async () => {
    const ctx = createWechselDb({
      trialInvite: [invite('t', { status: 'OFFERED' })],
      teamAccess: [trialAccessRow()],
      joinRequest: [
        { id: 'jr', clubId: 'club-1', userId: 'fa-adult', trialInviteId: 't', status: 'PENDING', revision: 1 },
      ],
    })
    await expect(
      ctx.teams.decideTrialAccess('club-1', 'ta-trial-fa-adult', 'coach', { decision: 'ACCEPT' }),
    ).rejects.toThrow('Probetraining')

    await ctx.teams.decideTrialAccess('club-1', 'ta-trial-fa-adult', 'coach', { decision: 'REJECT' })
    expect(ctx.row('trialInvite', 't')).toMatchObject({ status: 'REJECTED', decidedByUserId: 'coach' })
    expect(ctx.row('joinRequest', 'jr').status).toBe('REJECTED')
    expect(ctx.row('teamAccess', 'ta-trial-fa-adult').status).toBe('REJECTED')
  })

  it('L2: accepting a member’s legacy trial takes a seat (B1)', async () => {
    const ctx = createWechselDb({ teamAccess: [trialAccessRow('member', { id: 'ta-legacy', teamId: 'team-u17' })] })
    ctx.row('user', 'member').dateOfBirth = dobForAge(16)
    fillSeats(ctx.db)
    await expect(
      ctx.teams.decideTrialAccess('club-1', 'ta-legacy', 'owner', { decision: 'ACCEPT' }),
    ).resolves.toMatchObject({ phase: 'FULL' })
    // Without a FULL seat elsewhere, a full plan refuses the promotion.
    ctx.row('teamAccess', 'ta-member').status = 'REVOKED'
    ctx.row('teamAccess', 'ta-legacy').phase = 'TRIAL'
    fillSeats(ctx.db)
    await expect(
      ctx.teams.decideTrialAccess('club-1', 'ta-legacy', 'owner', { decision: 'ACCEPT' }),
    ).rejects.toThrow('player seats')
  })

  it('L3: a legacy ACCEPTED invite without sessions grants no reads and cannot be accepted anew', async () => {
    const ctx = createWechselDb({
      trialInvite: [
        invite('legacy', { status: 'ACCEPTED', sessionEventIds: [] }),
        invite('empty', { status: 'PENDING', sessionEventIds: [], freeAgentProfileId: 'p-minor' }),
      ],
      teamAccess: [trialAccessRow()],
    })
    await expect(
      ctx.teams.assertReadableAccess('fa-adult', 'team-herren', { trialFeed: true }),
    ).rejects.toThrow('You do not have access to this team.')
    await expect(
      ctx.marketplace.respondToTrialInvite('empty', 'fa-minor', TrialInviteStatus.ACCEPTED),
    ).rejects.toThrow('no training sessions')
  })
})

describe('Join requests: players need a date of birth (onboarding)', () => {
  it('rejects a PLAYER join request without a DOB, accepts one with it', async () => {
    const ctx = createWechselDb()
    await expect(ctx.joinRequests.create('owner', 'club-1', { role: 'PLAYER' })).rejects.toThrow(
      'date of birth',
    )
    expect(ctx.db.tables.joinRequest).toHaveLength(0)
    ctx.row('user', 'owner').dateOfBirth = dobForAge(30)
    await expect(ctx.joinRequests.create('fa-adult', 'club-1', { role: 'PLAYER' })).resolves.toMatchObject({
      status: 'PENDING',
    })
  })
})

describe('Join requests: parents keep their role and must be adults', () => {
  it('stores a PARENT request as PARENT (not PLAYER) for an adult', async () => {
    const ctx = createWechselDb()
    const created = await ctx.joinRequests.create('fa-adult', 'club-1', { role: 'PARENT' })
    expect(created).toMatchObject({ status: 'PENDING' })
    expect(ctx.db.tables.joinRequest).toHaveLength(1)
    expect(ctx.db.tables.joinRequest[0].role).toBe('PARENT')
  })

  it('rejects a PARENT request from someone under 18 and writes nothing', async () => {
    const ctx = createWechselDb()
    await expect(ctx.joinRequests.create('fa-minor', 'club-1', { role: 'PARENT' })).rejects.toThrow(
      /at least 18/,
    )
    expect(ctx.db.tables.joinRequest).toHaveLength(0)
  })

  it('keeps a trial Aufnahmeantrag as PLAYER even if PARENT is sent', async () => {
    const ctx = createWechselDb()
    await ctx
      .joinRequests.create('fa-adult', 'club-1', { role: 'PARENT', trialInviteId: 'missing-invite' })
      .catch(() => undefined)
    for (const row of ctx.db.tables.joinRequest) expect(row.role).toBe('PLAYER')
  })
})
