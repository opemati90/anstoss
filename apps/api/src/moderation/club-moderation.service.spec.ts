import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { resolveModerationReportSchema } from '@anstoss/shared'
import { ClubModerationService } from './club-moderation.service'
import { ModerationSafetyWorker } from './moderation-safety'
import { createFakePrisma, PRIVACY_RELATIONS } from '../testing/fake-prisma'

// UGC moderation (Apple 1.2 / Google Play UGC): club admin queue, plus the
// safeguarding review fixes (2026-09-24): H6 evidence + quarantine, M6
// escalation, L1 ordering, overdue alerts and evidence retention.

const HOUR = 60 * 60 * 1000
const ago = (h: number) => new Date(Date.now() - h * HOUR)
const IMG = 'https://assets.anstoss.io/chat/albatros/u15/image/a.png'

function world() {
  return createFakePrisma(
    {
      user: [
        { id: 'reporter', name: 'Lukas Hoffmann' },
        { id: 'sender', name: 'Tim Weber' },
        { id: 'coach', name: 'Trainer' },
        { id: 'admin-1', name: 'Kassenwart' },
      ],
      membership: [
        { userId: 'admin-1', clubId: 'albatros', role: 'ADMIN' },
        { userId: 'sender', clubId: 'albatros', role: 'PLAYER' },
        { userId: 'coach', clubId: 'albatros', role: 'COACH' },
      ],
      teamAccess: [],
      message: [
        { id: 'm-1', clubId: 'albatros', teamId: 'u15', channelId: 'c', senderId: 'sender', content: 'edited', createdAt: ago(30), deletedAt: null, attachmentUrl: IMG, attachmentMeta: { type: 'image/png' } },
        { id: 'm-coach', clubId: 'albatros', teamId: 'u15', channelId: 'c', senderId: 'coach', content: 'x', createdAt: ago(2), deletedAt: null },
        { id: 'm-other-club', clubId: 'babelsberg', teamId: 'b', channelId: 'c', senderId: 'sender', content: 'y', createdAt: ago(2), deletedAt: null },
      ],
      messageTranslation: [{ id: 't', messageId: 'm-1' }],
      messageReport: [
        { id: 'r-1', messageId: 'm-1', reporterUserId: 'reporter', reason: 'ABUSE', createdAt: ago(30), resolvedAt: null, resolution: null, evidenceContent: 'original text', evidenceAttachmentUrl: IMG, evidenceAttachmentMeta: { type: 'image/png' }, escalationReason: null, escalatedAt: null, overdueAlertedAt: null, evidencePurgedAt: null },
        { id: 'r-1b', messageId: 'm-1', reporterUserId: 'admin-1', reason: 'SPAM', createdAt: ago(3), resolvedAt: null, resolution: null, evidenceContent: 'original text', evidenceAttachmentUrl: IMG, evidenceAttachmentMeta: null, escalationReason: null, escalatedAt: null, overdueAlertedAt: null, evidencePurgedAt: null },
        { id: 'r-safe', messageId: 'm-1', reporterUserId: 'x', reason: 'SAFEGUARDING', createdAt: ago(1), resolvedAt: null, escalationReason: 'safeguarding', escalatedAt: ago(1) },
        { id: 'r-coach', messageId: 'm-coach', reporterUserId: 'reporter', reason: 'ABUSE', createdAt: ago(2), resolvedAt: null, escalationReason: null, escalatedAt: null, overdueAlertedAt: null },
        { id: 'r-foreign', messageId: 'm-other-club', reporterUserId: 'reporter', reason: 'ABUSE', createdAt: ago(2), resolvedAt: null, escalationReason: null },
      ],
      conversation: [{ id: 'conv', clubId: 'albatros' }],
      directMessage: [{ id: 'dm-1', conversationId: 'conv', senderId: 'sender', content: 'dm text', createdAt: ago(5), deletedAt: null, attachmentUrl: null }],
      directMessageTranslation: [],
      directMessageReport: [
        { id: 'dr-1', directMessageId: 'dm-1', reporterUserId: 'reporter', reason: 'ABUSE', createdAt: ago(5), resolvedAt: null, evidenceContent: 'dm text', escalationReason: null, escalatedAt: null, overdueAlertedAt: null },
      ],
      auditLog: [],
    },
    PRIVACY_RELATIONS,
  )
}

