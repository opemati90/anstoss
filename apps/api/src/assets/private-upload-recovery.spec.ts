import { PrivateUploadRecovery } from './private-upload-recovery'
import { PrivateUploadLedger } from './private-upload-ledger'

describe('private upload ambiguous outcome recovery', () => {
  const scope = { id: 'intent', clubId: 'club', ownerId: 'user' }
  let row: any
  let storage: { discover: jest.Mock; observeObject: jest.Mock }
  let recovery: PrivateUploadRecovery
  let tx: any
  beforeEach(() => {
    row = {
      ...scope,
      objectKey: 'private-chat/v2/opaque',
      operationId: 'operation',
      state: 'INITIATING',
      expectedBytes: 42,
      contentType: 'image/png',
      cancelRequestedAt: null,
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
      },
    }
    storage = { discover: jest.fn(), observeObject: jest.fn() }
    recovery = new PrivateUploadRecovery(
      { $transaction: async (fn: any) => fn(tx) } as never,
      storage,
      new PrivateUploadLedger(),
    )
  })

  it('recovers exactly one observed initiation and keeps cancellation', async () => {
    row.cancelRequestedAt = new Date()
    storage.discover.mockResolvedValue({ uploadIds: ['provider'], truncated: false })
    expect(await recovery.reconcile(scope)).toBe('settled')
    expect(row.state).toBe('UPLOADING')
    expect(row.uploadId).toBe('provider')
    expect(row.cancelRequestedAt).not.toBeNull()
  })

  it.each([
    [{ uploadIds: [], truncated: false }, 'unknown'],
    [{ uploadIds: ['one'], truncated: true }, 'unknown'],
    [{ uploadIds: ['one', 'two'], truncated: false }, 'conflict'],
  ])('does not settle ambiguous discovery %j', async (found, outcome) => {
    storage.discover.mockResolvedValue(found)
    expect(await recovery.reconcile(scope)).toBe(outcome)
    expect(tx.privateMediaUpload.updateMany).not.toHaveBeenCalled()
  })

  it('settles a positively observed completion without clearing cancellation', async () => {
    row.state = 'FINALIZING'
    row.cancelRequestedAt = new Date()
    storage.observeObject.mockResolvedValue({
      kind: 'present',
      bytes: 42,
      contentType: 'image/png',
      etag: 'etag',
    })
    expect(await recovery.reconcile(scope)).toBe('settled')
    expect(row.state).toBe('READY')
    expect(row.cancelRequestedAt).not.toBeNull()
  })

  it.each([
    [{ kind: 'not_observed' }, 'unknown'],
    [{ kind: 'present', bytes: 41, contentType: 'image/png', etag: 'e' }, 'conflict'],
    [{ kind: 'present', bytes: 42, contentType: 'text/plain', etag: 'e' }, 'conflict'],
  ])('leaves completion pending for %j', async (observed, outcome) => {
    row.state = 'FINALIZING'
    storage.observeObject.mockResolvedValue(observed)
    expect(await recovery.reconcile(scope)).toBe(outcome)
    expect(row.state).toBe('FINALIZING')
    expect(tx.privateMediaUpload.updateMany).not.toHaveBeenCalled()
  })

  it('does not overwrite a newer state when provider observation is late', async () => {
    storage.discover.mockImplementation(async () => {
      row.state = 'ABORTING'
      row.operationId = 'new-operation'
      return { uploadIds: ['provider'], truncated: false }
    })
    expect(await recovery.reconcile(scope)).toBe('unchanged')
    expect(row.state).toBe('ABORTING')
    expect(row.operationId).toBe('new-operation')
  })

  it('rejects foreign scope before calling storage', async () => {
    expect(await recovery.reconcile({ ...scope, ownerId: 'other' })).toBe('unchanged')
    expect(storage.discover).not.toHaveBeenCalled()
  })

  it('propagates provider failures without marking the operation terminal', async () => {
    storage.discover.mockRejectedValue(new Error('unavailable'))
    await expect(recovery.reconcile(scope)).rejects.toThrow('unavailable')
    expect(row.state).toBe('INITIATING')
    expect(tx.privateMediaUpload.updateMany).not.toHaveBeenCalled()
  })
})
