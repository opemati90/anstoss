import { ContributionsService } from './contributions.service'

// Regression: ISSUE-006 — a member could forge canonical PAID dues without verification
// Found by /qa on 2026-08-21
// Report: .gstack/qa-reports/qa-report-anstoss-launch-2026-08-21.md
describe('ContributionsService member payment reports', () => {
  it('never emits the confirmed-payment notification for a member report', async () => {
    const prisma = {
      membership: { findUnique: jest.fn().mockResolvedValue({ role: 'PLAYER' }) },
      contributionAssignment: {
        findFirst: jest.fn().mockResolvedValue({
          clubId: 'club-1',
          planId: 'plan-1',
          memberUserId: 'member-1',
          plan: { name: 'Dues' },
          member: { id: 'member-1', name: 'Member' },
        }),
      },
      contributionRecord: { update: jest.fn().mockResolvedValue({}) },
    }
    const push = { sendToUserLocalized: jest.fn() }
    const audit = { log: jest.fn() }
    const service = new ContributionsService(
      prisma as never,
      audit as never,
      push as never,
      {} as never,
    )
    jest.spyOn(service as never, 'ensureCurrentRecords').mockResolvedValue([
      {
        assignment: {},
        record: {
          id: 'record-1',
          status: 'PENDING',
          amount: 2500,
          currency: 'eur',
          periodStart: new Date(),
          note: null,
        },
      },
    ] as never)
    jest.spyOn(service, 'getMyContributions').mockResolvedValue({ items: [] } as never)

    await service.markOwnAsPaid('club-1', 'member-1', 'plan-1')

    expect(prisma.contributionRecord.update).toHaveBeenCalledWith({
      where: { id: 'record-1' },
      data: {
        status: 'PARTIAL',
        paidAmount: 0,
        paidAt: null,
        note: 'PAYMENT_REPORTED_BY_MEMBER',
      },
    })
    expect(push.sendToUserLocalized).not.toHaveBeenCalled()
  })
})
