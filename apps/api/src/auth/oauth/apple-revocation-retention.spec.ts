import type { PrismaService } from '../../prisma/prisma.service'
import { APPLE_REVOCATION_MARKER } from './apple-session'
import { pruneUnusedAppleRevocations } from './apple-revocation-retention'

describe('Apple revocation marker retention', () => {
  const now = new Date('2026-11-16T12:00:00Z')
  function setup() {
    const db = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      socialIdentity: { findUnique: jest.fn().mockResolvedValue(null) },
      authIdentityTombstone: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    }
    const prisma = {
      ...db,
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'marker', subjectHash: 'hashed-subject' }]),
      $transaction: jest.fn(async (fn: (tx: typeof db) => unknown) => fn(db)),
    }
    return { db, prisma: prisma as unknown as PrismaService }
  }
  it('retains a marker if an identity was linked after candidate selection', async () => {
    const { db, prisma } = setup()
    db.socialIdentity.findUnique.mockResolvedValue({ id: 'newly-linked' })
    await expect(pruneUnusedAppleRevocations(prisma, now)).resolves.toBe(0)
    expect(db.authIdentityTombstone.deleteMany).not.toHaveBeenCalled()
  })
  it('deletes only the old candidate in the dedicated marker namespace', async () => {
    const { db, prisma } = setup()
    await expect(pruneUnusedAppleRevocations(prisma, now)).resolves.toBe(1)
    expect(db.authIdentityTombstone.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'marker',
        provider: APPLE_REVOCATION_MARKER,
        createdAt: { lte: new Date('2026-10-17T12:00:00Z') },
      },
    })
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      db.socialIdentity.findUnique.mock.invocationCallOrder[0],
    )
  })
  it('does not claim deletion if a newer notification refreshed the marker', async () => {
    const { db, prisma } = setup()
    db.authIdentityTombstone.deleteMany.mockResolvedValue({ count: 0 })
    await expect(pruneUnusedAppleRevocations(prisma, now)).resolves.toBe(0)
  })
  it('leaves state intact when the post-lock ownership check fails', async () => {
    const { db, prisma } = setup()
    db.socialIdentity.findUnique.mockRejectedValue(new Error('offline'))
    await expect(pruneUnusedAppleRevocations(prisma, now)).rejects.toThrow('offline')
    expect(db.authIdentityTombstone.deleteMany).not.toHaveBeenCalled()
  })
})
