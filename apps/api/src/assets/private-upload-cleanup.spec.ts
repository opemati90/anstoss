import { PrivateUploadCleanup } from './private-upload-cleanup'

describe('private upload cleanup executor', () => {
  const scope = { id: 'upload', clubId: 'club', ownerId: 'owner' }
  let row: any
  let tx: any
  let ledger: any
  let storage: any
  let cleanup: PrivateUploadCleanup
  let inTransaction: boolean
  beforeEach(() => {
    row = { state: 'READY', cancelRequestedAt: new Date(), expiresAt: new Date(0),
      objectKey: 'key', uploadId: 'session', operationId: null, expectedBytes: 42, contentType: 'image/png' }
    tx = {}
    inTransaction = false
    ledger = {
      snapshot: jest.fn(async () => row ? { ...row } : null),
      cancel: jest.fn(async () => { row.cancelRequestedAt = new Date(); if (row.state === 'RESERVED') row.state = 'REMOVED'; return true }),
      begin: jest.fn(async (_tx, _scope, operation) => {
        row.state = operation === 'abort' ? 'ABORTING' : 'REMOVING'
        row.operationId = 'claim'
        return { ...row }
      }),
      settle: jest.fn().mockResolvedValue(true),
    }
    storage = {
      abort: jest.fn(async () => { expect(inTransaction).toBe(false) }),
      remove: jest.fn(async () => { expect(inTransaction).toBe(false) }),
      discover: jest.fn(), observeObject: jest.fn(), observeMultipart: jest.fn(),
    }
    cleanup = new PrivateUploadCleanup({ $transaction: async (fn: any) => {
      inTransaction = true
      try { return await fn(tx) } finally { inTransaction = false }
    } } as never, storage, ledger)
  })

  it('removes only after the guarded removal claim commits', async () => {
    await expect(cleanup.run(scope)).resolves.toBe('removed')
    expect(ledger.begin).toHaveBeenCalledWith(tx, scope, 'remove')
    expect(storage.remove).toHaveBeenCalledWith('key')
    expect(ledger.settle).toHaveBeenCalledWith(tx, scope, 'remove', 'claim')
  })

  it('aborts multipart upload without claiming part-byte erasure', async () => {
    row.state = 'UPLOADING'
    await expect(cleanup.run(scope)).resolves.toBe('aborted')
    expect(storage.abort).toHaveBeenCalledWith('key', 'session')
    expect(ledger.settle).toHaveBeenCalledWith(tx, scope, 'abort', 'claim')
    expect(storage.remove).not.toHaveBeenCalled()
  })

  it('expires an unstarted reservation without provider I/O', async () => {
    Object.assign(row, { state: 'RESERVED', cancelRequestedAt: null })
    await expect(cleanup.run(scope)).resolves.toBe('removed')
    expect(ledger.cancel).toHaveBeenCalledWith(tx, scope)
    expect(ledger.begin).not.toHaveBeenCalled()
    expect(storage.remove).not.toHaveBeenCalled()
  })

  it('does not start provider cleanup when recording expiry cancellation fails', async () => {
    Object.assign(row, { state: 'UPLOADING', cancelRequestedAt: null })
    ledger.cancel.mockResolvedValue(false)
    await expect(cleanup.run(scope)).rejects.toThrow('cancellation was not recorded')
    expect(ledger.begin).not.toHaveBeenCalled()
    expect(storage.abort).not.toHaveBeenCalled()
    expect(storage.remove).not.toHaveBeenCalled()
  })

  it.each(['RESERVED', 'UPLOADING', 'READY', 'ATTACHED'])('leaves uncancelled active %s alone', async (state) => {
    Object.assign(row, { state, cancelRequestedAt: null, expiresAt: new Date(Date.now() + 60_000) })
    await expect(cleanup.run(scope)).resolves.toBe('unchanged')
    expect(ledger.cancel).not.toHaveBeenCalled()
    expect(ledger.begin).not.toHaveBeenCalled()
  })

  it('never expires published attachments', async () => {
    Object.assign(row, { state: 'ATTACHED', cancelRequestedAt: null })
    await expect(cleanup.run(scope)).resolves.toBe('unchanged')
    expect(ledger.cancel).not.toHaveBeenCalled()
  })

  it('honors a live-message/evidence hold or lost removal race', async () => {
    ledger.begin.mockResolvedValue(null)
    await expect(cleanup.run(scope)).resolves.toBe('held')
    expect(storage.remove).not.toHaveBeenCalled()
  })

  it('retains unknown removal without retrying or settling', async () => {
    storage.remove.mockRejectedValue(new Error('provider timeout'))
    await expect(cleanup.run(scope)).resolves.toBe('unknown')
    expect(storage.remove).toHaveBeenCalledTimes(1)
    expect(ledger.settle).not.toHaveBeenCalled()
    storage.observeObject.mockResolvedValue({ kind: 'present' })
    await expect(cleanup.run(scope)).resolves.toBe('unknown')
    expect(storage.remove).toHaveBeenCalledTimes(1)
  })

  it('reconciles confirmed absence after pending removal without another delete', async () => {
    Object.assign(row, { state: 'REMOVING', operationId: 'old-claim' })
    storage.observeObject.mockResolvedValue({ kind: 'not_observed' })
    await expect(cleanup.run(scope)).resolves.toBe('reconciled')
    expect(ledger.settle).toHaveBeenCalledWith(tx, scope, 'remove', 'old-claim')
    expect(storage.remove).not.toHaveBeenCalled()
  })

  it('keeps ABORTED capacity charged without retrying or trusting absence observations', async () => {
    row.state = 'ABORTED'
    storage.observeMultipart.mockResolvedValue({ kind: 'not_observed' })
    storage.observeObject.mockResolvedValue({ kind: 'not_observed' })
    await expect(cleanup.run(scope)).resolves.toBe('awaiting-part-cleanup')
    expect(storage.observeMultipart).not.toHaveBeenCalled()
    expect(storage.observeObject).not.toHaveBeenCalled()
    expect(storage.abort).not.toHaveBeenCalled()
    expect(ledger.begin).not.toHaveBeenCalled()
    expect(storage.remove).not.toHaveBeenCalled()
  })

  it('reconciles a pending first abort when the session is absent', async () => {
    Object.assign(row, { state: 'ABORTING', operationId: 'pending-abort' })
    storage.observeMultipart.mockResolvedValue({ kind: 'not_observed' })
    await expect(cleanup.run(scope)).resolves.toBe('reconciled')
    expect(storage.abort).not.toHaveBeenCalled()
    expect(ledger.settle).toHaveBeenCalledWith(tx, scope, 'abort', 'pending-abort')
  })

  it('leaves a pending abort unresolved while its session is still present', async () => {
    Object.assign(row, { state: 'ABORTING', operationId: 'pending-abort' })
    storage.observeMultipart.mockResolvedValue({ kind: 'present', hasParts: true })
    await expect(cleanup.run(scope)).resolves.toBe('unknown')
    expect(storage.abort).not.toHaveBeenCalled()
    expect(ledger.settle).not.toHaveBeenCalled()
  })
})
