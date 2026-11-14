import { BankImportRetentionWorker } from './bank-import-retention.worker'
import { PrismaService } from '../prisma/prisma.service'
import { tenantContext } from '../prisma/tenant.context'

describe('BankImportRetentionWorker', () => {
  it('executes lazy Prisma queries within each club context without leaking it', async () => {
    const scopes: Array<string | undefined> = []
    const updateMany = jest.fn(() => ({
      then(resolve: (value: { count: number }) => void) {
        scopes.push(tenantContext.getStore()?.clubId)
        resolve({ count: 1 })
      },
    }))
    const prisma = {
      club: { findMany: jest.fn().mockResolvedValue([{ id: 'club-a' }, { id: 'club-b' }]) },
      bankImportBatch: { updateMany },
    } as unknown as PrismaService
    const now = new Date('2026-11-14T20:00:00Z')
    await expect(new BankImportRetentionWorker(prisma).purgeExpired(now)).resolves.toEqual({ count: 2 })
    expect(scopes).toEqual(['club-a', 'club-b'])
    expect(tenantContext.getStore()).toBeUndefined()
    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: { clubId: 'club-a', rawExpiresAt: { lte: now }, rawObjectKey: { not: null }, rawPurgedAt: null },
      data: { rawObjectKey: null, rawPurgedAt: now },
    })
  })
})
