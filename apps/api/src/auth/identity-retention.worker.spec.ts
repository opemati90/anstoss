import { IdentityRetentionWorker } from './identity-retention.worker'

it('removes only expired known identity markers, including their user links', async () => {
  const deleteMany = jest.fn().mockResolvedValue({ count: 2 })
  const worker = new IdentityRetentionWorker({ authIdentityTombstone: { deleteMany } } as never)
  expect(await worker.sweep(new Date('2026-11-14T12:00:00Z'))).toEqual({ count: 2 })
  expect(deleteMany).toHaveBeenCalledWith({ where: {
    provider: { in: ['clerk', 'email-underage'] },
    createdAt: { lte: new Date('2026-10-15T12:00:00Z') },
  } })
})
