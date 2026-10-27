import { Prisma } from '@prisma/client'
import { PrivateUploadLedger } from './private-upload-ledger'
import { tenantContext } from '../prisma/tenant.context'

describe('private upload durable state transitions', () => {
  const ledger = new PrivateUploadLedger()
  const scope = { id: 'upload', clubId: 'club', ownerId: 'owner' }
  let row: any
  let tx: Prisma.TransactionClient
  beforeEach(() => {
    row = {
      ...scope,
      state: 'RESERVED',
      operationId: null,
      uploadId: null,
      cancelRequestedAt: null,
      expiresAt: new Date(Date.now() + 600_000),
    }
    tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      privateMediaUpload: {
        findFirst: jest.fn(async ({ where }) =>
          Object.entries(where).every(([k, v]) => row[k] === v) ? { ...row } : null,
        ),
        updateMany: jest.fn(async ({ where, data }) => {
          if (!Object.entries(where).every(([k, v]) => row[k] === v)) return { count: 0 }
          row = { ...row, ...data }
          return { count: 1 }
        }),
        create: jest.fn(async ({ data }) => data),
      },
    } as unknown as Prisma.TransactionClient
  })

  it('reserves an opaque provider key before any storage call', async () => {
    const created = await ledger.reserve(tx, {
      clubId: 'club',
      ownerId: 'owner',
      targetId: 'team',
      targetType: 'CHANNEL',
      contentType: 'image/png',
      expectedBytes: 42,
    })
    expect(created.objectKey).toBe(`private-chat/v2/${created.id}`)
    expect(created.objectKey).not.toContain('club')
    expect(created.expiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('does not pass runtime-injected lifecycle fields into reservation', async () => {
    await ledger.reserve(tx, {
      clubId: 'club',
      ownerId: 'owner',
      targetId: 'team',
      targetType: 'CHANNEL',
      contentType: 'image/png',
      expectedBytes: 42,
      state: 'READY',
      uploadId: 'injected',
      operationId: 'injected',
      messageId: 'injected',
    } as Parameters<PrivateUploadLedger['reserve']>[1])
    const data = (tx.privateMediaUpload.create as jest.Mock).mock.calls[0][0].data
    for (const field of ['state', 'uploadId', 'operationId', 'messageId'])
      expect(data).not.toHaveProperty(field)
  })

  it('rejects contradictory tenant context before reading or writing', async () => {
    await tenantContext.run({ clubId: 'other', userId: 'owner' }, async () => {
      await expect(ledger.begin(tx, scope, 'initiate')).rejects.toThrow('tenant mismatch')
      await expect(
        ledger.reserve(tx, {
          clubId: 'club',
          ownerId: 'owner',
          targetId: 'team',
          targetType: 'CHANNEL',
          contentType: 'image/png',
          expectedBytes: 42,
        }),
      ).rejects.toThrow('tenant mismatch')
    })
    expect(tx.privateMediaUpload.findFirst).not.toHaveBeenCalled()
    expect(tx.privateMediaUpload.create).not.toHaveBeenCalled()
  })

  it('rejects a returned foreign row even if middleware rewrites the query', async () => {
    ;(tx.privateMediaUpload.findFirst as jest.Mock).mockResolvedValue({ ...row, clubId: 'foreign' })
    expect(await ledger.begin(tx, scope, 'initiate')).toBeNull()
    expect(tx.privateMediaUpload.updateMany).not.toHaveBeenCalled()
  })

  it('allows exactly one initiation claim and requires the matching receipt', async () => {
    const claim = await ledger.begin(tx, scope, 'initiate')
    expect(claim?.state).toBe('INITIATING')
    expect(await ledger.begin(tx, scope, 'initiate')).toBeNull()
    expect(await ledger.settle(tx, scope, 'initiate', 'wrong', 'provider-id')).toBe(false)
    expect(await ledger.settle(tx, scope, 'initiate', claim!.operationId, 'provider-id')).toBe(true)
    expect(row.state).toBe('UPLOADING')
    expect(row.uploadId).toBe('provider-id')
  })

  it('never steals an expired operation whose external outcome is unknown', async () => {
    const claim = await ledger.begin(tx, scope, 'initiate')
    row.expiresAt = new Date(0)
    expect(await ledger.begin(tx, scope, 'initiate')).toBeNull()
    await ledger.cancel(tx, scope)
    expect(row.state).toBe('INITIATING')
    expect(row.operationId).toBe(claim!.operationId)
    expect(await ledger.begin(tx, scope, 'abort')).toBeNull()
  })

  it('preserves cancellation during initiation and permits abort, never completion', async () => {
    const claim = await ledger.begin(tx, scope, 'initiate')
    await ledger.cancel(tx, scope)
    await ledger.settle(tx, scope, 'initiate', claim!.operationId, 'provider-id')
    expect(await ledger.begin(tx, scope, 'complete')).toBeNull()
    const abort = await ledger.begin(tx, scope, 'abort')
    expect(abort?.state).toBe('ABORTING')
    expect(await ledger.settle(tx, scope, 'abort', abort!.operationId)).toBe(true)
    expect(row.state).toBe('REMOVED')
  })

  it('does not abort while completion is in flight; removes after a definitive completion', async () => {
    row.state = 'UPLOADING'
    row.uploadId = 'provider-id'
    const claim = await ledger.begin(tx, scope, 'complete')
    await ledger.cancel(tx, scope)
    expect(await ledger.begin(tx, scope, 'abort')).toBeNull()
    await ledger.settle(tx, scope, 'complete', claim!.operationId)
    expect(await ledger.attach(tx, scope, 'message')).toBe(false)
    const removal = await ledger.begin(tx, scope, 'remove')
    expect(removal?.state).toBe('REMOVING')
    await ledger.settle(tx, scope, 'remove', removal!.operationId)
    expect(row.state).toBe('REMOVED')
  })

  it('does not expire an attached live message but permits explicit cancellation', async () => {
    row.state = 'READY'
    row.uploadId = 'provider-id'
    expect(await ledger.attach(tx, scope, 'message')).toBe(true)
    row.expiresAt = new Date(0)
    expect(await ledger.begin(tx, scope, 'remove')).toBeNull()
    expect(await ledger.attach(tx, scope, 'another')).toBe(false)
    await ledger.cancel(tx, scope)
    expect((await ledger.begin(tx, scope, 'remove'))?.state).toBe('REMOVING')
  })

  it.each(['clubId', 'ownerId', 'id'])(
    'rejects a mismatching %s scope for every operation',
    async (field) => {
      const wrong = { ...scope, [field]: 'other' }
      expect(await ledger.begin(tx, wrong, 'initiate')).toBeNull()
      expect(await ledger.cancel(tx, wrong)).toBe(false)
      expect(await ledger.attach(tx, wrong, 'message')).toBe(false)
      expect(await ledger.settle(tx, wrong, 'initiate', 'token', 'provider')).toBe(false)
      expect(tx.privateMediaUpload.updateMany).not.toHaveBeenCalled()
    },
  )

  it('cancels a never-started intent without creating a storage operation', async () => {
    await ledger.cancel(tx, scope)
    expect(row.state).toBe('REMOVED')
    expect(await ledger.begin(tx, scope, 'initiate')).toBeNull()
  })

  it('does not mark initiation successful without a provider upload ID', async () => {
    const claim = await ledger.begin(tx, scope, 'initiate')
    await expect(ledger.settle(tx, scope, 'initiate', claim!.operationId)).rejects.toThrow(
      'upload ID',
    )
    expect(row.state).toBe('INITIATING')
  })
})
