import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { ConsentService } from './consent.service'
import { CONSENT_WITHDRAWN_EVENT, withoutPlayer } from './consent-withdrawal'
import { createFakePrisma, dobForAge, PRIVACY_RELATIONS } from '../testing/fake-prisma'

// Privacy: guardian consent withdrawal, GDPR Art. 7(3) (external audit
// 2026-09-24 + safeguarding review fixes M1-M4, M7, H4, H5, L3). The fake
// Prisma evaluates every where clause against the seeded rows.

const DAY = 24 * 60 * 60 * 1000

function world(extra: Partial<Record<string, Record<string, unknown>[]>> = {}) {
  const now = Date.now()
  return createFakePrisma(
    {
      club: [{ id: 'albatros', name: 'SV Albatros', primaryColor: '#1A1A18', badgeUrl: null }],
      team: [
        { id: 'u15', clubId: 'albatros', name: 'U15', displayName: 'U15' },
        { id: 'u14', clubId: 'albatros', name: 'U14', displayName: 'U14' },
      ],
      user: [
        // M7: the child is 14 relative to today, not a fixed birth year.
        { id: 'tim', name: 'Tim Weber', email: 'tim@example.com', dateOfBirth: dobForAge(14), deletedAt: null },
        { id: 'anna', name: 'Anna Weber', email: 'anna@example.com', dateOfBirth: dobForAge(41), deletedAt: null },
        { id: 'marc', name: 'Marc Weber', email: 'marc@example.com', dateOfBirth: dobForAge(44), deletedAt: null },
        // onboarding review fix (B2): legacy 16+ declaration only, no DOB.
        { id: 'declared', name: 'Declared', email: 'declared@example.com', dateOfBirth: null, adultConfirmedAt: new Date(), deletedAt: null },
        { id: 'seventeen', name: 'Seventeen', email: 'seventeen@example.com', dateOfBirth: dobForAge(17), deletedAt: null },
        { id: 'admin', name: 'Kassenwart', email: 'admin@albatros.de', dateOfBirth: dobForAge(50), deletedAt: null },
        { id: 'coach', name: 'Jugendleiter', email: 'coach@albatros.de', dateOfBirth: dobForAge(35), deletedAt: null },
        { id: 'teen-parent', name: 'Teen', email: 'teen@example.com', dateOfBirth: dobForAge(15), deletedAt: null },
      ],
      membership: [
        { userId: 'tim', clubId: 'albatros', role: 'PLAYER' },
        { userId: 'admin', clubId: 'albatros', role: 'ADMIN' },
        { userId: 'coach', clubId: 'albatros', role: 'COACH' },
      ],
      parentalConsent: [
        {
          id: 'c-anna',
          clubId: 'albatros',
          teamId: 'u15',
          playerUserId: 'tim',
          guardianEmail: 'anna@example.com',
          guardianUserId: 'anna',
          status: 'APPROVED',
          withdrawalReason: null,
          withdrawalNote: null,
        },
      ],
      teamAccess: [
        { id: 'a-tim', clubId: 'albatros', teamId: 'u15', userId: 'tim', role: 'PLAYER', status: 'ACTIVE' },
        { id: 'a-coach', clubId: 'albatros', teamId: 'u15', userId: 'coach', role: 'HEAD_COACH', status: 'ACTIVE' },
      ],
      guardianRelationship: [],
      channel: [
        { id: 'ch-team', clubId: 'albatros', teamId: 'u15' },
        { id: 'ch-club', clubId: 'albatros', teamId: null },
      ],
      channelMember: [
        { id: 'm1', channelId: 'ch-team', userId: 'tim' },
        { id: 'm2', channelId: 'ch-club', userId: 'tim' },
      ],
      event: [
        {
          id: 'past',
          clubId: 'albatros',
          teamId: 'u15',
          date: new Date(now - 7 * DAY),
          fixtureId: null,
          lineup: { formation: '4-4-2', starters: [{ userId: 'tim', name: 'Tim Weber' }], bench: [] },
        },
        {
          id: 'next',
          clubId: 'albatros',
          teamId: 'u15',
          date: new Date(now + 3 * DAY),
          fixtureId: 'fx-1',
          lineup: {
            formation: '4-4-2',
            starters: [
              { userId: 'tim', name: 'Tim Weber', number: 7 },
              { userId: 'lukas', name: 'Lukas Hoffmann', number: 9 },
            ],
            bench: [],
          },
        },
        { id: 'other-team', clubId: 'albatros', teamId: 'u14', date: new Date(now + 3 * DAY), lineup: null },
      ],
      fixtureOverlay: [{ id: 'ov', clubId: 'albatros', fixtureId: 'fx-1', lineup: null }],
      rsvp: [
        { id: 'r-past', eventId: 'past', userId: 'tim', status: 'YES' },
        { id: 'r-next', eventId: 'next', userId: 'tim', status: 'YES', nominated: true },
        { id: 'r-other', eventId: 'other-team', userId: 'tim', status: 'YES' },
      ],
      carpoolRide: [
        { id: 'ride-next', clubId: 'albatros', eventId: 'next' },
        { id: 'ride-past', clubId: 'albatros', eventId: 'past' },
      ],
      carpoolSeat: [
        { id: 's-next', clubId: 'albatros', rideId: 'ride-next', userId: 'tim' },
        { id: 's-past', clubId: 'albatros', rideId: 'ride-past', userId: 'tim' },
      ],
      teamDutyAssignment: [
        { id: 'd-open', clubId: 'albatros', teamId: 'u15', assignedUserId: 'tim', status: 'PENDING', dueDate: new Date(now + DAY) },
        { id: 'd-done', clubId: 'albatros', teamId: 'u15', assignedUserId: 'tim', status: 'COMPLETED', dueDate: new Date(now - DAY) },
      ],
      teamMember: [{ id: 'tm', teamId: 'u15', userId: 'tim' }],
      auditLog: [],
      ...extra,
    },
    PRIVACY_RELATIONS,
  )
}

