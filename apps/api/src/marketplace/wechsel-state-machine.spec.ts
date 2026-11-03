import '../../test/future-capabilities'

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { TrialInviteStatus } from '@anstoss/shared'
import { createWechselDb, fillSeats } from '../testing/wechsel-db'

/**
 * Integration-style spec of the whole Wechselbörse state machine over one
 * in-memory database with real services (marketplace, join requests,
 * entitlements, teams, age gate):
 *
 *   PENDING ─accept→ ACCEPTED ─offer→ OFFERED ─Aufnahmeantrag→ (JoinRequest
 *   PENDING) ─approve→ JOINED (+ FULL access, membership, delisted)
 *
 * and the illegal transitions around it.
 */
describe('Wechselbörse state machine: trial → offer → Aufnahmeantrag → approval', () => {
  const aufnahme = {
    role: 'PLAYER' as const,
    street: 'Kastanienallee 12',
    postalCode: '14482',
    city: 'Potsdam',
    phone: '+49 151 2345678',
    previousClubName: 'SV Babelsberg 03',
    sepaConsent: true,
  }

  async function invitedAndAccepted(ctx: ReturnType<typeof createWechselDb>, profileId = 'p-adult', userId = 'fa-adult') {
    const invite = await ctx.marketplace.createTrialInvite('club-1', 'coach', {
      freeAgentProfileId: profileId,
      teamId: 'team-herren',
      sessionEventIds: ['ev-1', 'ev-2'],
    })
    await ctx.marketplace.respondToTrialInvite(invite.id, userId, TrialInviteStatus.ACCEPTED)
    return invite.id
  }

  it('runs the happy path for an adult and ends with a FULL seat, a membership and a delisted card', async () => {
    const ctx = createWechselDb()
    const inviteId = await invitedAndAccepted(ctx)

    expect(ctx.row('trialInvite', inviteId).status).toBe('ACCEPTED')
    const trialAccess = ctx.db.tables.teamAccess.find(
      (r: any) => r.userId === 'fa-adult' && r.teamId === 'team-herren',
    )
    expect(trialAccess).toMatchObject({ phase: 'TRIAL', status: 'ACTIVE' })
    // A Probetraining is not a seat and not a membership.
    expect((await ctx.entitlements.usage('club-1', ctx.db as never)).players).toBe(1)
    expect(ctx.db.tables.membership.some((m: any) => m.userId === 'fa-adult')).toBe(false)

    await ctx.marketplace.applyClubTrialAction('club-1', inviteId, 'coach', { action: 'offer' })
    await ctx.marketplace.respondToTrialInvite(inviteId, 'fa-adult', 'ACCEPT_OFFER')
    expect(ctx.row('trialInvite', inviteId).status).toBe('OFFERED')

    const request = await ctx.joinRequests.create('fa-adult', 'club-1', {
      ...aufnahme,
      trialInviteId: inviteId,
    })
    expect(ctx.row('joinRequest', request.id)).toMatchObject({
      status: 'PENDING',
      teamId: 'team-herren',
      trialInviteId: inviteId,
      releaseStatus: 'PENDING',
    })
    expect(ctx.row('joinRequest', request.id).sepaConsentAt).toBeInstanceOf(Date)

    await ctx.joinRequests.approve('club-1', request.id, 'owner', { revision: 1 })

    expect(ctx.row('trialInvite', inviteId).status).toBe('JOINED')
    expect(ctx.row('joinRequest', request.id).status).toBe('APPROVED')
    expect(trialAccess).toMatchObject({ phase: 'FULL', status: 'ACTIVE' })
    expect(ctx.db.tables.membership.find((m: any) => m.userId === 'fa-adult')).toMatchObject({
      clubId: 'club-1',
      role: 'PLAYER',
    })
    // M4: joined players leave the Wechselbörse.
    expect(ctx.row('freeAgentProfile', 'p-adult').isOnTransferList).toBe(false)
    expect((await ctx.entitlements.usage('club-1', ctx.db as never)).players).toBe(2)
  })

  describe('illegal transitions', () => {
    it('cannot offer before the player accepted, nor accept twice', async () => {
      const ctx = createWechselDb()
      const invite = await ctx.marketplace.createTrialInvite('club-1', 'coach', {
        freeAgentProfileId: 'p-adult',
        teamId: 'team-herren',
        sessionEventIds: ['ev-1'],
      })
      await expect(
        ctx.marketplace.applyClubTrialAction('club-1', invite.id, 'coach', { action: 'offer' }),
      ).rejects.toBeInstanceOf(BadRequestException)

      await ctx.marketplace.respondToTrialInvite(invite.id, 'fa-adult', TrialInviteStatus.ACCEPTED)
      await expect(
        ctx.marketplace.respondToTrialInvite(invite.id, 'fa-adult', TrialInviteStatus.ACCEPTED),
      ).rejects.toBeInstanceOf(BadRequestException)
      expect(ctx.row('trialInvite', invite.id).status).toBe('ACCEPTED')
    })

    it('cannot file an Aufnahmeantrag without a standing offer', async () => {
      const ctx = createWechselDb()
      const inviteId = await invitedAndAccepted(ctx)
      await expect(
        ctx.joinRequests.create('fa-adult', 'club-1', { ...aufnahme, trialInviteId: inviteId }),
      ).rejects.toThrow('This offer is no longer open')
      expect(ctx.db.tables.joinRequest).toHaveLength(0)
    })

    it('B2: once the player declines the offer the application is closed and cannot be approved', async () => {
      const ctx = createWechselDb()
      const inviteId = await invitedAndAccepted(ctx)
      await ctx.marketplace.applyClubTrialAction('club-1', inviteId, 'coach', { action: 'offer' })
      const request = await ctx.joinRequests.create('fa-adult', 'club-1', {
        ...aufnahme,
        trialInviteId: inviteId,
      })

      await ctx.marketplace.respondToTrialInvite(inviteId, 'fa-adult', TrialInviteStatus.DECLINED)

      const closed = ctx.row('joinRequest', request.id)
      expect(closed.status).toBe('WITHDRAWN')
      // M2: withdrawn by the player → contact data erased at once.
      expect(closed).toMatchObject({ street: null, postalCode: null, city: null, phone: null })
      await expect(
        ctx.joinRequests.approve('club-1', request.id, 'owner', { revision: 1 }),
      ).rejects.toBeInstanceOf(NotFoundException)
      expect(ctx.db.tables.membership.some((m: any) => m.userId === 'fa-adult')).toBe(false)
      expect(
        ctx.db.tables.teamAccess.find((r: any) => r.userId === 'fa-adult')?.status,
      ).toBe('REVOKED')
    })

    it('B2: approval of a stale pending application whose offer left OFFERED is refused inside the transaction', async () => {
      const ctx = createWechselDb()
      const inviteId = await invitedAndAccepted(ctx)
      await ctx.marketplace.applyClubTrialAction('club-1', inviteId, 'coach', { action: 'offer' })
      const request = await ctx.joinRequests.create('fa-adult', 'club-1', {
        ...aufnahme,
        trialInviteId: inviteId,
      })
      // Simulate a row that escaped the close hook (legacy data).
      ctx.row('trialInvite', inviteId).status = 'REVOKED'

      await expect(
        ctx.joinRequests.approve('club-1', request.id, 'owner', { revision: 1 }),
      ).rejects.toBeInstanceOf(ConflictException)
      expect(ctx.row('joinRequest', request.id).status).toBe('PENDING')
      expect(ctx.db.tables.membership.some((m: any) => m.userId === 'fa-adult')).toBe(false)
    })

    it('B2: a club rejection of the offer rejects the pending application', async () => {
      const ctx = createWechselDb()
      const inviteId = await invitedAndAccepted(ctx)
      await ctx.marketplace.applyClubTrialAction('club-1', inviteId, 'coach', { action: 'offer' })
      const request = await ctx.joinRequests.create('fa-adult', 'club-1', {
        ...aufnahme,
        trialInviteId: inviteId,
      })

      await ctx.marketplace.applyClubTrialAction('club-1', inviteId, 'coach', { action: 'reject' })

      expect(ctx.row('joinRequest', request.id)).toMatchObject({ status: 'REJECTED', reviewedBy: 'coach' })
      // Rejected (not withdrawn): data stays for the 30-day retention window.
      expect(ctx.row('joinRequest', request.id).street).toBe('Kastanienallee 12')
    })

    it('B1: approving the application cannot exceed the plan even though the player holds TRIAL access', async () => {
      const ctx = createWechselDb()
      const inviteId = await invitedAndAccepted(ctx)
      await ctx.marketplace.applyClubTrialAction('club-1', inviteId, 'coach', { action: 'offer' })
      const request = await ctx.joinRequests.create('fa-adult', 'club-1', {
        ...aufnahme,
        trialInviteId: inviteId,
      })
      fillSeats(ctx.db)

      await expect(
        ctx.joinRequests.approve('club-1', request.id, 'owner', { revision: 1 }),
      ).rejects.toThrow('player seats')
      expect(ctx.row('trialInvite', inviteId).status).toBe('OFFERED')
    })

    it('JOINED is terminal: no decline, no second application', async () => {
      const ctx = createWechselDb()
      const inviteId = await invitedAndAccepted(ctx)
      await ctx.marketplace.applyClubTrialAction('club-1', inviteId, 'coach', { action: 'offer' })
      const request = await ctx.joinRequests.create('fa-adult', 'club-1', {
        ...aufnahme,
        trialInviteId: inviteId,
      })
      await ctx.joinRequests.approve('club-1', request.id, 'owner', { revision: 1 })

      await expect(
        ctx.marketplace.respondToTrialInvite(inviteId, 'fa-adult', TrialInviteStatus.DECLINED),
      ).rejects.toBeInstanceOf(BadRequestException)
      await expect(
        ctx.marketplace.applyClubTrialAction('club-1', inviteId, 'coach', { action: 'reject' }),
      ).rejects.toBeInstanceOf(BadRequestException)
      await expect(
        ctx.joinRequests.create('fa-adult', 'club-1', { ...aufnahme, trialInviteId: inviteId }),
      ).rejects.toBeInstanceOf(ConflictException)
      expect(ctx.row('trialInvite', inviteId).status).toBe('JOINED')
    })
  })

  describe('H4: a 17-year-old joins only with a guardian’s consent', () => {
    it('opens a club+team scoped consent for the guardian and approves only after it is given', async () => {
      const ctx = createWechselDb()
      const inviteId = await invitedAndAccepted(ctx, 'p-minor', 'fa-minor')
      await ctx.marketplace.applyClubTrialAction('club-1', inviteId, 'coach', { action: 'offer' })

      // The child ticking the boxes is not enough.
      await expect(
        ctx.joinRequests.create('fa-minor', 'club-1', {
          ...aufnahme,
          trialInviteId: inviteId,
          parentalConsent: true,
        }),
      ).rejects.toThrow('guardian')

      const request = await ctx.joinRequests.create('fa-minor', 'club-1', {
        ...aufnahme,
        trialInviteId: inviteId,
        guardianEmail: 'eltern.brandt@example.de',
      })
      expect(ctx.row('joinRequest', request.id)).toMatchObject({
        sepaConsentAt: null,
        parentalConsentAt: null,
      })
      const consent: any = ctx.db.tables.parentalConsent.find((c: any) => c.playerUserId === 'fa-minor')
      expect(consent).toMatchObject({
        clubId: 'club-1',
        teamId: 'team-herren',
        guardianEmail: 'eltern.brandt@example.de',
        status: 'PENDING',
      })

      await expect(
        ctx.joinRequests.approve('club-1', request.id, 'owner', { revision: 1 }),
      ).rejects.toThrow('Guardian approval')
      expect(ctx.row('trialInvite', inviteId).status).toBe('OFFERED')

      // The guardian approves through the consent flow.
      consent.status = 'APPROVED'
      consent.guardianUserId = 'guardian'
      consent.approvedAt = new Date()
      await ctx.joinRequests.approve('club-1', request.id, 'owner', { revision: 1 })

      expect(ctx.row('trialInvite', inviteId).status).toBe('JOINED')
      expect(ctx.row('joinRequest', request.id).sepaConsentAt).toEqual(consent.approvedAt)
      expect(ctx.row('joinRequest', request.id).parentalConsentAt).toEqual(consent.approvedAt)
    })

    it('a consent for another team of the club does not count', async () => {
      const ctx = createWechselDb({
        parentalConsent: [
          {
            id: 'consent-u17',
            clubId: 'club-1',
            teamId: 'team-u17',
            playerUserId: 'fa-minor',
            guardianEmail: 'eltern.brandt@example.de',
            status: 'APPROVED',
            approvedAt: new Date(),
          },
        ],
      })
      const inviteId = await invitedAndAccepted(ctx, 'p-minor', 'fa-minor')
      await ctx.marketplace.applyClubTrialAction('club-1', inviteId, 'coach', { action: 'offer' })
      const request = await ctx.joinRequests.create('fa-minor', 'club-1', {
        ...aufnahme,
        trialInviteId: inviteId,
        guardianEmail: 'eltern.brandt@example.de',
      })
      await expect(
        ctx.joinRequests.approve('club-1', request.id, 'owner', { revision: 1 }),
      ).rejects.toThrow('Guardian approval')
    })
  })
})
