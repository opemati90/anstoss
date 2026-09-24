import { NotFoundException } from '@nestjs/common'
import { upsertComplianceRecordSchema } from '@anstoss/shared'
import { ComplianceService, complianceStatus, defaultExpiry } from './compliance.service'

function createService() {
  const prisma: any = {
    membership: {
      findUnique: jest.fn().mockResolvedValue({ role: 'COACH' }),
      findMany: jest.fn().mockResolvedValue([{ userId: 'coach-a', role: 'COACH' }]),
    },
    complianceRecord: {
      upsert: jest.fn().mockImplementation(async (args: any) => ({
        id: 'rec-1',
        ...args.create,
        documentUrl: null,
        member: { name: 'Mara Schulz' },
      })),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([
        { id: 'a', memberUserId: 'coach-a', kind: 'FUEHRUNGSZEUGNIS', issuedAt: null, expiresAt: null, documentUrl: null, note: null, member: { name: 'Mara Schulz' } },
        { id: 'b', memberUserId: 'left-club', kind: 'FUEHRUNGSZEUGNIS', issuedAt: null, expiresAt: null, documentUrl: null, note: null, member: { name: 'Gone' } },
      ]),
      update: jest.fn().mockImplementation(async (args: any) => ({
        id: args.where.id,
        memberUserId: 'coach-a',
        kind: 'FUEHRUNGSZEUGNIS',
        issuedAt: null,
        expiresAt: args.data.expiresAt ?? null,
        documentUrl: null,
        note: args.data.note ?? null,
        member: { name: 'Mara Schulz' },
      })),
    },
    club: { findUnique: jest.fn().mockResolvedValue({ name: 'SV Albatros' }) },
    user: { findUnique: jest.fn().mockResolvedValue({ preferredLanguage: 'de' }) },
    complianceReminder: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $executeRaw: jest.fn().mockResolvedValue(0),
  }
  prisma.$transaction = jest.fn(async (fn: (tx: any) => unknown) => fn(prisma))
  const audit = { log: jest.fn().mockResolvedValue(undefined) }
  const push = { sendToUserLocalized: jest.fn().mockResolvedValue(undefined) }
  const service = new ComplianceService(prisma as never, audit as never, push as never)
  return { service, prisma, audit, push }
}

