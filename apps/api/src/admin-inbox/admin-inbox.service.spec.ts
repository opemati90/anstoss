import { AdminInboxService } from './admin-inbox.service'

function daysFromNow(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

function createService(overrides: Record<string, unknown> = {}) {
  const prisma: any = {
    membership: {
      count: jest.fn().mockResolvedValue(126),
      findMany: jest.fn().mockResolvedValue([{ operationalRoles: ['SECRETARY'] }]),
      findUnique: jest.fn(),
    },
    team: {
      count: jest.fn().mockResolvedValue(8),
      findMany: jest.fn().mockResolvedValue([
        { id: 't-u11', name: 'U11', displayName: 'U11', group: { displayName: 'Jugend', sortOrder: 1 } },
      ]),
    },
    joinRequest: {
      count: jest.fn().mockResolvedValue(2),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'jr-1',
          revision: 1,
          role: 'PLAYER',
          message: null,
          createdAt: new Date('2026-09-20T10:00:00Z'),
          user: { id: 'u-1', name: 'Jonas Krüger', avatarUrl: null },
        },
      ]),
    },
    teamAccess: {
      findMany: jest.fn().mockResolvedValue([
        { userId: 'coach-a', user: { name: 'Mara Schulz' }, team: { name: 'U13', displayName: 'U13' } },
        { userId: 'coach-b', user: { name: 'Markus Hoffmann' }, team: { name: 'U15', displayName: 'U15' } },
        { userId: 'coach-c', user: { name: 'Sven Lange' }, team: { name: 'U9', displayName: 'U9' } },
        { userId: 'coach-d', user: { name: 'Olli Ok' }, team: { name: 'U9', displayName: 'U9' } },
      ]),
    },
    complianceRecord: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'fz-b', memberUserId: 'coach-b', expiresAt: daysFromNow(-3) },
        { id: 'fz-c', memberUserId: 'coach-c', expiresAt: daysFromNow(20) },
        { id: 'fz-d', memberUserId: 'coach-d', expiresAt: daysFromNow(900) },
      ]),
    },
    parentalConsent: { findFirst: jest.fn().mockResolvedValue(null) },
    ...overrides,
  }
  const contributions = {
    // Must never be used by the inbox: it upserts records on every call (M2).
    getOverview: jest.fn().mockRejectedValue(new Error('getOverview writes; inbox must not call it')),
    getOverdueSummary: jest.fn().mockResolvedValue({
      currency: 'eur',
      members: [
        { memberUserId: 'm2', name: 'B', outstanding: 3000, currency: 'eur', dueDate: '2026-07-01T12:00:00.000Z' },
        { memberUserId: 'm1', name: 'A', outstanding: 4000, currency: 'eur', dueDate: '2026-08-01T12:00:00.000Z' },
      ],
    }),
    getMemberContributionStatus: jest.fn().mockResolvedValue({
      status: 'OVERDUE',
      amount: 5000,
      currency: 'eur',
      dueDate: '2026-08-01T12:00:00.000Z',
      planName: 'Aktive',
    }),
  }
  const activation = {
    listClubRequests: jest.fn().mockResolvedValue([
      { id: 'c1', status: 'SUBMITTED', desiredRole: 'COACH', createdAt: new Date(), claimant: { id: 'x', name: 'Tim Weber', avatarUrl: null } },
      { id: 'c2', status: 'EXPIRED', desiredRole: 'ADMIN', createdAt: new Date(), claimant: { id: 'y', name: 'Old', avatarUrl: null } },
    ]),
  }
  const service = new AdminInboxService(prisma as never, contributions as never, activation as never)
  return { service, prisma, contributions, activation }
}

describe('AdminInboxService.getInbox', () => {
  it('builds every section and sums totalOpen', async () => {
    const { service } = createService()
    const inbox = await service.getInbox('club-1', 'admin-1')

    expect(inbox.memberCount).toBe(126)
    expect(inbox.teamCount).toBe(8)
    expect(inbox.joinRequests.count).toBe(2)
    expect(inbox.joinRequests.items[0]).toEqual(
      expect.objectContaining({ id: 'jr-1', revision: 1, user: expect.objectContaining({ name: 'Jonas Krüger' }) }),
    )
    expect(inbox.staffAccessRequests.count).toBe(1)
    expect(inbox.overdueDues).toEqual(
      expect.objectContaining({ count: 2, amount: 7000, currency: 'eur' }),
    )
    // Oldest due date first.
    expect(inbox.overdueDues.items[0].memberUserId).toBe('m2')
    expect(inbox.teamsWithoutHeadCoach.items[0]).toEqual({
      teamId: 't-u11',
      teamName: 'U11',
      groupName: 'Jugend',
    })
    expect(inbox.unfilledOffices.items).toEqual([{ office: 'TREASURER' }])
    expect(inbox.totalOpen).toBe(2 + 1 + 2 + 1 + 0 + 1)
  })

  it('reads dues without the writing overview (no upserts on load)', async () => {
    const { service, contributions } = createService()
    await service.getInbox('club-1', 'admin-1')
    expect(contributions.getOverdueSummary).toHaveBeenCalledWith('club-1', 'admin-1')
    expect(contributions.getOverview).not.toHaveBeenCalled()
  })

  it('does not expose Führungszeugnis status in the launch inbox', async () => {
    const { service, prisma } = createService()
    const inbox = await service.getInbox('club-1', 'admin-1')
    expect(inbox.safeguarding).toEqual({ count: 0, items: [] })
    expect(prisma.complianceRecord.findMany).not.toHaveBeenCalled()
  })

  it('does not query youth-staff compliance data while disabled', async () => {
    const { service, prisma } = createService()
    await service.getInbox('club-1', 'admin-1')
    expect(prisma.teamAccess.findMany).not.toHaveBeenCalled()
  })

  it('tolerates a failing section without failing the inbox', async () => {
    const { service, contributions, activation } = createService()
    contributions.getOverdueSummary.mockRejectedValueOnce(new Error('billing down'))
    activation.listClubRequests.mockRejectedValueOnce(new Error('boom'))
    const inbox = await service.getInbox('club-1', 'admin-1')
    expect(inbox.overdueDues).toEqual({ count: 0, items: [], amount: 0, currency: 'eur' })
    expect(inbox.staffAccessRequests).toEqual({ count: 0, items: [] })
    expect(inbox.joinRequests.count).toBe(2)
    expect(inbox.totalOpen).toBe(2 + 1 + 0 + 1)
  })

  it('reports both offices when nobody holds them', async () => {
    const { service, prisma } = createService()
    prisma.membership.findMany.mockResolvedValueOnce([])
    const inbox = await service.getInbox('club-1', 'admin-1')
    expect(inbox.unfilledOffices.items).toEqual([{ office: 'TREASURER' }, { office: 'SECRETARY' }])
  })
})

