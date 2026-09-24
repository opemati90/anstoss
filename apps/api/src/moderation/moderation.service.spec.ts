import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { ModerationService } from './moderation.service'
import { createFakePrisma, PRIVACY_RELATIONS } from '../testing/fake-prisma'

// UGC moderation (Apple 1.2 / Play UGC) + safeguarding review 2026-09-24
// (H6 channel authz, M6 escalation, L2 push batching). Where clauses are
// evaluated by the fake Prisma.

function world(extra: Record<string, Record<string, unknown>[]> = {}) {
  return createFakePrisma(
    {
      club: [{ id: 'albatros', name: 'SV Albatros' }],
      user: [
        { id: 'reporter', name: 'Lukas Hoffmann', deletedAt: null },
        { id: 'sender', name: 'Tim Weber', deletedAt: null },
        { id: 'coach', name: 'Trainer', deletedAt: null },
        { id: 'admin-1', name: 'Kassenwart', deletedAt: null },
        { id: 'admin-2', name: 'Abteilungsleiter', deletedAt: null },
      ],
      membership: [
        { userId: 'admin-1', clubId: 'albatros', role: 'ADMIN' },
        { userId: 'admin-2', clubId: 'albatros', role: 'OWNER' },
        { userId: 'sender', clubId: 'albatros', role: 'PLAYER' },
        { userId: 'coach', clubId: 'albatros', role: 'PLAYER' },
      ],
      teamAccess: [
        { id: 'ta', clubId: 'albatros', teamId: 'u15', userId: 'coach', role: 'HEAD_COACH', status: 'ACTIVE' },
      ],
      message: [
        {
          id: 'm-player',
          clubId: 'albatros',
          teamId: 'u15',
          channelId: 'club-chan',
          senderId: 'sender',
          deletedAt: null,
          content: 'Wichtige Info',
          attachmentUrl: 'https://assets.anstoss.io/chat/albatros/u15/image/a.png',
          attachmentMeta: { type: 'image/png' },
        },
        { id: 'm-coach', clubId: 'albatros', teamId: 'u15', channelId: null, senderId: 'coach', deletedAt: null, content: 'x' },
      ],
      messageReport: [],
      conversation: [{ id: 'conv', clubId: 'albatros' }],
      directMessage: [
        {
          id: 'dm-1',
          conversationId: 'conv',
          senderId: 'sender',
          deletedAt: null,
          content: 'Preserved abusive content',
          attachmentUrl: 'https://cdn.example/dm/a.jpg',
          attachmentMeta: { width: 800 },
        },
      ],
      directMessageReport: [],
      ...extra,
    },
    {
      ...PRIVACY_RELATIONS,
      directMessage: {
        ...PRIVACY_RELATIONS.directMessage,
        // participants filter: reporter and sender are in the conversation.
        conversation: { model: 'conversation', from: 'conversationId', to: 'id' },
      },
      conversation: { participants: { model: 'conversationParticipant', from: 'id', to: 'conversationId', many: true } },
    },
  )
}