describe('ComplianceService', () => {
  it('defaults a Führungszeugnis to five years validity', async () => {
    const { service, prisma, audit } = createService()
    const input = upsertComplianceRecordSchema.parse({
      memberUserId: 'coach-a',
      kind: 'FUEHRUNGSZEUGNIS',
      issuedAt: '2026-09-01T00:00:00.000Z',
    })
    const item = await service.upsert('club-1', 'admin-1', input)
    expect(prisma.complianceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clubId_memberUserId_kind: { clubId: 'club-1', memberUserId: 'coach-a', kind: 'FUEHRUNGSZEUGNIS' },
        },
      }),
    )
    expect(item.expiresAt).toBe('2031-09-01T00:00:00.000Z')
    expect(item.role).toBe('COACH')
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ type: 'compliance.recorded' }))
  })

  it('keeps SEPA mandates without expiry and honours an explicit null', () => {
    expect(defaultExpiry('SEPA_MANDATE', new Date())).toBeNull()
    expect(complianceStatus(null)).toBe('VALID')
    expect(complianceStatus(new Date(Date.now() - 1000))).toBe('EXPIRED')
    expect(complianceStatus(new Date(Date.now() + 10 * 86400000))).toBe('EXPIRING')
    expect(complianceStatus(new Date(Date.now() + 400 * 86400000))).toBe('VALID')
  })

  it('rejects members of other clubs', async () => {
    const { service, prisma } = createService()
    prisma.membership.findUnique.mockResolvedValueOnce(null)
    await expect(
      service.upsert('club-1', 'admin-1', {
        memberUserId: 'stranger',
        kind: 'FUEHRUNGSZEUGNIS',
        issuedAt: '2026-09-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(prisma.complianceRecord.upsert).not.toHaveBeenCalled()
  })

  it('scopes updates by club and 404s on foreign records', async () => {
    const { service, prisma } = createService()
    prisma.complianceRecord.findFirst.mockResolvedValueOnce(null)
    await expect(
      service.update('club-1', 'rec-other', 'admin-1', { note: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(prisma.complianceRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'rec-other', clubId: 'club-1' } }),
    )
  })

  it('lists only records of current members', async () => {
    const { service } = createService()
    const items = await service.list('club-1')
    expect(items.map((item) => item.id)).toEqual(['a'])
  })

  it('sends a localized reminder push and audits it', async () => {
    const { service, push, audit } = createService()
    const result = await service.remind('club-1', 'admin-1', {
      memberUserId: 'coach-a',
      kind: 'FUEHRUNGSZEUGNIS',
    })
    expect(result).toEqual({ sent: true })
    expect(push.sendToUserLocalized).toHaveBeenCalledWith(
      'coach-a',
      'COMPLIANCE_REMINDER',
      { clubName: 'SV Albatros', document: 'erweitertes Führungszeugnis' },
      expect.objectContaining({ type: 'compliance_reminder' }),
      { clubId: 'club-1' },
    )
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ type: 'compliance.reminder_sent' }))
  })

  describe('remind cooldown (24h per club + member + kind)', () => {
    const input = { memberUserId: 'coach-a', kind: 'FUEHRUNGSZEUGNIS' as const }
    const now = new Date('2026-09-24T10:00:00.000Z')

    it('claims the slot under an advisory lock and records the send time', async () => {
      const { service, prisma } = createService()
      await expect(service.remind('club-1', 'admin-1', input, now)).resolves.toEqual({ sent: true })
      expect(prisma.$executeRaw).toHaveBeenCalled()
      expect(prisma.complianceReminder.upsert).toHaveBeenCalledWith({
        where: { clubId_memberUserId_kind: { clubId: 'club-1', memberUserId: 'coach-a', kind: 'FUEHRUNGSZEUGNIS' } },
        create: { clubId: 'club-1', memberUserId: 'coach-a', kind: 'FUEHRUNGSZEUGNIS', sentAt: now },
        update: { sentAt: now },
      })
    })

    it('refuses a second reminder within 24 hours without pushing', async () => {
      const { service, prisma, push, audit } = createService()
      prisma.complianceReminder.findUnique.mockResolvedValueOnce({
        sentAt: new Date('2026-09-24T02:00:00.000Z'),
      })
      const result = await service.remind('club-1', 'admin-1', input, now)
      expect(result).toEqual({
        sent: false,
        reason: 'cooldown',
        retryAfter: '2026-09-25T02:00:00.000Z',
      })
      expect(push.sendToUserLocalized).not.toHaveBeenCalled()
      expect(prisma.complianceReminder.upsert).not.toHaveBeenCalled()
      expect(audit.log).not.toHaveBeenCalled()
    })

    it('allows a reminder again exactly 24 hours later', async () => {
      const { service, prisma, push } = createService()
      prisma.complianceReminder.findUnique.mockResolvedValueOnce({
        sentAt: new Date('2026-09-23T10:00:00.000Z'),
      })
      await expect(service.remind('club-1', 'admin-1', input, now)).resolves.toEqual({ sent: true })
      expect(push.sendToUserLocalized).toHaveBeenCalledTimes(1)
    })

    it('keys the cooldown per kind: a Spielerpass reminder is independent', async () => {
      const { service, prisma } = createService()
      await service.remind('club-1', 'admin-1', { memberUserId: 'coach-a', kind: 'SPIELERPASS' }, now)
      expect(prisma.complianceReminder.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clubId_memberUserId_kind: { clubId: 'club-1', memberUserId: 'coach-a', kind: 'SPIELERPASS' } },
        }),
      )
    })

    it('releases the slot when delivery fails so the admin can retry', async () => {
      const { service, prisma, push } = createService()
      push.sendToUserLocalized.mockRejectedValueOnce(new Error('expo down'))
      const result = await service.remind('club-1', 'admin-1', input, now)
      expect(result).toEqual({ sent: false, reason: 'delivery_failed' })
      expect(prisma.complianceReminder.updateMany).toHaveBeenCalledWith({
        where: { clubId: 'club-1', memberUserId: 'coach-a', kind: 'FUEHRUNGSZEUGNIS', sentAt: now },
        data: { sentAt: new Date(0) },
      })
    })

    it('falls back to German document names for a locale without a label', async () => {
      const { service, prisma, push } = createService()
      prisma.user.findUnique.mockResolvedValueOnce({ preferredLanguage: 'xx' })
      await service.remind('club-1', 'admin-1', input, now)
      expect(push.sendToUserLocalized.mock.calls[0][2].document).toBe('erweitertes Führungszeugnis')
    })
  })
})
