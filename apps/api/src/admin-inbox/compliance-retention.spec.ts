import { ComplianceRetentionWorker, deleteMemberComplianceData } from './compliance-retention'

const DAY = 24 * 60 * 60 * 1000

describe('deleteMemberComplianceData', () => {
  it('deletes the member records and reminders of that club only', async () => {
    const tx = {
      complianceRecord: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
      complianceReminder: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    }
    await deleteMemberComplianceData(tx, 'club-1', 'u-1')
    expect(tx.complianceRecord.deleteMany).toHaveBeenCalledWith({ where: { clubId: 'club-1', memberUserId: 'u-1' } })
    expect(tx.complianceReminder.deleteMany).toHaveBeenCalledWith({ where: { clubId: 'club-1', memberUserId: 'u-1' } })
  })
})

describe('ComplianceRetentionWorker.sweep', () => {
  const now = new Date('2026-09-24T03:00:00Z')

  function createWorker(options: {
    records: Array<{ id: string; memberUserId: string; kind: string; updatedAt: Date }>
    members: string[]
    youthCoachesNow?: string[]
    coachAccess?: Array<{ userId: string; updatedAt: Date }>
  }) {
    const prisma: any = {
      club: { findMany: jest.fn().mockResolvedValue([{ id: 'club-1' }]) },
      complianceRecord: {
        findMany: jest.fn().mockResolvedValue(options.records),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      complianceReminder: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      membership: {
        findMany: jest.fn().mockResolvedValue(options.members.map((userId) => ({ userId }))),
      },
      teamAccess: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce((options.youthCoachesNow ?? []).map((userId) => ({ userId })))
          .mockResolvedValueOnce(options.coachAccess ?? []),
      },
    }
    return { worker: new ComplianceRetentionWorker(prisma as never), prisma }
  }

  it('deletes records of people without a membership (left via another path)', async () => {
    const { worker, prisma } = createWorker({
      records: [
        { id: 'r-gone', memberUserId: 'gone', kind: 'SPIELERPASS', updatedAt: now },
        { id: 'r-here', memberUserId: 'here', kind: 'SPIELERPASS', updatedAt: now },
      ],
      members: ['here'],
    })
    const result = await worker.sweep(now)
    expect(result).toEqual({ orphaned: 1, expiredActivity: 0 })
    expect(prisma.complianceRecord.deleteMany).toHaveBeenCalledWith({
      where: { clubId: 'club-1', id: { in: ['r-gone'] } },
    })
  })

  it('deletes a Führungszeugnis 90 days after the youth coaching ended', async () => {
    const { worker, prisma } = createWorker({
      records: [
        { id: 'fz-old', memberUserId: 'ex-coach', kind: 'FUEHRUNGSZEUGNIS', updatedAt: new Date(now.getTime() - 400 * DAY) },
        { id: 'fz-recent', memberUserId: 'recent', kind: 'FUEHRUNGSZEUGNIS', updatedAt: new Date(now.getTime() - 400 * DAY) },
        { id: 'fz-active', memberUserId: 'coach', kind: 'FUEHRUNGSZEUGNIS', updatedAt: new Date(now.getTime() - 400 * DAY) },
        { id: 'fz-new', memberUserId: 'onboarding', kind: 'FUEHRUNGSZEUGNIS', updatedAt: new Date(now.getTime() - 10 * DAY) },
      ],
      members: ['ex-coach', 'recent', 'coach', 'onboarding'],
      youthCoachesNow: ['coach'],
      coachAccess: [
        { userId: 'ex-coach', updatedAt: new Date(now.getTime() - 91 * DAY) },
        { userId: 'recent', updatedAt: new Date(now.getTime() - 30 * DAY) },
        { userId: 'coach', updatedAt: new Date(now.getTime() - 500 * DAY) },
      ],
    })
    const result = await worker.sweep(now)
    expect(result).toEqual({ orphaned: 0, expiredActivity: 1 })
    expect(prisma.complianceRecord.deleteMany).toHaveBeenCalledWith({
      where: { clubId: 'club-1', id: { in: ['fz-old'] } },
    })
  })

  it('keeps non-Führungszeugnis documents of current members', async () => {
    const { worker, prisma } = createWorker({
      records: [{ id: 'sepa', memberUserId: 'm', kind: 'SEPA_MANDATE', updatedAt: new Date(0) }],
      members: ['m'],
    })
    await worker.sweep(now)
    expect(prisma.complianceRecord.deleteMany).not.toHaveBeenCalled()
  })

  it('drops reminder rows once their 24h cooldown has passed', async () => {
    const { worker, prisma } = createWorker({ records: [], members: [] })
    await worker.sweep(now)
    expect(prisma.complianceReminder.deleteMany).toHaveBeenCalledWith({
      where: { clubId: 'club-1', sentAt: { lt: new Date(now.getTime() - DAY) } },
    })
  })
})
