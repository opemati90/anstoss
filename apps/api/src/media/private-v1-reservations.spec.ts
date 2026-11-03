import { consumePrivateV1Upload, reservePrivateV1Upload, PRIVATE_V1_PAUSED_UNTIL } from './private-v1-reservations'

describe('private v1 reservations', () => {
  const now = new Date('2026-01-01T12:00:00Z')
  function setup() {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      $queryRaw: jest.fn().mockResolvedValue([{ now }]),
      user: { findUnique: jest.fn().mockResolvedValue({ deletedAt: null }) },
      accountMediaDeletion: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const prisma = { $transaction: jest.fn(async (callback) => callback(tx)) }
    return { tx, prisma }
  }

  it('stores the cleanup obligation with a bounded expiry before returning', async () => {
    const { tx, prisma } = setup()
    const expiresAt = await reservePrivateV1Upload(prisma as never, 'owner', 'chat/key', { type: 'image' })
    expect(expiresAt).toEqual(new Date(now.getTime() + 15 * 60_000))
    expect(tx.accountMediaDeletion.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      objectKey: 'chat/key', uploadOwnerId: 'owner', uploadState: 'PENDING',
      uploadExpiresAt: expiresAt, availableAt: expiresAt,
    }) })
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.accountMediaDeletion.create.mock.invocationCallOrder[0])
  })

  it('records reservations with cleanup paused until the bridge rollout is enabled', async () => {
    const { tx, prisma } = setup()
    process.env.PRIVATE_V1_UPLOAD_RESERVATIONS = 'false'
    try {
      await expect(reservePrivateV1Upload(prisma as never, 'owner', 'chat/key', {})).resolves.toBeInstanceOf(Date)
      expect(tx.accountMediaDeletion.create).toHaveBeenCalledWith({ data: expect.objectContaining({
        uploadState: 'PENDING', availableAt: PRIVATE_V1_PAUSED_UNTIL,
      }) })
    } finally { process.env.PRIVATE_V1_UPLOAD_RESERVATIONS = 'true' }
  })

  it('refuses deleted users and limits abandoned upload reservations', async () => {
    const { tx, prisma } = setup()
    tx.user.findUnique.mockResolvedValueOnce({ deletedAt: now })
    await expect(reservePrivateV1Upload(prisma as never, 'owner', 'chat/key', {})).rejects.toThrow('Account unavailable')
    tx.accountMediaDeletion.count.mockResolvedValueOnce(10)
    await expect(reservePrivateV1Upload(prisma as never, 'owner', 'chat/key', {})).rejects.toThrow('Too many pending uploads')
    expect(tx.accountMediaDeletion.create).not.toHaveBeenCalled()
  })

  it('consumes only the matching owner and unexpired pending reservation', async () => {
    const { tx } = setup()
    await consumePrivateV1Upload(tx as never, 'owner', 'chat/key')
    expect(tx.accountMediaDeletion.deleteMany).toHaveBeenCalledWith({ where: {
      objectKey: 'chat/key', uploadOwnerId: 'owner', uploadState: 'PENDING', uploadExpiresAt: { gt: now },
    } })
    tx.accountMediaDeletion.deleteMany.mockResolvedValueOnce({ count: 0 })
    await expect(consumePrivateV1Upload(tx as never, 'other', 'chat/key')).rejects.toThrow('expired')
  })
})
