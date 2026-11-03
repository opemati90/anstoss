import { AccountMediaDeletionWorker } from './account-media-deletion.worker'
import { newOwnedPrivateV1Key } from '../media/private-v1-owner'
import { PRIVATE_V1_PAUSED_UNTIL } from '../media/private-v1-reservations'

describe('account media deletion outbox', () => {
  function setup() {
    const job = { objectKey: 'users/synthetic/avatar.png', attempts: 0, availableAt: new Date(0), uploadState: null }
    const queue = {
      findMany: jest.fn().mockResolvedValue([job]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    }
    queue.findUnique.mockImplementation(async () => {
      const claim = [...queue.updateMany.mock.calls].reverse().find((call: any[]) => call[0].data.attempts)
      return { attempts: claim[0].where.attempts + 1, availableAt: claim[0].data.availableAt, uploadState: null }
    })
    const r2 = { deleteObjects: jest.fn().mockResolvedValue(undefined) }
    const prisma = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      $transaction: jest.fn(),
      accountMediaDeletion: queue,
      messageReport: { findFirst: jest.fn().mockResolvedValue(null) },
      directMessageReport: { findFirst: jest.fn().mockResolvedValue(null) },
      message: { findFirst: jest.fn().mockResolvedValue(null) },
      directMessage: { findFirst: jest.fn().mockResolvedValue(null) },
      freeAgentMedia: { findFirst: jest.fn().mockResolvedValue(null) },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
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
      where: { objectKey: job.objectKey, uploadState: null, attempts: 0, availableAt: job.availableAt },
      data: { attempts: { increment: 1 }, availableAt: expect.any(Date) },
    })
    expect(r2.deleteObjects).toHaveBeenCalledWith([job.objectKey])
    expect(queue.deleteMany).toHaveBeenCalledWith({
      where: { objectKey: job.objectKey, attempts: 1, availableAt: expect.any(Date), uploadState: null },
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
      where: { objectKey: job.objectKey, attempts: 1, availableAt: expect.any(Date), uploadState: null },
      data: { lastFailureAt: expect.any(Date), availableAt: expect.any(Date) },
    })
    expect(JSON.stringify(queue.updateMany.mock.calls)).not.toContain('provider secret')
    queue.findMany.mockResolvedValue([{ ...job, attempts: 1 }])
    await new AccountMediaDeletionWorker(prisma as never, r2 as never).runCycle()
    expect(queue.deleteMany).toHaveBeenCalledWith({
      where: { objectKey: job.objectKey, attempts: 2, availableAt: expect.any(Date), uploadState: null },
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
    expect(queue.findMany).toHaveBeenCalledTimes(3)
  })

  it('queries only due work with a bounded batch', async () => {
    const { worker, queue } = setup()
    await worker.runCycle()
    expect(queue.findMany).toHaveBeenCalledWith({
      where: { OR: [
        { uploadState: null, availableAt: { lte: expect.any(Date) } },
        { uploadState: 'PENDING', uploadExpiresAt: { lte: expect.any(Date) }, availableAt: { lte: expect.any(Date) } },
      ] },
      orderBy: [{ availableAt: 'asc' }, { objectKey: 'asc' }],
      take: 40,
    })
    expect(queue.findMany).toHaveBeenCalledWith({
      where: { uploadState: 'PENDING', uploadExpiresAt: { lte: expect.any(Date) }, availableAt: PRIVATE_V1_PAUSED_UNTIL },
      orderBy: [{ uploadExpiresAt: 'asc' }, { objectKey: 'asc' }], take: 10,
    })
  })

  it('does not query pending reservations while bridge cleanup is disabled', async () => {
    const { worker, queue } = setup()
    process.env.PRIVATE_V1_UPLOAD_RESERVATIONS = 'false'
    try {
      await worker.runCycle()
      expect(queue.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
        OR: [{ uploadState: null, availableAt: { lte: expect.any(Date) } }],
      } }))
    } finally { process.env.PRIVATE_V1_UPLOAD_RESERVATIONS = 'true' }
  })

  it('services a paused reservation even when the ordinary due batch is full', async () => {
    const { worker, queue, prisma, r2 } = setup()
    const pausedKey = 'chat/synthetic/target/image/private-v1-synthetic'
    const ordinary = Array.from({ length: 40 }, (_, i) => ({ objectKey: `users/synthetic/${i}`,
      attempts: 0, availableAt: new Date(0), uploadState: null }))
    const paused = { objectKey: pausedKey, attempts: 0, availableAt: PRIVATE_V1_PAUSED_UNTIL, uploadState: 'PENDING' }
    queue.findMany.mockImplementation(async (args: any) => args.where.uploadState === 'PENDING' ? [paused] : ordinary)
    queue.findUnique.mockImplementation(async ({ where }: any) => {
      const claim = [...queue.updateMany.mock.calls].reverse().find((call: any[]) => call[0].where.objectKey === where.objectKey)
      return { attempts: 1, availableAt: claim[0].data.availableAt,
        uploadState: where.objectKey === pausedKey ? 'PENDING' : null,
        uploadExpiresAt: new Date(0), uploadOwnerId: 'synthetic' }
    })
    Object.assign(prisma, { $queryRaw: jest.fn().mockResolvedValue([{ now: new Date() }]) })
    await worker.runCycle()
    expect(r2.deleteObjects).toHaveBeenCalledWith([pausedKey])
    expect(r2.deleteObjects).toHaveBeenCalledTimes(41)
  })

  it.each([null, { attempts: 2, uploadState: null }, { attempts: 1, uploadState: 'PENDING' },
    { attempts: 1, uploadState: null, availableAt: new Date(0) }])(
    'does not delete when the claimed job changes while waiting for the object lock',
    async (current) => {
      const { worker, queue, r2 } = setup()
      queue.findUnique.mockResolvedValue(current)
      await worker.runCycle()
      expect(r2.deleteObjects).not.toHaveBeenCalled()
      expect(queue.deleteMany).not.toHaveBeenCalled()
    },
  )

  it.each([true, false])('checks database time before cleaning a pending upload (expired=%s)', async (expired) => {
    const { worker, queue, r2, job, prisma } = setup()
    const dbNow = new Date('2026-01-01T12:00:00Z')
    const uploadExpiresAt = new Date(dbNow.getTime() + (expired ? -1000 : 1000))
    queue.findMany.mockResolvedValue([{ ...job, uploadState: 'PENDING', uploadExpiresAt }])
    queue.findUnique.mockImplementation(async () => ({ attempts: 1, uploadState: 'PENDING', uploadExpiresAt, uploadOwnerId: 'owner',
      availableAt: queue.updateMany.mock.calls[0][0].data.availableAt }))
    Object.assign(prisma, { $queryRaw: jest.fn().mockResolvedValue([{ now: dbNow }]) })
    await worker.runCycle()
    if (expired) expect(r2.deleteObjects).toHaveBeenCalledWith([job.objectKey])
    else expect(r2.deleteObjects).not.toHaveBeenCalled()
  })

  it.each(['chat', 'dm'] as const)('adopts a sender-bound live %s message left by an older replica', async (type) => {
    const { worker, queue, r2, prisma } = setup()
    const objectKey = newOwnedPrivateV1Key({ targetType: type, clubId: 'club', targetId: 'target',
      ownerId: 'owner', kind: 'image' }, 'photo.png')
    const uploadExpiresAt = new Date(0)
    queue.findMany.mockResolvedValue([{ objectKey, attempts: 0, availableAt: new Date(0), uploadState: 'PENDING' }])
    queue.findUnique.mockImplementation(async () => ({ attempts: 1, uploadState: 'PENDING', uploadExpiresAt,
      uploadOwnerId: 'owner', availableAt: queue.updateMany.mock.calls[0][0].data.availableAt }))
    Object.assign(prisma, { $queryRaw: jest.fn().mockResolvedValue([{ now: new Date() }]) })
    if (type === 'chat') prisma.message.findFirst.mockResolvedValueOnce({ clubId: 'club', teamId: 'target', messageType: 'IMAGE' })
    else prisma.directMessage.findFirst.mockResolvedValueOnce({ conversationId: 'target', conversation: { clubId: 'club' }, messageType: 'IMAGE' })
    await worker.runCycle()
    expect(r2.deleteObjects).not.toHaveBeenCalled()
    expect(queue.deleteMany).toHaveBeenCalledWith({ where: expect.objectContaining({ objectKey, uploadState: 'PENDING', uploadOwnerId: 'owner' }) })
    expect(prisma[type === 'chat' ? 'message' : 'directMessage'].findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { attachmentUrl: `https://private-media.anstoss.invalid/${objectKey}`, senderId: 'owner', deletedAt: null },
    }))
  })

  it.each(['messageReport', 'directMessageReport', 'message', 'directMessage', 'freeAgentMedia', 'user'] as const)(
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