function service(prisma: ReturnType<typeof world>) {
  const events = { emit: jest.fn() }
  const push = { sendToUserLocalized: jest.fn().mockResolvedValue(undefined) }
  const audit = { log: jest.fn().mockResolvedValue(undefined) }
  return {
    svc: new ConsentService(prisma as never, audit as never, events as never, push as never),
    events,
    push,
  }
}

const ids = (rows: Array<Record<string, unknown>>) => rows.map((r) => String(r.id)).sort()

describe('ConsentService.withdrawConsent', () => {
  it('guardian withdraws: consent WITHDRAWN, access REVOKED, channels cleared, audited, event emitted', async () => {
    const prisma = world()
    const { svc, events } = service(prisma)

    const result = await svc.withdrawConsent('c-anna', 'anna')

    expect(result.status).toBe('WITHDRAWN')
    expect(prisma.tables.teamAccess.find((a) => a.id === 'a-tim')?.status).toBe('REVOKED')
    expect(prisma.tables.channelMember).toEqual([])
    expect(prisma.tables.auditLog).toEqual([
      expect.objectContaining({ type: 'consent.withdrawn', actorId: 'anna' }),
    ])
    expect(events.emit).toHaveBeenCalledWith(
      CONSENT_WITHDRAWN_EVENT,
      expect.objectContaining({
        effects: [
          expect.objectContaining({
            consentId: 'c-anna',
            accessRevoked: true,
            guardianEmail: 'anna@example.com',
          }),
        ],
      }),
    )
    expect(events.emit).toHaveBeenCalledWith('realtime.access.changed', { userId: 'tim' })
  })

  it('M1: takes the per-child-per-team advisory lock before deciding', async () => {
    const prisma = world()
    const { svc } = service(prisma)
    await svc.withdrawConsent('c-anna', 'anna')
    expect(prisma.locks.some((l) => l.includes('albatros:u15:tim:player-access'))).toBe(true)
  })

  it('M4: drops future RSVPs, seats, open duties and lineup spots on that team only; keeps history', async () => {
    const prisma = world()
    const { svc } = service(prisma)
    await svc.withdrawConsent('c-anna', 'anna')

    expect(ids(prisma.tables.rsvp)).toEqual(['r-other', 'r-past'])
    expect(ids(prisma.tables.carpoolSeat)).toEqual(['s-past'])
    expect(ids(prisma.tables.teamDutyAssignment)).toEqual(['d-done'])
    const next = prisma.tables.event.find((e) => e.id === 'next')
    expect(next?.lineup.starters.map((p: { name: string }) => p.name)).toEqual(['Lukas Hoffmann'])
    const past = prisma.tables.event.find((e) => e.id === 'past')
    expect(past?.lineup.starters).toHaveLength(1)
    expect(prisma.tables.fixtureOverlay[0].lineup.starters).toEqual([
      { number: 9, name: 'Lukas Hoffmann', position: null },
    ])
    // The TeamMember row is kept (documented in RELEASE_GATE).
    expect(prisma.tables.teamMember).toHaveLength(1)
  })

  it('keeps team access while another guardian still approves the child on that team', async () => {
    const prisma = world({
      parentalConsent: [
        { id: 'c-anna', clubId: 'albatros', teamId: 'u15', playerUserId: 'tim', guardianEmail: 'anna@example.com', guardianUserId: 'anna', status: 'APPROVED' },
        { id: 'c-marc', clubId: 'albatros', teamId: 'u15', playerUserId: 'tim', guardianEmail: 'marc@example.com', guardianUserId: 'marc', status: 'APPROVED' },
      ],
    })
    const { svc } = service(prisma)
    await svc.withdrawConsent('c-anna', 'anna')
    expect(prisma.tables.teamAccess.find((a) => a.id === 'a-tim')?.status).toBe('ACTIVE')
    expect(prisma.tables.rsvp).toHaveLength(3)
  })

  it('returns 404 for a stranger and for an unknown id (no cross-club probing)', async () => {
    const prisma = world({
      user: [{ id: 'stranger', email: 'x@example.com', deletedAt: null }],
    })
    const { svc } = service(prisma)
    await expect(svc.withdrawConsent('c-anna', 'stranger')).rejects.toBeInstanceOf(NotFoundException)
    await expect(svc.withdrawConsent('nope', 'anna')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('forbids a coach of the same club', async () => {
    const { svc } = service(world())
    await expect(
      svc.withdrawConsent('c-anna', 'coach', { note: 'Mutter hat per E-Mail widerrufen' }),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('M2: rejects a missing, short or junk admin note', async () => {
    const { svc } = service(world())
    await expect(svc.withdrawConsent('c-anna', 'admin')).rejects.toBeInstanceOf(BadRequestException)
    await expect(svc.withdrawConsent('c-anna', 'admin', { note: 'kurz' })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    await expect(
      svc.withdrawConsent('c-anna', 'admin', { note: 'xxxxxxxxxxxx' }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('M2/L5: admin withdrawal keeps the note in the audit metadata and shows in /consent/mine', async () => {
    const prisma = world()
    const { svc, events } = service(prisma)
    const note = 'Schriftlicher Widerruf der Mutter per E-Mail vom 24.09.'
    await svc.withdrawConsent('c-anna', 'admin', { note })

    expect(prisma.tables.auditLog[0].metadata).toEqual(expect.objectContaining({ note }))
    expect(events.emit).toHaveBeenCalledWith(
      CONSENT_WITHDRAWN_EVENT,
      expect.objectContaining({
        effects: [expect.objectContaining({ reason: 'admin_on_guardian_request', note })],
      }),
    )
    const mine = await svc.listForGuardian({ id: 'anna', email: 'anna@example.com' })
    expect(mine).toEqual([
      expect.objectContaining({ status: 'WITHDRAWN', withdrawnBy: 'club_admin', withdrawalNote: note }),
    ])
  })

  it('rejects a never-approved consent and is idempotent on a withdrawn one', async () => {
    const prisma = world()
    prisma.tables.parentalConsent[0].status = 'PENDING'
    const { svc, events } = service(prisma)
    await expect(svc.withdrawConsent('c-anna', 'anna')).rejects.toBeInstanceOf(ConflictException)
    prisma.tables.parentalConsent[0].status = 'WITHDRAWN'
    await expect(svc.withdrawConsent('c-anna', 'anna')).resolves.toEqual(
      expect.objectContaining({ status: 'WITHDRAWN' }),
    )
    expect(events.emit).not.toHaveBeenCalled()
  })
})

describe('ConsentService re-admission after withdrawal (H4, M3)', () => {
  async function withdrawn() {
    const prisma = world()
    const { svc } = service(prisma)
    await svc.withdrawConsent('c-anna', 'anna')
    return prisma
  }

  it('H4: a request to a DIFFERENT guardian reopens the REVOKED access as PENDING; approval re-admits', async () => {
    const prisma = await withdrawn()
    const { svc, push } = service(prisma)

    const consent = await svc.createConsentRequest({
      clubId: 'albatros',
      teamId: 'u15',
      playerUserId: 'tim',
      guardianEmail: 'Marc@Example.com',
      requestedByUserId: 'coach',
    })
    expect(consent.status).toBe('PENDING')
    expect(consent.guardianEmail).toBe('marc@example.com')
    expect(prisma.tables.teamAccess.find((a) => a.id === 'a-tim')?.status).toBe('PENDING')
    // M3: the guardian is told (push; email is best-effort without Resend).
    expect(push.sendToUserLocalized).toHaveBeenCalledWith(
      'marc',
      'CONSENT_REQUESTED',
      expect.objectContaining({ childName: 'Tim Weber', teamName: 'U15' }),
      expect.anything(),
    )

    // H5: Marc has no DOB but declared 16+.
    await svc.approveConsent(consent.id, 'marc')
    expect(prisma.tables.teamAccess.find((a) => a.id === 'a-tim')?.status).toBe('ACTIVE')
  })

  it('H4: approving a consent that was already pending flips REVOKED-by-withdrawal back to ACTIVE', async () => {
    const prisma = await withdrawn()
    prisma.tables.parentalConsent.push({
      id: 'c-marc',
      clubId: 'albatros',
      teamId: 'u15',
      playerUserId: 'tim',
      guardianEmail: 'marc@example.com',
      guardianUserId: null,
      status: 'PENDING',
    })
    const { svc } = service(prisma)
    await svc.approveConsent('c-marc', 'marc')
    expect(prisma.tables.teamAccess.find((a) => a.id === 'a-tim')?.status).toBe('ACTIVE')
    expect(prisma.locks.some((l) => l.includes('albatros:u15:tim:player-access'))).toBe(true)
  })

  it('does not re-admit a child a coach removed (REVOKED without a withdrawal)', async () => {
    const prisma = world({
      parentalConsent: [],
      teamAccess: [{ id: 'a-tim', clubId: 'albatros', teamId: 'u15', userId: 'tim', role: 'PLAYER', status: 'REVOKED' }],
    })
    const { svc } = service(prisma)
    await expect(
      svc.createConsentRequest({ clubId: 'albatros', teamId: 'u15', playerUserId: 'tim', guardianEmail: 'marc@example.com' }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('same guardian re-request reopens the withdrawn row', async () => {
    const prisma = await withdrawn()
    const { svc } = service(prisma)
    const consent = await svc.createConsentRequest({
      clubId: 'albatros',
      teamId: 'u15',
      playerUserId: 'tim',
      guardianEmail: 'anna@example.com',
    })
    expect(consent.id).toBe('c-anna')
    expect(consent.status).toBe('PENDING')
    expect(consent.withdrawnAt).toBeNull()
  })

  it('M3: rejects the player, the requester and club staff as guardian', async () => {
    const prisma = await withdrawn()
    const { svc } = service(prisma)
    const req = (guardianEmail: string, requestedByUserId?: string) =>
      svc.createConsentRequest({ clubId: 'albatros', teamId: 'u15', playerUserId: 'tim', guardianEmail, requestedByUserId })
    await expect(req('tim@example.com')).rejects.toBeInstanceOf(BadRequestException)
    await expect(req('COACH@albatros.de', 'coach')).rejects.toBeInstanceOf(BadRequestException)
    await expect(req('admin@albatros.de')).rejects.toBeInstanceOf(BadRequestException)
  })

  it('still refuses a duplicate request while the consent is live', async () => {
    const { svc } = service(world())
    await expect(
      svc.createConsentRequest({ clubId: 'albatros', teamId: 'u15', playerUserId: 'tim', guardianEmail: 'anna@example.com' }),
    ).rejects.toBeInstanceOf(ConflictException)
  })
})

describe('ConsentService guardian checks (H5, L3)', () => {
  it('H5: a guardian with an under-16 DOB is refused even with a declaration', async () => {
    const prisma = world({
      parentalConsent: [
        { id: 'c-teen', clubId: 'albatros', teamId: 'u15', playerUserId: 'tim', guardianEmail: 'teen@example.com', guardianUserId: null, status: 'PENDING' },
      ],
    })
    prisma.tables.user.find((u) => u.id === 'teen-parent')!.adultConfirmedAt = new Date()
    const { svc } = service(prisma)
    await expect(svc.approveConsent('c-teen', 'teen-parent')).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('B2: a guardian needs a DOB showing 18+ (no declaration, no 17-year-old)', async () => {
    const prisma = world({
      parentalConsent: [
        { id: 'c-decl', clubId: 'albatros', teamId: 'u15', playerUserId: 'tim', guardianEmail: 'declared@example.com', guardianUserId: null, status: 'PENDING' },
        { id: 'c-17', clubId: 'albatros', teamId: 'u14', playerUserId: 'tim', guardianEmail: 'seventeen@example.com', guardianUserId: null, status: 'PENDING' },
      ],
    })
    const { svc } = service(prisma)
    await expect(svc.approveConsent('c-decl', 'declared')).rejects.toBeInstanceOf(ForbiddenException)
    await expect(svc.approveConsent('c-17', 'seventeen')).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('L3: pending requests are found for a mixed-case account email', async () => {
    const prisma = world({
      parentalConsent: [
        { id: 'c-marc', clubId: 'albatros', teamId: 'u15', playerUserId: 'tim', guardianEmail: 'marc@example.com', guardianUserId: null, status: 'PENDING', createdAt: new Date() },
      ],
    })
    const { svc } = service(prisma)
    await expect(svc.getPendingForGuardian('Marc@Example.COM')).resolves.toEqual([
      expect.objectContaining({ id: 'c-marc' }),
    ])
  })
})

describe('withoutPlayer', () => {
  it('returns null when the child is not in the lineup', () => {
    expect(withoutPlayer({ formation: '4-4-2', starters: [{ userId: 'x' }], bench: [] }, 'tim')).toBeNull()
  })
})