describe('AdminInboxService.getMemberSummary', () => {
  it('combines teams and dues without disabled compliance records', async () => {
    const { service, prisma } = createService()
    prisma.membership.findUnique.mockResolvedValueOnce({
      role: 'COACH',
      operationalRoles: [],
      user: { id: 'coach-a', name: 'Mara Schulz', email: 'm@x.de', avatarUrl: null, dateOfBirth: null },
    })
    prisma.teamAccess.findMany.mockResolvedValueOnce([
      { teamId: 't-u13', role: 'HEAD_COACH', team: { name: 'U13', displayName: 'U13', group: { type: 'YOUTH' } } },
    ])
    prisma.complianceRecord.findMany.mockResolvedValueOnce([
      { id: 'sepa-1', kind: 'SEPA_MANDATE', issuedAt: new Date('2025-01-01T00:00:00Z'), expiresAt: null },
    ])
    const summary = await service.getMemberSummary('club-1', 'admin-1', 'coach-a')
    expect(summary.teams).toEqual([{ teamId: 't-u13', teamName: 'U13', role: 'HEAD_COACH' }])
    expect(summary.isYouth).toBe(false)
    expect(summary.sepaMandate).toBeNull()
    expect(summary.dataConsent).toBeNull()
    expect(summary.safeguarding).toBeNull()
    expect(prisma.complianceRecord.findMany).not.toHaveBeenCalled()
    expect(summary.contribution).toEqual(expect.objectContaining({ status: 'OVERDUE' }))
  })

  it('looks up one member read-only and hides dues the actor cannot see', async () => {
    const { service, prisma, contributions } = createService()
    prisma.membership.findUnique.mockResolvedValue({
      role: 'PLAYER',
      operationalRoles: [],
      user: { id: 'm1', name: 'A', email: null, avatarUrl: null, dateOfBirth: null },
    })
    prisma.teamAccess.findMany.mockResolvedValue([])
    await service.getMemberSummary('club-1', 'admin-1', 'm1')
    expect(contributions.getMemberContributionStatus).toHaveBeenCalledWith('club-1', 'admin-1', 'm1')
    expect(contributions.getOverview).not.toHaveBeenCalled()

    contributions.getMemberContributionStatus.mockRejectedValueOnce(new Error('403'))
    const summary = await service.getMemberSummary('club-1', 'admin-1', 'm1')
    expect(summary.contribution).toBeNull()
  })

  it('returns null safeguarding for non-staff and 404s for strangers', async () => {
    const { service, prisma } = createService()
    prisma.membership.findUnique.mockResolvedValueOnce({
      role: 'PLAYER',
      operationalRoles: [],
      user: { id: 'm1', name: 'A', email: null, avatarUrl: null, dateOfBirth: null },
    })
    prisma.teamAccess.findMany.mockResolvedValueOnce([])
    prisma.complianceRecord.findMany.mockResolvedValueOnce([])
    prisma.parentalConsent.findFirst.mockResolvedValueOnce({ approvedAt: new Date('2026-01-01T00:00:00Z') })
    const summary = await service.getMemberSummary('club-1', 'admin-1', 'm1')
    expect(summary.safeguarding).toBeNull()
    expect(summary.contribution).toEqual(expect.objectContaining({ status: 'OVERDUE', amount: 5000 }))
    expect(summary.dataConsent).toEqual({ issuedAt: '2026-01-01T00:00:00.000Z', source: 'PARENTAL_CONSENT' })

    prisma.membership.findUnique.mockResolvedValueOnce(null)
    await expect(service.getMemberSummary('club-1', 'admin-1', 'nobody')).rejects.toThrow('Member not found')
  })
})
