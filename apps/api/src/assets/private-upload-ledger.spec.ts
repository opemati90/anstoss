import { Prisma } from '@prisma/client'
import { PrivateUploadLedger, PRIVATE_UPLOAD_PENDING_BYTES, PRIVATE_UPLOAD_PENDING_LIMIT } from './private-upload-ledger'
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
      messageId: null,
      objectKey: 'private-chat/v2/synthetic',
      targetType: 'CHANNEL',
      targetId: 'target',
      expiresAt: new Date(Date.now() + 600_000),
    }
    tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      message: { findFirst: jest.fn().mockResolvedValue(null) },
      directMessage: { findFirst: jest.fn().mockResolvedValue(null) },
      messageReport: { findFirst: jest.fn().mockResolvedValue(null) },
      directMessageReport: { findFirst: jest.fn().mockResolvedValue(null) },
      privateMediaUpload: {
        aggregate: jest.fn().mockResolvedValue({ _count: { _all: 0 }, _sum: { expectedBytes: null } }),
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

  it.each([
    { count: PRIVATE_UPLOAD_PENDING_LIMIT, bytes: 0 },
    { count: 1, bytes: PRIVATE_UPLOAD_PENDING_BYTES - 41 },
  ])('rejects reservations exceeding pending resource caps %j', async ({ count, bytes }) => {
    ;(tx.privateMediaUpload.aggregate as jest.Mock).mockResolvedValue({ _count: { _all: count }, _sum: { expectedBytes: bytes } })
    await expect(ledger.reserve(tx, {
      clubId: 'club', ownerId: 'owner', targetId: 'team', targetType: 'CHANNEL', contentType: 'image/png', expectedBytes: 42,
    })).rejects.toMatchObject({ status: 429, response: expect.objectContaining({ code: 'PRIVATE_UPLOAD_PENDING_LIMIT' }) })
    expect(tx.privateMediaUpload.create).not.toHaveBeenCalled()
  })

  it('allows the exact byte and count boundaries and scopes usage under the quota lock', async () => {
    ;(tx.privateMediaUpload.aggregate as jest.Mock).mockResolvedValue({
      _count: { _all: PRIVATE_UPLOAD_PENDING_LIMIT - 1 }, _sum: { expectedBytes: PRIVATE_UPLOAD_PENDING_BYTES - 42 },
    })
    await ledger.reserve(tx, {
      clubId: 'club', ownerId: 'owner', targetId: 'team', targetType: 'CHANNEL', contentType: 'image/png', expectedBytes: 42,
    })
    expect(tx.privateMediaUpload.aggregate).toHaveBeenCalledWith({
      where: { clubId: 'club', ownerId: 'owner', state: { notIn: ['ATTACHED', 'REMOVED'] } },
      _count: { _all: true }, _sum: { expectedBytes: true },
    })
    expect((tx.$executeRaw as jest.Mock).mock.invocationCallOrder[0])
      .toBeLessThan((tx.privateMediaUpload.aggregate as jest.Mock).mock.invocationCallOrder[0])
    expect(tx.privateMediaUpload.create).toHaveBeenCalledTimes(1)
  })

  it('fails closed when pending usage cannot be read', async () => {
    ;(tx.privateMediaUpload.aggregate as jest.Mock).mockRejectedValue(new Error('database unavailable'))
    await expect(ledger.reserve(tx, {
      clubId: 'club', ownerId: 'owner', targetId: 'team', targetType: 'CHANNEL', contentType: 'image/png', expectedBytes: 42,
    })).rejects.toThrow('database unavailable')
    expect(tx.privateMediaUpload.create).not.toHaveBeenCalled()
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

  it.each(['RESERVED', 'ATTACHED', 'REMOVED'])('replays the original %s reservation even at quota', async (state) => {
    const requestId = '2f36b5df-8364-4e6f-a082-0f0272819351'
    row = { ...row, state, reserveRequestId: requestId, reservedMessageType: 'IMAGE', reservedTeamId: 'team',
      contentType: 'image/png', expectedBytes: 42 }
    const input = { clubId: 'club', ownerId: 'owner', targetId: 'target', targetType: 'CHANNEL' as const,
      contentType: 'image/png', expectedBytes: 42, reserveRequestId: requestId, reservedMessageType: 'IMAGE' as const, reservedTeamId: 'team' }
    await expect(ledger.reserve(tx, input)).resolves.toMatchObject({ id: 'upload', state, expiresAt: row.expiresAt })
    expect(tx.privateMediaUpload.aggregate).not.toHaveBeenCalled()
    expect(tx.privateMediaUpload.create).not.toHaveBeenCalled()
  })

  it.each([
    { targetId: 'other' }, { targetType: 'DM', reservedTeamId: undefined }, { reservedMessageType: 'FILE' },
    { contentType: 'image/jpeg' }, { expectedBytes: 43 }, { reservedTeamId: 'other-team' },
  ])('rejects an idempotency key reused with changed scope or content: %j', async (change) => {
    const requestId = '2f36b5df-8364-4e6f-a082-0f0272819351'
    row = { ...row, reserveRequestId: requestId, reservedMessageType: 'IMAGE', reservedTeamId: 'team', contentType: 'image/png', expectedBytes: 42 }
    const input = { clubId: 'club', ownerId: 'owner', targetId: 'target', targetType: 'CHANNEL' as const,
      contentType: 'image/png', expectedBytes: 42, reserveRequestId: requestId, reservedMessageType: 'IMAGE' as const, reservedTeamId: 'team', ...change }
    await expect(ledger.reserve(tx, input as Parameters<PrivateUploadLedger['reserve']>[1])).rejects.toThrow('cannot be reused')
    expect(tx.privateMediaUpload.create).not.toHaveBeenCalled()
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
    expect(row.state).toBe('ABORTED')
  })

  it('never reclaims or retries an acknowledged ABORTED session', async () => {
    Object.assign(row, {
      state: 'ABORTED', uploadId: 'provider-id', cancelRequestedAt: new Date(), operationId: null,
    })
    expect(await ledger.begin(tx, scope, 'abort')).toBeNull()
    expect(row.state).toBe('ABORTED')
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
    ;(tx.message.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'message' })
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

  it('does not acknowledge cancellation when its durable update affected no row', async () => {
    ;(tx.privateMediaUpload.updateMany as jest.Mock).mockResolvedValue({ count: 0 })
    await expect(ledger.cancel(tx, scope)).resolves.toBe(false)
  })

  it.each(['message', 'directMessage', 'messageReport', 'directMessageReport'] as const)(
    'does not claim removal while %s holds the media', async (model) => {
      row.state = 'ATTACHED'; row.uploadId = 'provider'; row.messageId = 'message'
      row.cancelRequestedAt = new Date()
      ;(tx[model].findFirst as jest.Mock).mockResolvedValue({ id: 'hold' })
      expect(await ledger.begin(tx, scope, 'remove')).toBeNull()
      expect(row.state).toBe('ATTACHED')
      expect(tx.privateMediaUpload.updateMany).not.toHaveBeenCalled()
    },
  )

  it.each(['CHANNEL', 'DM'])('locks the %s message before upload and media locks', async (targetType) => {
    row.state = 'ATTACHED'; row.uploadId = 'provider'; row.messageId = 'message'
    row.cancelRequestedAt = new Date(); row.targetType = targetType
    expect((await ledger.begin(tx, scope, 'remove'))?.state).toBe('REMOVING')
    const locks = (tx.$executeRaw as jest.Mock).mock.calls.map((call) => call[1])
    expect(locks).toEqual([
      `${targetType === 'CHANNEL' ? 'chat-message' : 'dm-message'}:message`,
      'private-upload:upload', 'media-object:private-chat/v2/synthetic',
    ])
    const reportModel = targetType === 'CHANNEL' ? tx.messageReport : tx.directMessageReport
    const messageModel = targetType === 'CHANNEL' ? tx.message : tx.directMessage
    expect(messageModel.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: [
        { attachmentUrl: 'https://private-media.anstoss.invalid/private-chat/v2/synthetic' },
        { id: 'message', attachmentUrl: { not: null } },
      ] }),
    }))
    expect(reportModel.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: {
      evidencePurgedAt: null,
      OR: [
        { evidenceAttachmentUrl: 'https://private-media.anstoss.invalid/private-chat/v2/synthetic' },
        { [targetType === 'CHANNEL' ? 'messageId' : 'directMessageId']: 'message' },
      ],
    } }))
  })

  it('rechecks message binding after acquiring the upload lock', async () => {
    row.state = 'ATTACHED'; row.uploadId = 'provider'; row.messageId = 'new-message'
    row.cancelRequestedAt = new Date()
    ;(tx.privateMediaUpload.findFirst as jest.Mock).mockResolvedValueOnce({ ...row, messageId: 'old-message' })
    expect(await ledger.begin(tx, scope, 'remove')).toBeNull()
    expect(tx.privateMediaUpload.updateMany).not.toHaveBeenCalled()
  })

  it('does not remove a READY upload referenced by another live message', async () => {
    row.state = 'READY'; row.uploadId = 'provider'; row.cancelRequestedAt = new Date()
    ;(tx.directMessage.findFirst as jest.Mock).mockResolvedValue({ id: 'another-message' })
    expect(await ledger.begin(tx, scope, 'remove')).toBeNull()
    expect(tx.directMessage.findFirst).toHaveBeenCalledWith({ where: {
      deletedAt: null, OR: [{ attachmentUrl: 'https://private-media.anstoss.invalid/private-chat/v2/synthetic' }],
    }, select: { id: true } })
  })

  it('fails closed when checking evidence fails', async () => {
    row.state = 'READY'; row.uploadId = 'provider'; row.cancelRequestedAt = new Date()
    ;(tx.messageReport.findFirst as jest.Mock).mockRejectedValue(new Error('database failure'))
    await expect(ledger.begin(tx, scope, 'remove')).rejects.toThrow('database failure')
    expect(tx.privateMediaUpload.updateMany).not.toHaveBeenCalled()
  })

  it('does not mark initiation successful without a provider upload ID', async () => {
    const claim = await ledger.begin(tx, scope, 'initiate')
    await expect(ledger.settle(tx, scope, 'initiate', claim!.operationId)).rejects.toThrow(
      'upload ID',
    )
    expect(row.state).toBe('INITIATING')
  })

  it.each(['CHANNEL', 'DM'])('requires the real %s message binding before attachment', async (targetType) => {
    row.state = 'READY'; row.uploadId = 'provider'; row.targetType = targetType
    const model = targetType === 'CHANNEL' ? tx.message : tx.directMessage
    expect(await ledger.attach(tx, scope, 'message')).toBe(false)
    expect(tx.privateMediaUpload.updateMany).not.toHaveBeenCalled()
    ;(model.findFirst as jest.Mock).mockResolvedValue({ id: 'message' })
    expect(await ledger.attach(tx, scope, 'message')).toBe(true)
    expect(model.findFirst).toHaveBeenCalledWith({ where: {
      id: 'message', senderId: 'owner', deletedAt: null,
      attachmentUrl: 'https://private-media.anstoss.invalid/private-chat/v2/synthetic',
      messageType: { in: ['VOICE', 'IMAGE', 'VIDEO', 'FILE'] },
      ...(targetType === 'CHANNEL' ? { clubId: 'club', channelId: 'target' }
        : { conversationId: 'target', conversation: { clubId: 'club' } }),
    }, select: { id: true } })
  })

  it('does not attach an upload without a provider session receipt', async () => {
    row.state = 'READY'
    expect(await ledger.attach(tx, scope, 'message')).toBe(false)
    expect(tx.message.findFirst).not.toHaveBeenCalled()
  })

  it('does not attach if inspecting the message fails', async () => {
    row.state = 'READY'; row.uploadId = 'provider'
    ;(tx.message.findFirst as jest.Mock).mockRejectedValue(new Error('query failed'))
    await expect(ledger.attach(tx, scope, 'message')).rejects.toThrow('query failed')
    expect(tx.privateMediaUpload.updateMany).not.toHaveBeenCalled()
  })
})