function r2() {
  return {
    enabled: true,
    objectKeyFromUrl: jest.fn((url: string) => url.replace('https://assets.anstoss.io/', '')),
    presignGet: jest.fn(async (key: string, ttl: number) => `signed:${key}:${ttl}`),
    presignGetIn: jest.fn(async (bucket: string, key: string, ttl: number) => `signed:${bucket}/${key}:${ttl}`),
    quarantineObject: jest.fn(async (key: string) => ({ bucket: 'anstoss-assets', key: `quarantine/uuid/${key.split('/').pop()}` })),
    deleteObjectIn: jest.fn(async () => undefined),
  }
}

function build(prisma = world()) {
  const storage = r2()
  const alerter = { alert: jest.fn().mockResolvedValue(undefined) }
  const service = new ClubModerationService(prisma as never, storage as never, alerter as never)
  return { prisma, storage, alerter, service }
}

describe('ClubModerationService.listReports', () => {
  it('lists only this club, hides platform-only reports, flags overdue, oldest open first (L1)', async () => {
    const { service } = build()
    const rows = await service.listReports('albatros')
    expect(rows.map((r) => r.id)).toEqual(['r-1', 'dr-1', 'r-1b', 'r-coach'])
    expect(rows[0]).toEqual(
      expect.objectContaining({
        overdue: true,
        message: expect.objectContaining({ content: 'original text', removed: false }),
      }),
    )
    expect(rows[1].overdue).toBe(false)
  })

  it('L1: the oldest open report is never dropped by the limit', async () => {
    const prisma = world()
    for (let i = 0; i < 120; i++) {
      prisma.tables.messageReport.push({ id: `new-${i}`, messageId: 'm-1', reporterUserId: `u${i}`, reason: 'SPAM', createdAt: ago(1 - i / 1000), resolvedAt: null, escalationReason: null })
    }
    const { service } = build(prisma)
    const rows = await service.listReports('albatros', { limit: 100 })
    expect(rows).toHaveLength(100)
    expect(rows[0].id).toBe('r-1')
  })

  it('H6: returns a 5-minute signed URL for attachment evidence', async () => {
    const { service, storage } = build()
    const rows = await service.listReports('albatros')
    expect(rows[0].message.attachment).toEqual({
      url: 'signed:chat/albatros/u15/image/a.png:300',
      meta: { type: 'image/png' },
    })
    expect(storage.presignGet).toHaveBeenCalledWith('chat/albatros/u15/image/a.png', 300)
  })
})