function build(prisma = world(), opts: { channelReadable?: boolean; channelClub?: string } = {}) {
  prisma.tables.conversationParticipant = [
    { conversationId: 'conv', userId: 'reporter' },
    { conversationId: 'conv', userId: 'sender' },
  ]
  const teams = { assertReadableAccess: jest.fn().mockResolvedValue({}) }
  const channels = {
    assertReadableChannel: jest.fn(async () => {
      if (opts.channelReadable === false) throw new ForbiddenException('You cannot view this channel')
      return { channel: { clubId: opts.channelClub ?? 'albatros' } }
    }),
  }
  const push = { sendToUserLocalized: jest.fn().mockResolvedValue(undefined) }
  const alerter = { alert: jest.fn().mockResolvedValue(undefined) }
  const service = new ModerationService(
    prisma as never,
    teams as never,
    channels as never,
    push as never,
    alerter as never,
  )
  return { prisma, teams, channels, push, alerter, service }
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

describe('ModerationService channel-message reports', () => {
  it('keeps the message and stores immutable evidence (incl. attachment) under the message lock', async () => {
    const { prisma, service } = build()
    await expect(service.reportMessage('reporter', 'm-player', { reason: 'ABUSE' })).resolves.toEqual({
      ok: true,
      hidden: false,
    })
    expect(prisma.tables.messageReport).toEqual([
      expect.objectContaining({
        messageId: 'm-player',
        reporterUserId: 'reporter',
        reason: 'ABUSE',
        evidenceContent: 'Wichtige Info',
        evidenceAttachmentUrl: 'https://assets.anstoss.io/chat/albatros/u15/image/a.png',
      }),
    ])
    expect(prisma.tables.message[0].deletedAt).toBeNull()
    expect(prisma.locks.some((l) => l.includes('chat-message:m-player'))).toBe(true)
  })

  it('H6: authorises through the channel access check, not the anchor team', async () => {
    const { teams, channels, service } = build(world(), { channelReadable: false })
    await expect(
      service.reportMessage('reporter', 'm-player', { reason: 'ABUSE' }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(channels.assertReadableChannel).toHaveBeenCalledWith('reporter', 'club-chan')
    expect(teams.assertReadableAccess).not.toHaveBeenCalled()
  })

  it('H6: refuses a channel of another club', async () => {
    const { service } = build(world(), { channelClub: 'babelsberg' })
    await expect(
      service.reportMessage('reporter', 'm-player', { reason: 'ABUSE' }),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('rejects unknown reasons and the sender reporting themselves', async () => {
    const { service } = build()
    await expect(service.reportMessage('reporter', 'm-player', { reason: 'MEH' })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    await expect(service.reportMessage('sender', 'm-player', { reason: 'SPAM' })).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })
})

describe('ModerationService escalation (M6)', () => {
  it('SAFEGUARDING goes straight to the platform queue with an immediate alert; no club push', async () => {
    const { prisma, push, alerter, service } = build()
    await service.reportMessage('reporter', 'm-player', { reason: 'safeguarding' })
    await flush()
    expect(prisma.tables.messageReport[0]).toEqual(
      expect.objectContaining({ escalationReason: 'safeguarding', escalatedAt: expect.any(Date) }),
    )
    expect(alerter.alert).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'safeguarding', clubId: 'albatros' }),
    )
    expect(push.sendToUserLocalized).not.toHaveBeenCalled()
  })

  it('a report about a team coach is escalated and club admins are not told', async () => {
    const { prisma, push, alerter, service } = build()
    await service.reportMessage('reporter', 'm-coach', { reason: 'ABUSE' })
    await flush()
    expect(prisma.tables.messageReport[0].escalationReason).toBe('staff_sender')
    expect(alerter.alert).toHaveBeenCalledWith(expect.objectContaining({ reason: 'staff_sender' }))
    expect(push.sendToUserLocalized).not.toHaveBeenCalled()
  })

  it('a report about a club admin (membership role) is escalated', async () => {
    const prisma = world()
    prisma.tables.message[1].senderId = 'admin-2'
    const { service } = build(prisma)
    await service.reportMessage('reporter', 'm-coach', { reason: 'ABUSE' })
    expect(prisma.tables.messageReport[0].escalationReason).toBe('staff_sender')
  })
})

describe('ModerationService direct-message reports', () => {
  it('stores the report with the DM attachment as evidence, only for participants', async () => {
    const { prisma, service } = build()
    await expect(service.reportDirectMessage('reporter', 'dm-1', { reason: 'ABUSE' })).resolves.toEqual({
      ok: true,
    })
    expect(prisma.tables.directMessageReport).toEqual([
      expect.objectContaining({
        directMessageId: 'dm-1',
        evidenceContent: 'Preserved abusive content',
        evidenceAttachmentUrl: 'https://cdn.example/dm/a.jpg',
      }),
    ])
    await expect(
      service.reportDirectMessage('outsider', 'dm-1', { reason: 'SPAM' }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('ModerationService report notifications (L2)', () => {
  afterEach(() => jest.useRealTimers())

  it('pushes club owners/admins except reporter and sender', async () => {
    const { push, service } = build()
    await service.reportMessage('reporter', 'm-player', { reason: 'ABUSE' })
    await flush()
    expect(push.sendToUserLocalized.mock.calls.map((c) => c[0]).sort()).toEqual(['admin-1', 'admin-2'])
    expect(push.sendToUserLocalized).toHaveBeenCalledWith(
      'admin-1',
      'MODERATION_REPORT_CREATED',
      { clubName: 'SV Albatros' },
      { type: 'moderation_report', clubId: 'albatros' },
      { clubId: 'albatros' },
    )
  })

  it('batches further reports in the window into one summary push', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] })
    const prisma = world()
    prisma.tables.message.push(
      { id: 'm2', clubId: 'albatros', teamId: 'u15', channelId: 'club-chan', senderId: 'sender', deletedAt: null, content: 'b' },
      { id: 'm3', clubId: 'albatros', teamId: 'u15', channelId: 'club-chan', senderId: 'sender', deletedAt: null, content: 'c' },
    )
    const { push, service } = build(prisma)
    await service.reportMessage('reporter', 'm-player', { reason: 'ABUSE' })
    await service.reportMessage('reporter', 'm2', { reason: 'SPAM' })
    await service.reportMessage('reporter', 'm3', { reason: 'SPAM' })
    await flush()
    expect(push.sendToUserLocalized).toHaveBeenCalledTimes(2) // one per admin
    jest.advanceTimersByTime(10 * 60 * 1000)
    await flush()
    await flush()
    expect(push.sendToUserLocalized).toHaveBeenCalledWith(
      'admin-1',
      'MODERATION_REPORTS_BATCH',
      { clubName: 'SV Albatros', count: 2 },
      expect.anything(),
      expect.anything(),
    )
  })

  it('does not notify again for a duplicate report, and a push failure never fails the report', async () => {
    const { push, service } = build()
    push.sendToUserLocalized.mockRejectedValue(new Error('expo down'))
    await expect(service.reportMessage('reporter', 'm-player', { reason: 'SPAM' })).resolves.toEqual({
      ok: true,
      hidden: false,
    })
    const prisma = world()
    prisma.messageReport.create.mockRejectedValue({ code: 'P2002' })
    const second = build(prisma)
    await second.service.reportMessage('reporter', 'm-player', { reason: 'SPAM' })
    await flush()
    expect(second.push.sendToUserLocalized).not.toHaveBeenCalled()
  })
})
