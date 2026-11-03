import { cancelAccountPrivateUploads, findAccountPrivateUploads, PrivateUploadAccountErasureError } from './private-upload-account-erasure'
import { getClubId, tenantContext } from '../prisma/tenant.context'
import { PrismaClient } from '@prisma/client'
import { createTenantMiddleware } from '../prisma/tenant.middleware'

describe('private uploads during account erasure', () => {
  const ownerId = 'owner'
  function setup() {
    const rows: any[] = [
      { id: 'a', clubId: 'former-club', ownerId, targetId: 'conversation', targetType: 'DM',
        messageId: 'z-message', state: 'ATTACHED', cancelRequestedAt: null, uploadId: 'session', operationId: null },
      { id: 'b', clubId: 'current-club', ownerId, targetId: 'channel', targetType: 'CHANNEL',
        messageId: 'a-message', state: 'ATTACHED', cancelRequestedAt: null, uploadId: 'session', operationId: null },
      { id: 'c', clubId: 'deleted-club', ownerId, targetId: 'channel', targetType: 'CHANNEL',
        messageId: null, state: 'INITIATING', cancelRequestedAt: null, uploadId: null, operationId: 'pending-initiation' },
      { id: 'd', clubId: 'former-club', ownerId, targetId: 'conversation', targetType: 'DM',
        messageId: null, state: 'RESERVED', cancelRequestedAt: null, uploadId: null, operationId: null },
    ]
    const contexts: Array<{ action: string; clubId: string | undefined }> = []
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      privateMediaUpload: {
        findMany: jest.fn(async () => { contexts.push({ action: 'discover', clubId: getClubId() }); return rows.filter((row) => row.state !== 'REMOVED').map((row) => ({ ...row })) }),
        findFirst: jest.fn(async ({ where }: any) => {
          contexts.push({ action: 'snapshot', clubId: getClubId() })
          return rows.find((row) => row.id === where.id && row.clubId === where.clubId && row.ownerId === where.ownerId) ?? null
        }),
        updateMany: jest.fn(async ({ where, data }: any) => {
          contexts.push({ action: 'cancel', clubId: getClubId() })
          const row = rows.find((candidate) => candidate.id === where.id && candidate.clubId === where.clubId && candidate.ownerId === where.ownerId)
          if (!row) return { count: 0 }
          Object.assign(row, data)
          return { count: 1 }
        }),
      },
    }
    return { tx, rows, contexts, client: tx as never }
  }

  it('discovers every owner intent outside ambient tenant scope, then restores it', async () => {
    const { client, tx, contexts } = setup()
    await tenantContext.run({ clubId: 'current-club', userId: ownerId }, async () => {
      const found = await findAccountPrivateUploads(client, ownerId)
      expect(found).toHaveLength(4)
      expect(getClubId()).toBe('current-club')
    })
    expect(contexts).toEqual([{ action: 'discover', clubId: undefined }])
    expect(tx.privateMediaUpload.findMany).toHaveBeenCalledWith({ where: { ownerId, state: { not: 'REMOVED' } }, select: {
      id: true, clubId: true, ownerId: true, targetId: true, targetType: true, messageId: true, objectKey: true,
    } })
  })

  it('executes a real lazy Prisma delegate outside the ambient tenant', async () => {
    // The terminal interceptor returns before provider/engine I/O. Unlike an
    // async mock delegate, this exercises PrismaPromise execution timing.
    const prisma = new PrismaClient({
      datasourceUrl: 'postgresql://synthetic:synthetic@localhost:1/private_upload_test',
    })
    const executions: Array<{ clubId: string | undefined; where: unknown }> = []
    prisma.$use(createTenantMiddleware(getClubId) as never)
    prisma.$use(async (params) => {
      executions.push({ clubId: getClubId(), where: params.args?.where })
      return []
    })
    try {
      await tenantContext.run({ clubId: 'ambient-club', userId: ownerId }, async () => {
        await expect(findAccountPrivateUploads(prisma as never, ownerId)).resolves.toEqual([])
        expect(getClubId()).toBe('ambient-club')
      })
      expect(executions).toEqual([{ clubId: undefined, where: { ownerId, state: { not: 'REMOVED' } } }])
    } finally {
      await prisma.$disconnect()
    }
  })

  it('locks the merged sorted message set before any upload, cancelling only in exact tenant scopes', async () => {
    const { client, tx, rows, contexts } = setup()
    const found = await findAccountPrivateUploads(client, ownerId)
    await tenantContext.run({ clubId: 'unrelated-ambient-club', userId: ownerId }, async () => {
      await cancelAccountPrivateUploads(client, ownerId, found, ['dm-message:a-legacy', 'chat-message:a-message'])
      expect(getClubId()).toBe('unrelated-ambient-club')
    })
    const locks = tx.$executeRaw.mock.calls.map((call: any[]) => call[1])
    expect(locks.slice(0, 3)).toEqual(['chat-message:a-message', 'dm-message:a-legacy', 'dm-message:z-message'])
    expect(locks.slice(3).every((key: string) => key.startsWith('private-upload:'))).toBe(true)
    const cancellations = contexts.filter((entry) => entry.action === 'cancel')
    expect(cancellations.map((entry) => entry.clubId)).toEqual(['former-club', 'current-club', 'deleted-club', 'former-club'])
    expect(rows.every((row) => row.cancelRequestedAt instanceof Date)).toBe(true)
    expect(rows[2]).toMatchObject({ state: 'INITIATING', operationId: 'pending-initiation', uploadId: null })
    expect(rows[3].state).toBe('REMOVED')
    expect(rows[0].state).toBe('ATTACHED')
  })

  it.each(['INITIATING', 'UPLOADING', 'FINALIZING', 'READY', 'ATTACHED', 'ABORTING', 'ABORTED', 'REMOVING'])(
    'preserves %s provider state and tokens while requesting cancellation', async (state) => {
      const { client, rows } = setup()
      const cancelledAt = new Date('2026-10-27T12:00:00Z')
      Object.assign(rows[0], { state, operationId: 'pending-operation', cancelRequestedAt: cancelledAt })
      const found = await findAccountPrivateUploads(client, ownerId)
      await cancelAccountPrivateUploads(client, ownerId, found, [])
      expect(rows[0]).toMatchObject({ state, operationId: 'pending-operation', uploadId: 'session', cancelRequestedAt: cancelledAt })
    },
  )

  it('leaves a terminal removed upload unchanged', async () => {
    const { client, tx, rows } = setup()
    rows.splice(1)
    rows[0].state = 'REMOVED'
    const found = await findAccountPrivateUploads(client, ownerId)
    expect(found).toEqual([])
    await cancelAccountPrivateUploads(client, ownerId, found, [])
    expect(tx.$executeRaw).not.toHaveBeenCalled()
    expect(tx.privateMediaUpload.updateMany).not.toHaveBeenCalled()
  })

  it.each([{ ownerId: 'other' }, { clubId: '' }, { id: '' }, { targetId: '' }, { targetType: 'OTHER' }])(
    'fails closed on a malformed or foreign-owner inventory %j', async (change) => {
      const { client, rows, tx } = setup()
      Object.assign(rows[0], change)
      await expect(findAccountPrivateUploads(client, ownerId)).rejects.toThrow(PrivateUploadAccountErasureError)
      expect(tx.privateMediaUpload.updateMany).not.toHaveBeenCalled()
    },
  )

  it('rejects a foreign-owner row supplied directly to cancellation', async () => {
    const { client, rows, tx } = setup()
    await expect(cancelAccountPrivateUploads(client, 'another', rows, [])).rejects.toThrow(PrivateUploadAccountErasureError)
    expect(tx.$executeRaw).not.toHaveBeenCalled()
  })

  it('fails before cancellation if the bound message changed after inventory', async () => {
    const { client, tx, rows } = setup()
    const found = await findAccountPrivateUploads(client, ownerId)
    rows[0].messageId = 'new-unlocked-message'
    await expect(cancelAccountPrivateUploads(client, ownerId, found, [])).rejects.toThrow(PrivateUploadAccountErasureError)
    expect(tx.privateMediaUpload.updateMany).not.toHaveBeenCalled()
  })

  it('fails if an upload disappears after inventory', async () => {
    const { client, tx } = setup()
    const found = await findAccountPrivateUploads(client, ownerId)
    tx.privateMediaUpload.findFirst.mockResolvedValue(null)
    await expect(cancelAccountPrivateUploads(client, ownerId, found, [])).rejects.toThrow(PrivateUploadAccountErasureError)
  })

  it('requires a durable cancellation update rather than accepting zero updated rows', async () => {
    const { client, tx } = setup()
    const found = await findAccountPrivateUploads(client, ownerId)
    tx.privateMediaUpload.updateMany.mockResolvedValue({ count: 0 })
    await expect(cancelAccountPrivateUploads(client, ownerId, found, [])).rejects.toThrow(PrivateUploadAccountErasureError)
  })
})
