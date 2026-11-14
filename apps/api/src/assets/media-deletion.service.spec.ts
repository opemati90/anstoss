import { MediaDeletionService, queueMediaDeletion } from './media-deletion.service'

function setup(enabled = true) {
  const jobs = {
    findMany: jest
      .fn()
      .mockResolvedValue([{ id: 'job-1', objectKey: 'users/u-1/clip', attempts: 0 }]),
    findFirst: jest.fn().mockResolvedValue({ id: 'job-1', objectKey: 'users/u-1/clip' }),
    count: jest.fn().mockResolvedValue(0),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    createMany: jest.fn().mockResolvedValue({ count: 1 }),
  }
  const r2 = { enabled, deleteObjects: jest.fn().mockResolvedValue(undefined) }
  const tx = { mediaDeletionJob: jobs, $executeRaw: jest.fn().mockResolvedValue(0) }
  const service = new MediaDeletionService({ ...tx, $transaction: (fn: (db: typeof tx) => unknown) => fn(tx) } as never, r2 as never)
  return { jobs, r2, service }
}

describe('durable media erasure', () => {
  it('deduplicates keys and waits out ten-minute upload URLs', async () => {
    const { jobs } = setup()
    const before = Date.now()
    await queueMediaDeletion({ mediaDeletionJob: jobs } as never, ['key', 'key'])
    expect(jobs.createMany).toHaveBeenCalledWith({
      data: [{ objectKey: 'key', nextAttemptAt: expect.any(Date) }],
      skipDuplicates: true,
    })
    expect(jobs.createMany.mock.calls[0][0].data[0].nextAttemptAt.getTime()).toBeGreaterThanOrEqual(
      before + 15 * 60_000,
    )
  })

  it('erases the stored file before deleting the job and its identifying key', async () => {
    const { jobs, r2, service } = setup()
    await service.tick()
    expect(r2.deleteObjects).toHaveBeenCalledWith(['users/u-1/clip'])
    expect(jobs.deleteMany).toHaveBeenCalledWith({ where: { id: 'job-1' } })
    expect(r2.deleteObjects.mock.invocationCallOrder[0]).toBeLessThan(
      jobs.deleteMany.mock.invocationCallOrder[0],
    )
  })

  it('keeps a failed job for retry rather than reporting erasure success', async () => {
    const { jobs, r2, service } = setup()
    r2.deleteObjects.mockRejectedValue(new Error('unavailable'))
    await service.tick()
    expect(jobs.deleteMany).not.toHaveBeenCalled()
    expect(jobs.updateMany).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: { attempts: { increment: 1 }, nextAttemptAt: expect.any(Date) },
    })
  })

  it('does not drop jobs when storage is unconfigured', async () => {
    const { jobs, r2, service } = setup(false)
    await service.tick()
    expect(r2.deleteObjects).not.toHaveBeenCalled()
    expect(jobs.deleteMany).not.toHaveBeenCalled()
    expect(jobs.count).toHaveBeenCalled()
  })

  it('never deletes an upload whose lease was cancelled by an attachment', async () => {
    const { jobs, r2, service } = setup()
    jobs.findFirst.mockResolvedValue(null as never)
    await service.tick()
    expect(r2.deleteObjects).not.toHaveBeenCalled()
  })
})
