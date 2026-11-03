import { PrivateUploadCleanupBatch } from './private-upload-cleanup-batch'
import { getClubId, tenantContext } from '../prisma/tenant.context'

describe('private upload cleanup scheduling', () => {
  let db: any
  let cleanup: any
  let batch: PrivateUploadCleanupBatch
  const job = { id: 'intent', clubId: 'club', ownerId: 'owner', cleanupAvailableAt: new Date(0), cleanupClaimId: null }
  beforeEach(() => {
    db = { privateMediaUpload: {
      findMany: jest.fn().mockResolvedValue([job]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    } }
    cleanup = { run: jest.fn(async () => { expect(getClubId()).toBe('club'); return 'removed' }) }
    batch = new PrivateUploadCleanupBatch(db, cleanup)
  })

  it('selects a bounded eligible batch and scopes every claim and reschedule', async () => {
    await expect(batch.run('club')).resolves.toEqual({ selected: 1, outcomes: { removed: 1 } })
    expect(db.privateMediaUpload.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 25,
      where: expect.objectContaining({ clubId: 'club', state: { not: 'REMOVED' },
        OR: [{ cancelRequestedAt: { not: null } }, { state: { not: 'ATTACHED' }, expiresAt: { lte: expect.any(Date) } }] }) }))
    const [claim, finish] = db.privateMediaUpload.updateMany.mock.calls.map(([arg]: any[]) => arg)
    expect(claim.where).toEqual({ ...job })
    expect(finish.where).toEqual({ id: job.id, clubId: 'club', ownerId: 'owner', cleanupClaimId: claim.data.cleanupClaimId })
    expect(finish.data.cleanupClaimId).toBeNull()
    expect(getClubId()).toBeUndefined()
  })

  it('does not execute work claimed by another replica', async () => {
    db.privateMediaUpload.updateMany.mockResolvedValue({ count: 0 })
    await expect(batch.run('club')).resolves.toEqual({ selected: 1, outcomes: {} })
    expect(cleanup.run).not.toHaveBeenCalled()
  })

  it('stops before the next job when shutdown occurs during cleanup', async () => {
    let active = true
    db.privateMediaUpload.findMany.mockResolvedValue([job, { ...job, id: 'second' }])
    cleanup.run.mockImplementation(async () => { active = false; return 'removed' })
    await expect(batch.run('club', () => active)).resolves.toEqual({ selected: 2, outcomes: { removed: 1 } })
    expect(cleanup.run).toHaveBeenCalledTimes(1)
    expect(db.privateMediaUpload.updateMany).toHaveBeenCalledTimes(2)
  })

  it('does not start cleanup if stopped while acquiring the scheduling claim', async () => {
    let active = true
    db.privateMediaUpload.updateMany.mockImplementation(async () => { active = false; return { count: 1 } })
    await batch.run('club', () => active)
    expect(cleanup.run).not.toHaveBeenCalled()
    expect(db.privateMediaUpload.updateMany).toHaveBeenCalledTimes(1)
  })

  it.each([['unknown', 15], ['held', 60], ['conflict', 60], ['awaiting-part-cleanup', 360]])('delays %s retries without losing the record', async (result, minutes) => {
    cleanup.run.mockResolvedValue(result)
    const start = Date.now()
    await batch.run('club')
    const final = db.privateMediaUpload.updateMany.mock.calls[1][0]
    expect(final.data.cleanupAvailableAt.getTime()).toBeGreaterThanOrEqual(start + Number(minutes) * 60_000)
  })

  it('reschedules opaque failures and continues the batch', async () => {
    db.privateMediaUpload.findMany.mockResolvedValue([job, { ...job, id: 'second' }])
    cleanup.run.mockRejectedValueOnce(new Error('sensitive provider error'))
    await expect(batch.run('club')).resolves.toEqual({ selected: 2, outcomes: { unknown: 1, removed: 1 } })
  })

  it('rejects contradictory tenant context before database access', async () => {
    await tenantContext.run({ clubId: 'other', userId: 'staff' }, async () => {
      await expect(batch.run('club')).rejects.toThrow('tenant mismatch')
    })
    expect(db.privateMediaUpload.findMany).not.toHaveBeenCalled()
  })
})
