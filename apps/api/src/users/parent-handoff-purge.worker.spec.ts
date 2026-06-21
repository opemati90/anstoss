import { ParentHandoffPurgeWorker } from './parent-handoff-purge.worker'

describe('ParentHandoffPurgeWorker', () => {
  function createWorker() {
    const prisma = {
      parentHandoff: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    }
    const worker = new ParentHandoffPurgeWorker(prisma as never)
    return { prisma, worker }
  }

  it('deletes expired-unredeemed rows and redeemed rows past the audit window', async () => {
    const { prisma, worker } = createWorker()
    prisma.parentHandoff.deleteMany.mockResolvedValue({ count: 2 })

    await worker.runCycle()

    expect(prisma.parentHandoff.deleteMany).toHaveBeenCalledTimes(1)
    const arg = prisma.parentHandoff.deleteMany.mock.calls[0][0]
    expect(arg.where.OR).toEqual([
      expect.objectContaining({ status: { not: 'REDEEMED' }, expiresAt: expect.objectContaining({ lt: expect.any(Date) }) }),
      expect.objectContaining({ status: 'REDEEMED', redeemedAt: expect.objectContaining({ lt: expect.any(Date) }) }),
    ])
  })

  it('swallows DB errors so a failed purge never crashes the worker', async () => {
    const { prisma, worker } = createWorker()
    prisma.parentHandoff.deleteMany.mockRejectedValue(new Error('db down'))
    await expect(worker.runCycle()).resolves.toBeUndefined()
  })
})
