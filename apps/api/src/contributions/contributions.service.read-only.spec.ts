import { ContributionCadence } from '@prisma/client'
import { ContributionsService } from './contributions.service'

// club-admin review fixes (M2): the admin inbox and member sheet read dues
// on every focus; these views must never write (no upserts, no settings row).
describe('ContributionsService read-only views', () => {
  const plan = {
    id: 'plan-1',
    name: 'Aktive',
    amount: 6000,
    currency: 'eur',
    cadence: ContributionCadence.YEARLY,
    dueDay: 1,
    dueMonth: 1,
    graceDays: 0,
    active: true,
  }
  const assignment = (memberUserId: string, name: string) => ({
    id: `as-${memberUserId}`,
    clubId: 'club-1',
    planId: 'plan-1',
    memberUserId,
    amountOverride: null,
    startDate: new Date('2024-01-01T00:00:00Z'),
    plan,
    member: { id: memberUserId, name },
  })

  function createService(records: any[] = []) {
    const prisma: any = {
      membership: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER', operationalRoles: [] }) },
      clubContributionSettings: {
        findUnique: jest.fn().mockResolvedValue({ defaultCurrency: 'eur' }),
        upsert: jest.fn(),
      },
      contributionAssignment: {
        findMany: jest.fn().mockResolvedValue([assignment('m1', 'Tim Weber'), assignment('m2', 'Lukas Hoffmann')]),
      },
      contributionRecord: {
        findMany: jest.fn().mockResolvedValue(records),
        upsert: jest.fn(),
      },
    }
    const service = new ContributionsService(prisma, {} as never, {} as never, {} as never)
    return { service, prisma }
  }

  it('derives overdue members without writing anything', async () => {
    const periodStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1))
    const { service, prisma } = createService([
      {
        id: 'rec-m2',
        assignmentId: 'as-m2',
        periodStart,
        dueDate: new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1, 12)),
        amount: 6000,
        currency: 'eur',
        status: 'PAID',
        paidAmount: 6000,
      },
    ])
    const summary = await service.getOverdueSummary('club-1', 'admin-1')
    // m1 has no record yet: synthesized PENDING, past due (1 Jan) → overdue.
    expect(summary.members.map((m) => m.memberUserId)).toEqual(['m1'])
    expect(summary.members[0]).toEqual(expect.objectContaining({ name: 'Tim Weber', outstanding: 6000 }))
    expect(prisma.contributionRecord.upsert).not.toHaveBeenCalled()
    expect(prisma.clubContributionSettings.upsert).not.toHaveBeenCalled()
    expect(prisma.contributionRecord.findMany).toHaveBeenCalledTimes(1)
  })

  it('looks up a single member with one query and no writes', async () => {
    const { service, prisma } = createService()
    prisma.contributionAssignment.findMany.mockResolvedValueOnce([assignment('m1', 'Tim Weber')])
    const row = await service.getMemberContributionStatus('club-1', 'admin-1', 'm1')
    expect(row).toEqual(expect.objectContaining({ status: 'OVERDUE', amount: 6000, planName: 'Aktive' }))
    expect(prisma.contributionAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ memberUserId: { in: ['m1'] } }) }),
    )
    expect(prisma.contributionRecord.upsert).not.toHaveBeenCalled()
  })

  it('returns null for a member without a plan', async () => {
    const { service, prisma } = createService()
    prisma.contributionAssignment.findMany.mockResolvedValueOnce([])
    await expect(service.getMemberContributionStatus('club-1', 'admin-1', 'm9')).resolves.toBeNull()
  })

  it('still requires billing access', async () => {
    const { service, prisma } = createService()
    prisma.membership.findUnique.mockResolvedValueOnce({ role: 'PLAYER', operationalRoles: [] })
    await expect(service.getOverdueSummary('club-1', 'player-1')).rejects.toThrow('billing')
  })
})
