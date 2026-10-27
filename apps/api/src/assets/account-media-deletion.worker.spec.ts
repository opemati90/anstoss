import { AccountMediaDeletionWorker } from './account-media-deletion.worker'

describe('account media deletion outbox', () => {
  function setup() {
    const job = { objectKey: 'users/synthetic/avatar.png', attempts: 0, availableAt: new Date(0) }
    const queue = {
      findMany: jest.fn().mockResolvedValue([job]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    }
    const r2 = { deleteObjects: jest.fn().mockResolvedValue(undefined) }
    const prisma = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      $transaction: jest.fn(),
      accountMediaDeletion: queue,
      messageReport: { findFirst: jest.fn().mockResolvedValue(null) },
      directMessageReport: { findFirst: jest.fn().mockResolvedValue(null) },
      message: { findFirst: jest.fn().mockResolvedValue(null) },
      directMessage: { findFirst: jest.fn().mockResolvedValue(null) },
    }
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma))
    const worker = new AccountMediaDeletionWorker(prisma as never, r2 as never)
    return { job, queue, r2, prisma, worker }
  }

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('leases one object and acknowledges only after successful deletion', async () => {
    const { worker, queue, r2, job, prisma } = setup()
    await worker.runCycle()
    expect(queue.updateMany).toHaveBeenCalledWith({
      where: { objectKey: job.objectKey, attempts: 0, availableAt: job.availableAt },
      data: { attempts: { increment: 1 }, availableAt: expect.any(Date) },
    })
    expect(r2.deleteObjects).toHaveBeenCalledWith([job.objectKey])
    expect(queue.deleteMany).toHaveBeenCalledWith({
      where: { objectKey: job.objectKey, attempts: 1 },
    })
    expect(queue.deleteMany.mock.invocationCallOrder[0]).toBeGreaterThan(
      r2.deleteObjects.mock.invocationCallOrder[0],
    )
    expect(prisma.$executeRaw.mock.calls[0]).toContain(`media-object:${job.objectKey}`)
    expect(prisma.message.findFirst.mock.invocationCallOrder[0]).toBeGreaterThan(
      prisma.$executeRaw.mock.invocationCallOrder[0],
    )
    expect(r2.deleteObjects.mock.invocationCallOrder[0]).toBeGreaterThan(
      prisma.message.findFirst.mock.invocationCallOrder[0],
    )
  })

  it('does not process a job claimed by another replica', async () => {
    const { worker, queue, r2 } = setup()
    queue.updateMany.mockResolvedValue({ count: 0 })
    await worker.runCycle()
    expect(r2.deleteObjects).not.toHaveBeenCalled()
    expect(queue.deleteMany).not.toHaveBeenCalled()
  })

  it('retains failed work with bounded backoff and resumes in a new worker', async () => {
    const { worker, queue, r2, prisma, job } = setup()
    r2.deleteObjects.mockRejectedValueOnce(new Error('provider secret'))
    await worker.runCycle()
    expect(queue.deleteMany).not.toHaveBeenCalled()
    expect(queue.updateMany).toHaveBeenLastCalledWith({
      where: { objectKey: job.objectKey, attempts: 1 },
      data: { lastFailureAt: expect.any(Date), availableAt: expect.any(Date) },
    })
    expect(JSON.stringify(queue.updateMany.mock.calls)).not.toContain('provider secret')
    queue.findMany.mockResolvedValue([{ ...job, attempts: 1 }])
    await new AccountMediaDeletionWorker(prisma as never, r2 as never).runCycle()
    expect(queue.deleteMany).toHaveBeenCalledWith({
      where: { objectKey: job.objectKey, attempts: 2 },
    })
  })

  it('retries a successful storage deletion when database acknowledgment fails', async () => {
    const { worker, queue } = setup()
    queue.deleteMany.mockRejectedValueOnce(new Error('database unavailable'))
    await worker.runCycle()
    expect(queue.updateMany).toHaveBeenCalledTimes(2)
    expect(queue.updateMany.mock.calls[1][0].data.lastFailureAt).toBeInstanceOf(Date)
  })

  it('does not overlap cycles and releases its guard after failure', async () => {
    const { worker, queue } = setup()
    let reject!: (error: Error) => void
    queue.findMany.mockReturnValueOnce(
      new Promise((_resolve, rejectPromise) => {
        reject = rejectPromise
      }),
    )
    const first = worker.runCycle()
    await worker.runCycle()
    expect(queue.findMany).toHaveBeenCalledTimes(1)
    reject(new Error('database unavailable'))
    await first
    await worker.runCycle()
    expect(queue.findMany).toHaveBeenCalledTimes(2)
  })

  it('queries only due work with a bounded batch', async () => {
    const { worker, queue } = setup()
    await worker.runCycle()
    expect(queue.findMany).toHaveBeenCalledWith({
      where: { availableAt: { lte: expect.any(Date) } },
      orderBy: [{ availableAt: 'asc' }, { objectKey: 'asc' }],
      take: 50,
    })
  })

  it.each(['messageReport', 'directMessageReport', 'message', 'directMessage'] as const)(
    'holds %s references without deleting the source',
    async (model) => {
      const { worker, queue, r2, prisma } = setup()
      prisma[model].findFirst.mockResolvedValue({ id: 'report' })
      await worker.runCycle()
      expect(r2.deleteObjects).not.toHaveBeenCalled()
      expect(queue.deleteMany).not.toHaveBeenCalled()
    },
  )
})
