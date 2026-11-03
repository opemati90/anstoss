import { PrivateUploadCoordinator } from './private-upload-coordinator'

describe('private upload coordinator', () => {
  const scope = { id: 'upload', clubId: 'club', ownerId: 'owner' }
  const requestId = '2f36b5df-8364-4e6f-a082-0f0272819351'
  let tx: any
  let prisma: any
  let ledger: any
  let storage: any
  let authorize: jest.Mock
  let coordinator: PrivateUploadCoordinator
  let committed: boolean
  beforeEach(() => {
    committed = false
    tx = { user: { findUnique: jest.fn().mockResolvedValue({ deletedAt: null }) } }
    prisma = { $transaction: jest.fn(async (fn) => {
      const value = await fn(tx)
      committed = true
      return value
    }) }
    ledger = {
      reserve: jest.fn().mockResolvedValue({ id: 'new-upload', expiresAt: new Date('2026-10-27T12:00:00Z') }),
      cancel: jest.fn().mockResolvedValue(true),
      snapshot: jest.fn().mockResolvedValue({ targetId: 'conversation', targetType: 'DM', state: 'UPLOADING',
        objectKey: 'key', uploadId: 'session', expectedBytes: 42, expiresAt: new Date(Date.now() + 60_000) }),
      begin: jest.fn().mockResolvedValue({ objectKey: 'key', contentType: 'image/png', expectedBytes: 42, uploadId: 'session', operationId: 'claim' }),
      settle: jest.fn().mockResolvedValue(true),
    }
    storage = {
      signPart: jest.fn().mockResolvedValue('https://storage.invalid/signed-part'),
      initiate: jest.fn(async () => { expect(committed).toBe(true); return 'new-session' }),
      prepareComplete: jest.fn().mockResolvedValue('etag'),
      completePrepared: jest.fn(async () => { expect(committed).toBe(true) }),
    }
    authorize = jest.fn().mockResolvedValue({ userId: 'owner', clubId: 'club', targetId: 'conversation', targetType: 'DM' })
    coordinator = new PrivateUploadCoordinator(prisma, storage, ledger)
  })

  it.each([
    ['RESERVED', 'RESERVED'], ['INITIATING', 'PROCESSING'], ['UPLOADING', 'UPLOADING'],
    ['FINALIZING', 'PROCESSING'], ['READY', 'READY'], ['ATTACHED', 'PUBLISHED'],
    ['ABORTING', 'CANCELLED'], ['ABORTED', 'CANCELLED'], ['REMOVING', 'CANCELLED'], ['REMOVED', 'CANCELLED'],
  ])('projects %s without exposing storage internals', async (state, status) => {
    const expiresAt = new Date(Date.now() + 60_000)
    ledger.snapshot.mockResolvedValue({ id: 'upload', targetId: 'conversation', targetType: 'DM', state,
      expiresAt, objectKey: 'secret-key', uploadId: 'secret-session', operationId: 'secret-operation' })
    await expect(coordinator.status(scope, authorize)).resolves.toEqual({ id: 'upload', status, expiresAt: expiresAt.toISOString() })
  })

  it.each([['READY', 'EXPIRED'], ['ATTACHED', 'PUBLISHED']])('handles expired %s appropriately', async (state, status) => {
    ledger.snapshot.mockResolvedValue({ id: 'upload', targetId: 'conversation', targetType: 'DM', state, expiresAt: new Date(0) })
    expect((await coordinator.status(scope, authorize)).status).toBe(status)
  })

  it('cancellation overrides ready status without claiming storage removal', async () => {
    ledger.snapshot.mockResolvedValue({ id: 'upload', targetId: 'conversation', targetType: 'DM', state: 'READY',
      expiresAt: new Date(Date.now() + 60_000), cancelRequestedAt: new Date() })
    expect((await coordinator.status(scope, authorize)).status).toBe('CANCELLED')
    await expect(coordinator.cancel(scope, authorize)).resolves.toEqual({ cancelled: true })
    expect(ledger.cancel).toHaveBeenCalledWith(tx, scope)
    expect(storage.completePrepared).not.toHaveBeenCalled()
  })

  it('does not acknowledge cancellation when the durable update failed', async () => {
    ledger.cancel.mockResolvedValue(false)
    await expect(coordinator.cancel(scope, authorize)).rejects.toThrow('cancellation could not be recorded')
    expect(committed).toBe(false)
  })

  it('treats cancellation of an already removed upload as an idempotent retry', async () => {
    ledger.snapshot.mockResolvedValue({ targetId: 'conversation', targetType: 'DM', state: 'REMOVED', operationId: null })
    await expect(coordinator.cancel(scope, authorize)).resolves.toEqual({ cancelled: true })
    expect(ledger.cancel).not.toHaveBeenCalled()
  })

  it('does not acknowledge an inconsistent removed upload with a pending operation', async () => {
    ledger.snapshot.mockResolvedValue({ targetId: 'conversation', targetType: 'DM', state: 'REMOVED', operationId: 'pending' })
    ledger.cancel.mockResolvedValue(false)
    await expect(coordinator.cancel(scope, authorize)).rejects.toThrow('cancellation could not be recorded')
  })

  it.each([{ state: 'ATTACHED' }, { state: 'REMOVING', messageId: 'message' }])('does not cancel published media via upload endpoint %j', async (binding) => {
    ledger.snapshot.mockResolvedValue({ targetId: 'conversation', targetType: 'DM', ...binding })
    await expect(coordinator.cancel(scope, authorize)).rejects.toThrow('through their message')
    expect(ledger.cancel).not.toHaveBeenCalled()
  })

  it.each(['status', 'cancel'] as const)('requires current authorization for %s', async (method) => {
    authorize.mockRejectedValue(new Error('denied'))
    await expect(coordinator[method](scope, authorize)).rejects.toThrow('denied')
    expect(ledger.snapshot).not.toHaveBeenCalled()
    expect(ledger.cancel).not.toHaveBeenCalled()
  })

  it('reserves only the authorized target and returns no storage internals', async () => {
    await expect(coordinator.reserve(scope, { requestId, messageType: 'IMAGE', contentType: 'image/png', expectedBytes: 42 }, authorize))
      .resolves.toEqual({ id: 'new-upload', expiresAt: '2026-10-27T12:00:00.000Z' })
    expect(ledger.reserve).toHaveBeenCalledWith(tx, {
      clubId: 'club', ownerId: 'owner', targetType: 'DM', targetId: 'conversation', contentType: 'image/png', expectedBytes: 42,
      reserveRequestId: requestId, reservedMessageType: 'IMAGE', reservedTeamId: undefined,
    })
    expect(storage.initiate).not.toHaveBeenCalled()
  })

  it.each([
    { messageType: 'IMAGE', contentType: 'application/pdf', expectedBytes: 42 },
    { messageType: 'IMAGE', contentType: 'image/png', expectedBytes: 11 * 1024 * 1024 },
    { messageType: 'IMAGE', contentType: 'image/png', expectedBytes: 42, ownerId: 'other' },
  ])('rejects invalid reservation before authorization %j', async (input) => {
    await expect(coordinator.reserve(scope, { requestId, ...input } as never, authorize)).rejects.toThrow('Invalid upload reservation')
    expect(authorize).not.toHaveBeenCalled()
    expect(ledger.reserve).not.toHaveBeenCalled()
  })

  it('does not reserve for mismatched authorization or deleted accounts', async () => {
    authorize.mockResolvedValueOnce({ userId: 'other', clubId: 'club', targetId: 'conversation', targetType: 'DM' })
    const input = { requestId, messageType: 'IMAGE' as const, contentType: 'image/png', expectedBytes: 42 }
    await expect(coordinator.reserve(scope, input, authorize)).rejects.toThrow('scope')
    tx.user.findUnique.mockResolvedValue({ deletedAt: new Date() })
    await expect(coordinator.reserve(scope, input, authorize)).rejects.toThrow('Account unavailable')
    expect(ledger.reserve).not.toHaveBeenCalled()
  })

  it('binds a new channel reservation to its authorized team anchor', async () => {
    authorize.mockResolvedValue({ userId: 'owner', clubId: 'club', targetId: 'channel', targetType: 'CHANNEL', teamId: 'team-a' })
    await coordinator.reserve(scope, { requestId, messageType: 'IMAGE', contentType: 'image/png', expectedBytes: 42 }, authorize)
    expect(ledger.reserve).toHaveBeenCalledWith(tx, expect.objectContaining({ targetId: 'channel', reservedTeamId: 'team-a' }))
    ledger.snapshot.mockResolvedValue({ targetId: 'channel', targetType: 'CHANNEL', reserveRequestId: requestId, reservedTeamId: 'team-a' })
    authorize.mockResolvedValue({ userId: 'owner', clubId: 'club', targetId: 'channel', targetType: 'CHANNEL', teamId: 'team-b' })
    await expect(coordinator.status(scope, authorize)).rejects.toThrow('Upload target unavailable')
  })

  it('signs only the stored part scope and size with bounded remaining lifetime', async () => {
    ledger.snapshot.mockResolvedValue({ targetId: 'conversation', targetType: 'DM', state: 'UPLOADING',
      operationId: null, uploadId: 'session', cancelRequestedAt: null, objectKey: 'key',
      expectedBytes: 42, expiresAt: new Date(Date.now() + 90_000) })
    const result = await coordinator.signPart(scope, authorize)
    expect(result).toEqual({ uploadUrl: 'https://storage.invalid/signed-part', method: 'PUT',
      headers: { 'Content-Length': '42' }, expiresAt: expect.any(String) })
    const args = storage.signPart.mock.calls[0]
    expect(args.slice(0, 3)).toEqual(['key', 'session', 42])
    expect(args[3]).toBeGreaterThan(0)
    expect(args[3]).toBeLessThanOrEqual(90)
    expect(authorize.mock.invocationCallOrder[0]).toBeLessThan(ledger.snapshot.mock.invocationCallOrder[0])
    expect(ledger.begin).not.toHaveBeenCalled()
  })

  it.each([
    { state: 'READY' }, { state: 'FINALIZING' }, { state: 'ABORTED' },
    { cancelRequestedAt: new Date() }, { operationId: 'pending' },
    { uploadId: null }, { expiresAt: new Date(0) },
  ])('does not sign unusable uploads: %j', async (change) => {
    ledger.snapshot.mockResolvedValue({ targetId: 'conversation', targetType: 'DM', state: 'UPLOADING',
      operationId: null, uploadId: 'session', cancelRequestedAt: null,
      expiresAt: new Date(Date.now() + 60_000), ...change })
    await expect(coordinator.signPart(scope, authorize)).rejects.toThrow('not accepting parts')
    expect(storage.signPart).not.toHaveBeenCalled()
  })

  it('does not expose signer error details', async () => {
    ledger.snapshot.mockResolvedValue({ targetId: 'conversation', targetType: 'DM', state: 'UPLOADING',
      operationId: null, uploadId: 'session', cancelRequestedAt: null, objectKey: 'key', expectedBytes: 42,
      expiresAt: new Date(Date.now() + 600_000) })
    storage.signPart.mockRejectedValue(new Error('secret credentials'))
    await expect(coordinator.signPart(scope, authorize)).rejects.toThrow('Upload signing is temporarily unavailable')
    expect(storage.signPart).toHaveBeenCalledWith('key', 'session', 42, 300, expect.any(Date))
  })

  it('anchors the signed and returned expiry to one instant despite a signing delay', async () => {
    const start = 1_800_000_000_000
    const now = jest.spyOn(Date, 'now').mockReturnValue(start)
    try {
      ledger.snapshot.mockResolvedValue({ targetId: 'conversation', targetType: 'DM', state: 'UPLOADING',
        operationId: null, uploadId: 'session', cancelRequestedAt: null, objectKey: 'key', expectedBytes: 42,
        expiresAt: new Date(start + 60_000) })
      storage.signPart.mockImplementation(async () => { now.mockReturnValue(start + 10_000); return 'signed' })
      const result = await coordinator.signPart(scope, authorize)
      expect(result.expiresAt).toBe(new Date(start + 60_000).toISOString())
      expect(storage.signPart).toHaveBeenCalledWith('key', 'session', 42, 60, new Date(start))
      storage.signPart.mockImplementation(async () => { now.mockReturnValue(start + 70_000); return 'signed' })
      await expect(coordinator.signPart(scope, authorize)).rejects.toThrow('capability expired')
    } finally { now.mockRestore() }
  })

  it('denies signing after authorization revocation', async () => {
    authorize.mockRejectedValue(new Error('denied'))
    await expect(coordinator.signPart(scope, authorize)).rejects.toThrow('denied')
    expect(ledger.snapshot).not.toHaveBeenCalled()
    expect(storage.signPart).not.toHaveBeenCalled()
  })

  it.each(['initiate', 'complete'] as const)('commits %s intent before external I/O and records its receipt', async (operation) => {
    await expect(coordinator.advance(scope, operation, authorize)).resolves.toBe('settled')
    expect(authorize).toHaveBeenCalledWith(tx)
    expect(authorize.mock.invocationCallOrder[0]).toBeLessThan(ledger.snapshot.mock.invocationCallOrder[0])
    expect(ledger.settle).toHaveBeenCalledWith(tx, scope, operation, 'claim', operation === 'initiate' ? 'new-session' : undefined)
    if (operation === 'initiate') expect(storage.initiate).toHaveBeenCalledWith('key', 'image/png')
    else {
      expect(storage.prepareComplete).toHaveBeenCalledWith('key', 'session', 42)
      expect(storage.completePrepared).toHaveBeenCalledWith('key', 'session', 'etag')
    }
  })

  it.each(['initiate', 'complete'] as const)('leaves ambiguous %s pending without retries or settlement', async (operation) => {
    const providerWrite = operation === 'initiate' ? storage.initiate : storage.completePrepared
    providerWrite.mockRejectedValue(new Error('provider timeout with secret details'))
    await expect(coordinator.advance(scope, operation, authorize)).resolves.toBe('unknown')
    expect(providerWrite).toHaveBeenCalledTimes(1)
    expect(ledger.settle).not.toHaveBeenCalled()
  })

  it('does not write to storage if committing the claim fails', async () => {
    prisma.$transaction.mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) => { await fn(tx); throw new Error('commit failed') })
    await expect(coordinator.advance(scope, 'initiate', authorize)).rejects.toThrow('commit failed')
    expect(storage.initiate).not.toHaveBeenCalled()
  })

  it('preserves an unknown outcome when recording a successful receipt fails', async () => {
    ledger.settle.mockRejectedValue(new Error('database unavailable'))
    await expect(coordinator.advance(scope, 'initiate', authorize)).resolves.toBe('unknown')
    expect(storage.initiate).toHaveBeenCalledTimes(1)
  })

  it('does not issue another provider write for an ineligible or already claimed operation', async () => {
    ledger.begin.mockResolvedValue(null)
    await expect(coordinator.advance(scope, 'complete', authorize)).resolves.toBe('unchanged')
    expect(storage.completePrepared).not.toHaveBeenCalled()
  })

  it('does not claim finalization when checking the uploaded part fails', async () => {
    storage.prepareComplete.mockRejectedValue(new Error('part missing or provider unavailable'))
    await expect(coordinator.advance(scope, 'complete', authorize)).rejects.toThrow('Upload is not ready')
    expect(ledger.begin).not.toHaveBeenCalled()
    expect(storage.completePrepared).not.toHaveBeenCalled()
    expect(ledger.settle).not.toHaveBeenCalled()
  })

  it('does not issue completion if the upload changed after the readiness check', async () => {
    ledger.begin.mockResolvedValue({ objectKey: 'other', uploadId: 'session', expectedBytes: 42, operationId: 'claim' })
    await expect(coordinator.advance(scope, 'complete', authorize)).rejects.toThrow('Upload changed')
    expect(storage.completePrepared).not.toHaveBeenCalled()
  })

  it('keeps an InvalidPart completion unresolved without a verified terminal receipt', async () => {
    storage.completePrepared.mockRejectedValue({ name: 'InvalidPart', $metadata: { httpStatusCode: 400 } })
    await expect(coordinator.advance(scope, 'complete', authorize)).resolves.toBe('unknown')
    expect(ledger.settle).not.toHaveBeenCalled()
  })

  it.each([
    { name: 'InvalidPart', $metadata: { httpStatusCode: 500 } },
    { name: 'InvalidPart' }, { name: 'TimeoutError', $metadata: { httpStatusCode: 400 } },
  ])('keeps an ambiguous completion pending: %j', async (failure) => {
    storage.completePrepared.mockRejectedValue(failure)
    await expect(coordinator.advance(scope, 'complete', authorize)).resolves.toBe('unknown')
    expect(ledger.settle).not.toHaveBeenCalled()
  })


  it.each([{ userId: 'other' }, { clubId: 'other' }, { targetType: 'OTHER' }, { targetId: '' }])('rejects invalid authorization scope %j', async (change) => {
    authorize.mockResolvedValue({ userId: 'owner', clubId: 'club', targetId: 'conversation', targetType: 'DM', ...change })
    await expect(coordinator.advance(scope, 'initiate', authorize)).rejects.toThrow('scope')
    expect(ledger.snapshot).not.toHaveBeenCalled()
    expect(storage.initiate).not.toHaveBeenCalled()
  })

  it.each([null, { targetType: 'CHANNEL', targetId: 'conversation' }, { targetType: 'DM', targetId: 'other' }])('rejects inaccessible target %j', async (row) => {
    ledger.snapshot.mockResolvedValue(row)
    await expect(coordinator.advance(scope, 'initiate', authorize)).rejects.toThrow('target unavailable')
    expect(ledger.begin).not.toHaveBeenCalled()
  })

  it('rejects a deleted account before upload access', async () => {
    tx.user.findUnique.mockResolvedValue({ deletedAt: new Date() })
    await expect(coordinator.advance(scope, 'initiate', authorize)).rejects.toThrow('Account unavailable')
    expect(ledger.snapshot).not.toHaveBeenCalled()
  })

  it('rejects authorization failure without touching the ledger or provider', async () => {
    authorize.mockRejectedValue(new Error('denied'))
    await expect(coordinator.advance(scope, 'initiate', authorize)).rejects.toThrow('denied')
    expect(ledger.snapshot).not.toHaveBeenCalled()
    expect(storage.initiate).not.toHaveBeenCalled()
  })
})