describe('ClubModerationService.resolveReport', () => {
  it('remove: hides the message, closes sibling reports, audits, and quarantines the media (H6)', async () => {
    const { prisma, storage, service } = build()
    await service.resolveReport('albatros', 'r-1', 'admin-1', { action: 'remove' })

    const msg = prisma.tables.message.find((m) => m.id === 'm-1')!
    expect(msg).toEqual(expect.objectContaining({ content: '', attachmentUrl: null, deletedAt: expect.any(Date) }))
    expect(prisma.tables.messageTranslation).toEqual([])
    const siblings = prisma.tables.messageReport.filter((r) => r.messageId === 'm-1')
    expect(siblings.every((r) => r.resolvedAt)).toBe(true)
    expect(prisma.tables.auditLog).toEqual([
      expect.objectContaining({ clubId: 'albatros', type: 'moderation.report_resolved' }),
    ])
    expect(storage.quarantineObject).toHaveBeenCalledWith('chat/albatros/u15/image/a.png')
    const r1 = prisma.tables.messageReport.find((r) => r.id === 'r-1')!
    expect(r1.evidenceAttachmentUrl).toBeNull()
    expect(r1.evidenceAttachmentMeta.quarantine.key).toMatch(/^quarantine\//)
  })

  it('dismiss keeps the message and its media', async () => {
    const { prisma, storage, service } = build()
    await service.resolveReport('albatros', 'r-1', 'admin-1', resolveModerationReportSchema.parse({ action: 'dismiss' }))
    expect(prisma.tables.message.find((m) => m.id === 'm-1')!.deletedAt).toBeNull()
    expect(storage.quarantineObject).not.toHaveBeenCalled()
  })

  it('removes a reported direct message in the club', async () => {
    const { prisma, service } = build()
    await service.resolveReport('albatros', 'dr-1', 'admin-1', { action: 'remove' })
    expect(prisma.tables.directMessage[0]).toEqual(expect.objectContaining({ content: '', deletedAt: expect.any(Date) }))
  })

  it('404 for another club report, 409 when already resolved', async () => {
    const { prisma, service } = build()
    await expect(service.resolveReport('albatros', 'r-foreign', 'admin-1', { action: 'remove' })).rejects.toBeInstanceOf(NotFoundException)
    prisma.tables.messageReport.find((r) => r.id === 'r-1')!.resolvedAt = new Date()
    await expect(service.resolveReport('albatros', 'r-1', 'admin-1', { action: 'remove' })).rejects.toBeInstanceOf(ConflictException)
    expect(prisma.tables.message.find((m) => m.id === 'm-1')!.deletedAt).toBeNull()
  })

  it('M6: platform-only reports cannot be resolved by the club', async () => {
    const { service } = build()
    await expect(service.resolveReport('albatros', 'r-safe', 'admin-1', { action: 'dismiss' })).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('M6: a report about a club coach escalates on resolve and alerts the platform', async () => {
    const { prisma, alerter, service } = build()
    await expect(service.resolveReport('albatros', 'r-coach', 'admin-1', { action: 'dismiss' })).rejects.toBeInstanceOf(ForbiddenException)
    const row = prisma.tables.messageReport.find((r) => r.id === 'r-coach')!
    expect(row).toEqual(expect.objectContaining({ escalationReason: 'staff_sender', resolvedAt: null }))
    expect(alerter.alert).toHaveBeenCalledWith(expect.objectContaining({ reason: 'staff_sender', reportIds: ['r-coach'] }))
  })

  it('refuses a report about the admin own message', async () => {
    const prisma = world()
    prisma.tables.message[0].senderId = 'admin-1'
    const { service } = build(prisma)
    await expect(service.resolveReport('albatros', 'r-1', 'admin-1', { action: 'dismiss' })).rejects.toBeInstanceOf(ForbiddenException)
  })
})

describe('ModerationSafetyWorker', () => {
  it.each(['channel', 'direct'] as const)('retries beyond 200 unprocessable %s reports', async (kind) => {
    const prisma = world()
    const direct = kind === 'direct'
    const reports = direct ? prisma.tables.directMessageReport : prisma.tables.messageReport
    const messages = direct ? prisma.tables.directMessage : prisma.tables.message
    const field = direct ? 'directMessageId' : 'messageId'
    messages[0].deletedAt = new Date()
    const original = { ...reports[0] }
    reports.splice(0, reports.length, ...Array.from({ length: 201 }, (_, i) => ({
      ...original, id: `page-${String(i).padStart(4, '0')}`, [field]: `message-${i}`,
      evidencePurgedAt: null, evidenceAttachmentUrl: i === 200 ? IMG : 'https://external.invalid/file',
    })))
    messages.splice(0, messages.length, ...reports.map((r) => ({ id: r[field], deletedAt: new Date() })))
    const storage = r2()
    storage.objectKeyFromUrl.mockImplementation((url) => url.startsWith('https://assets.anstoss.io/') ? url.replace('https://assets.anstoss.io/', '') : '')
    const worker = new ModerationSafetyWorker(prisma as never, { alert: jest.fn() } as never, storage as never)
    await expect(worker.retryPendingQuarantines()).resolves.toBe(1)
    expect(reports[200].evidenceAttachmentUrl).toBeNull()
    expect(reports[0].evidenceAttachmentUrl).toBe('https://external.invalid/file')
  })

  it.each(['channel', 'direct'] as const)('purges beyond 500 pending %s moves without losing their pointers', async (kind) => {
    const prisma = world()
    const direct = kind === 'direct'
    const reports = direct ? prisma.tables.directMessageReport : prisma.tables.messageReport
    const messages = direct ? prisma.tables.directMessage : prisma.tables.message
    messages[0].deletedAt = new Date()
    const original = { ...reports[0] }
    reports.splice(0, reports.length, ...Array.from({ length: 501 }, (_, i) => ({
      ...original, id: `page-${String(i).padStart(4, '0')}`, resolvedAt: ago(91 * 24),
      evidencePurgedAt: null, evidenceAttachmentMeta: null, evidenceAttachmentUrl: i === 500 ? null : IMG,
    })))
    const worker = new ModerationSafetyWorker(prisma as never, { alert: jest.fn() } as never, r2() as never)
    await expect(worker.purgeExpiredEvidence()).resolves.toBe(1)
    expect(reports[500].evidencePurgedAt).toBeInstanceOf(Date)
    expect(reports[0].evidenceAttachmentUrl).toBe(IMG)
  })

  it('retries failed moves from persisted report URLs after the message is removed', async () => {
    const { prisma, storage, service, alerter } = build()
    storage.quarantineObject.mockRejectedValueOnce(new Error('temporary storage outage'))
    await service.resolveReport('albatros', 'r-1', 'admin-1', { action: 'remove' })
    const report = prisma.tables.messageReport.find((r) => r.id === 'r-1')!
    expect(report.evidenceAttachmentUrl).toBe(IMG)
    expect(prisma.tables.message[0].attachmentUrl).toBeNull()
    const worker = new ModerationSafetyWorker(prisma as never, alerter as never, storage as never)
    await expect(worker.retryPendingQuarantines()).resolves.toBe(1)
    expect(report.evidenceAttachmentUrl).toBeNull()
    expect(report.evidenceAttachmentMeta.quarantine).toBeDefined()
    await expect(worker.retryPendingQuarantines()).resolves.toBe(0)
  })

  it('retries a report DB-update failure after storage succeeds', async () => {
    const { prisma, storage, service, alerter } = build()
    const update = prisma.messageReport.updateMany.getMockImplementation()!
    let fail = true
    prisma.messageReport.updateMany.mockImplementation(async (args: any) => {
      if (args.data.evidenceAttachmentMeta?.quarantine && fail) {
        fail = false
        throw new Error('database temporarily unavailable')
      }
      return update(args)
    })
    await service.resolveReport('albatros', 'r-1', 'admin-1', { action: 'remove' })
    const worker = new ModerationSafetyWorker(prisma as never, alerter as never, storage as never)
    await expect(worker.retryPendingQuarantines()).resolves.toBe(1)
    expect(storage.quarantineObject).toHaveBeenCalledTimes(2)
    expect(prisma.tables.messageReport[0].evidenceAttachmentUrl).toBeNull()
  })

  it('retries removed direct-message attachments too', async () => {
    const prisma = world()
    prisma.tables.directMessage[0].deletedAt = new Date()
    prisma.tables.directMessageReport[0].evidenceAttachmentUrl = IMG
    const storage = r2()
    const worker = new ModerationSafetyWorker(prisma as never, { alert: jest.fn() } as never, storage as never)
    await expect(worker.retryPendingQuarantines()).resolves.toBe(1)
    expect(prisma.tables.directMessageReport[0].evidenceAttachmentUrl).toBeNull()
  })

  it('alerts the platform once per report open longer than 24h and flags it escalated', async () => {
    const prisma = world()
    const alerter = { alert: jest.fn().mockResolvedValue(undefined) }
    const worker = new ModerationSafetyWorker(prisma as never, alerter as never)

    await expect(worker.alertOverdue()).resolves.toEqual(['r-1'])
    await expect(worker.alertOverdue()).resolves.toEqual([])
    expect(alerter.alert).toHaveBeenCalledTimes(1)
    expect(alerter.alert).toHaveBeenCalledWith({ reason: 'overdue', reportIds: ['r-1'], clubId: 'albatros' })
    expect(prisma.tables.messageReport.find((r) => r.id === 'r-1')).toEqual(
      expect.objectContaining({ escalationReason: 'overdue', overdueAlertedAt: expect.any(Date) }),
    )
  })

  it('purges evidence 90 days after resolution and deletes the quarantined object', async () => {
    const prisma = world()
    const r1 = prisma.tables.messageReport.find((r) => r.id === 'r-1')!
    r1.resolvedAt = new Date(Date.now() - 91 * 24 * HOUR)
    r1.evidenceAttachmentMeta = { quarantine: { bucket: 'q', key: 'quarantine/u/a.png' } }
    const recent = prisma.tables.messageReport.find((r) => r.id === 'r-1b')!
    recent.resolvedAt = new Date(Date.now() - 10 * 24 * HOUR)
    const storage = r2()
    const worker = new ModerationSafetyWorker(prisma as never, { alert: jest.fn() } as never, storage as never)

    await expect(worker.purgeExpiredEvidence()).resolves.toBe(1)
    expect(storage.deleteObjectIn).toHaveBeenCalledWith('q', 'quarantine/u/a.png')
    expect(r1).toEqual(
      expect.objectContaining({
        evidenceContent: null,
        evidenceAttachmentUrl: null,
        evidenceAttachmentMeta: null,
        evidencePurgedAt: expect.any(Date),
      }),
    )
    expect(recent.evidenceContent).toBe('original text')
  })

  it('retains a shared object until every report referencing it expires', async () => {
    const prisma = world()
    const old = prisma.tables.messageReport[0]
    const active = prisma.tables.directMessageReport[0]
    old.resolvedAt = new Date(Date.now() - 91 * 24 * HOUR)
    old.evidenceAttachmentMeta = { quarantine: { bucket: 'q', key: 'quarantine/shared/a.png' } }
    active.evidenceAttachmentMeta = old.evidenceAttachmentMeta
    const storage = r2()
    const worker = new ModerationSafetyWorker(prisma as never, { alert: jest.fn() } as never, storage as never)
    await expect(worker.purgeExpiredEvidence()).resolves.toBe(1)
    expect(storage.deleteObjectIn).not.toHaveBeenCalled()
    expect(active.evidenceAttachmentMeta.quarantine).toBeDefined()
    active.resolvedAt = new Date(Date.now() - 91 * 24 * HOUR)
    await expect(worker.purgeExpiredEvidence()).resolves.toBe(1)
    expect(storage.deleteObjectIn).toHaveBeenCalledTimes(1)
  })

  it('keeps the private object pointer when deletion fails and retries later', async () => {
    const prisma = world()
    const old = prisma.tables.messageReport[0]
    old.resolvedAt = new Date(Date.now() - 91 * 24 * HOUR)
    old.evidenceAttachmentMeta = { quarantine: { bucket: 'q', key: 'quarantine/retry/a.png' } }
    const storage = r2()
    storage.deleteObjectIn.mockRejectedValueOnce(new Error('storage outage'))
    const worker = new ModerationSafetyWorker(prisma as never, { alert: jest.fn() } as never, storage as never)
    await expect(worker.purgeExpiredEvidence()).resolves.toBe(0)
    expect(old.evidencePurgedAt).toBeNull()
    expect(old.evidenceAttachmentMeta.quarantine).toBeDefined()
    await expect(worker.purgeExpiredEvidence()).resolves.toBe(1)
    expect(old.evidencePurgedAt).toBeInstanceOf(Date)
  })

  it('does not purge a pending move and lose its durable source pointer', async () => {
    const prisma = world()
    prisma.tables.message[0].deletedAt = new Date()
    prisma.tables.messageReport[0].resolvedAt = new Date(Date.now() - 91 * 24 * HOUR)
    const worker = new ModerationSafetyWorker(prisma as never, { alert: jest.fn() } as never, r2() as never)
    await expect(worker.purgeExpiredEvidence()).resolves.toBe(0)
    expect(prisma.tables.messageReport[0].evidenceAttachmentUrl).toBe(IMG)
  })
})
