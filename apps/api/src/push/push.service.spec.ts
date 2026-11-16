import { Test, TestingModule } from '@nestjs/testing'
import { PushService } from './push.service'
import { PrismaService } from '../prisma/prisma.service'

describe('PushService', () => {
  let service: PushService
  let prisma: {
    teamAccess: { findMany: jest.Mock }
    pushToken: { findMany: jest.Mock; deleteMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; updateMany: jest.Mock }
    notificationPreference: { findMany: jest.Mock }
    channel: { findUnique: jest.Mock }
  }
  let notificationsService: {
    getMutedUserIds: jest.Mock
    isInQuietHours: jest.Mock
  }

  beforeEach(async () => {
    prisma = {
      teamAccess: { findMany: jest.fn() },
      pushToken: { findMany: jest.fn(), deleteMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
      notificationPreference: { findMany: jest.fn().mockResolvedValue([]) },
      channel: { findUnique: jest.fn().mockResolvedValue({ archivedAt: null }) },
    }

    notificationsService = {
      getMutedUserIds: jest.fn().mockResolvedValue(new Set()),
      isInQuietHours: jest.fn().mockResolvedValue(false),
    }

    // Mock global fetch for Expo Push API
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    })

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushService,
        { provide: PrismaService, useValue: prisma },
        { provide: 'NotificationsService', useValue: notificationsService },
      ],
    }).compile()

    service = module.get(PushService)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('sendToTeam', () => {
    it('sends push to active team members', async () => {
      prisma.teamAccess.findMany.mockResolvedValue([
        { userId: 'u1', clubId: 'c1' },
        { userId: 'u2', clubId: 'c1' },
      ])
      prisma.pushToken.findMany.mockResolvedValue([{ token: 'tok1' }, { token: 'tok2' }])

      await service.sendToTeam('t1', 'Title', 'Body', undefined, undefined, {
        clubId: 'c1',
        category: 'chat',
      })

      expect(prisma.teamAccess.findMany).toHaveBeenCalledWith({
        where: {
          teamId: 't1',
          status: 'ACTIVE',
          OR: [{ loanEndDate: null }, { loanEndDate: { gt: expect.any(Date) } }],
        },
        select: { userId: true, clubId: true },
      })

      expect(global.fetch).toHaveBeenCalledTimes(1)
      const [, options] = (global.fetch as jest.Mock).mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body).toHaveLength(2)
    })

    it('excludes muted users', async () => {
      prisma.teamAccess.findMany.mockResolvedValue([
        { userId: 'u1', clubId: 'c1' },
        { userId: 'u2', clubId: 'c1' },
      ])
      notificationsService.getMutedUserIds.mockResolvedValue(new Set(['u1']))
      prisma.pushToken.findMany.mockResolvedValue([{ token: 'tok2' }])

      await service.sendToTeam('t1', 'Title', 'Body', undefined, undefined, {
        clubId: 'c1',
        category: 'chat',
      })

      // Only u2's tokens should be queried
      expect(prisma.pushToken.findMany).toHaveBeenCalledWith({
        where: { userId: { in: ['u2'] } },
        select: { token: true },
      })
    })

    it('excludes users in quiet hours', async () => {
      prisma.teamAccess.findMany.mockResolvedValue([
        { userId: 'u1', clubId: 'c1' },
        { userId: 'u2', clubId: 'c1' },
      ])

      // u1 is in quiet hours
      const now = new Date()
      const startHour = now.getHours()
      const start = `${String(startHour).padStart(2, '0')}:00`
      const end = `${String((startHour + 2) % 24).padStart(2, '0')}:00`

      prisma.notificationPreference.findMany.mockResolvedValue([
        { userId: 'u1', quietStart: start, quietEnd: end },
      ])
      prisma.pushToken.findMany.mockResolvedValue([{ token: 'tok2' }])

      await service.sendToTeam('t1', 'Title', 'Body', undefined, undefined, {
        clubId: 'c1',
        category: 'chat',
      })

      // Only u2's tokens should be queried
      expect(prisma.pushToken.findMany).toHaveBeenCalledWith({
        where: { userId: { in: ['u2'] } },
        select: { token: true },
      })
    })

    it('does not send if all users are excluded', async () => {
      prisma.teamAccess.findMany.mockResolvedValue([{ userId: 'u1', clubId: 'c1' }])
      notificationsService.getMutedUserIds.mockResolvedValue(new Set(['u1']))

      await service.sendToTeam('t1', 'Title', 'Body', undefined, undefined, {
        clubId: 'c1',
        category: 'chat',
      })

      expect(prisma.pushToken.findMany).not.toHaveBeenCalled()
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('excludes specified user', async () => {
      prisma.teamAccess.findMany.mockResolvedValue([
        { userId: 'u1', clubId: 'c1' },
        { userId: 'u2', clubId: 'c1' },
      ])
      prisma.pushToken.findMany.mockResolvedValue([{ token: 'tok2' }])
      prisma.notificationPreference.findMany.mockResolvedValue([])

      await service.sendToTeam('t1', 'Title', 'Body', undefined, 'u1', {
        clubId: 'c1',
        category: 'events',
      })

      expect(prisma.pushToken.findMany).toHaveBeenCalledWith({
        where: { userId: { in: ['u2'] } },
        select: { token: true },
      })
    })
  })

  describe('sendToUser', () => {
    it('reports accepted tickets without claiming device delivery', async () => {
      prisma.pushToken.findMany.mockResolvedValue([{ token: 'test-token' }])
      jest.mocked(global.fetch).mockResolvedValue({ ok: true,
        json: async () => ({ data: [{ status: 'ok', id: 'test-ticket' }] }) } as Response)
      await expect(service.sendToUser('u1', 'Title', 'Body')).resolves.toEqual({ acceptedCount: 1 })
    })
    it('reports zero acceptance after provider rejection', async () => {
      prisma.pushToken.findMany.mockResolvedValue([{ token: 'test-token' }])
      jest.mocked(global.fetch).mockResolvedValue({ ok: false, status: 503 } as Response)
      await expect(service.sendToUser('u1', 'Title', 'Body')).resolves.toEqual({ acceptedCount: 0 })
    })
    it('reports zero acceptance when no device token exists', async () => {
      prisma.pushToken.findMany.mockResolvedValue([])
      await expect(service.sendToUser('u1', 'Title', 'Body')).resolves.toEqual({ acceptedCount: 0 })
      expect(global.fetch).not.toHaveBeenCalled()
    })
    it('sends push to user', async () => {
      prisma.pushToken.findMany.mockResolvedValue([{ token: 'tok1' }])

      await service.sendToUser('u1', 'Title', 'Body')

      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it('skips user in quiet hours', async () => {
      notificationsService.isInQuietHours.mockResolvedValue(true)

      await service.sendToUser('u1', 'Title', 'Body', undefined, {
        clubId: 'c1',
      })

      expect(prisma.pushToken.findMany).not.toHaveBeenCalled()
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('does not check quiet hours when no clubId', async () => {
      prisma.pushToken.findMany.mockResolvedValue([{ token: 'tok1' }])

      await service.sendToUser('u1', 'Title', 'Body')

      expect(notificationsService.isInQuietHours).not.toHaveBeenCalled()
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('registerToken', () => {
    it('creates a token and returns only its lease', async () => {
      prisma.pushToken.findUnique.mockResolvedValue(null)
      prisma.pushToken.create.mockResolvedValue({ id: 'registration', updatedAt: new Date(0) })
      await expect(service.registerToken('u1', 'tok1', 'ios', null)).resolves.toEqual({
        id: 'registration', updatedAt: new Date(0).toISOString(),
      })
      expect(prisma.pushToken.create).toHaveBeenCalledWith({ data: { userId: 'u1', token: 'tok1', platform: 'ios' } })
    })
    it('does not delete a registration on a legacy unversioned logout', async () => {
      await expect(service.removeToken('tok1', 'u1')).resolves.toEqual({ count: 0 })
      expect(prisma.pushToken.deleteMany).not.toHaveBeenCalled()
    })
  })

  it('drops archived-channel notifications before inbox persistence or delivery', async () => {
    prisma.channel.findUnique.mockResolvedValue({ archivedAt: new Date() })
    const inbox = { record: jest.fn() }
    const guarded = new PushService(prisma as never, undefined, undefined, inbox as never)
    await guarded.sendToUserLocalized('u1', 'ANNOUNCEMENT' as never, {} as never, { channelId: 'closed', clubId: 'c1' })
    expect(inbox.record).not.toHaveBeenCalled()
    expect(prisma.pushToken.findMany).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('stops the remaining broadcast batches when the channel closes', async () => {
    const tokens = Array.from({ length: 101 }, (_, index) => `token-${index}`)
    prisma.pushToken.findMany.mockResolvedValue([])
    ;(global.fetch as jest.Mock).mockImplementation(async () => {
      prisma.channel.findUnique.mockResolvedValue({ archivedAt: new Date() })
      return { ok: true, json: async () => ({ data: [] }) }
    })
    await service.sendToTokens(tokens, 'Title', 'Body', { channelId: 'closed-between-batches' })
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(prisma.channel.findUnique).toHaveBeenCalledTimes(2)
  })

  describe('checkReceipts', () => {
    const registration = (token: string) => ({ id: `row-${token}`, token, userId: 'user-a', updatedAt: new Date('2026-11-16T10:00:00Z') })
    it('deletes the token whose receipt returns DeviceNotRegistered', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              'ticket-dead': {
                status: 'error',
                details: { error: 'DeviceNotRegistered' },
              },
              'ticket-ok': { status: 'ok' },
            },
          }),
      })

      prisma.pushToken.deleteMany.mockResolvedValue({ count: 1 })

      await service.checkReceipts(
        new Map([
          ['ticket-dead', registration('dead-token')],
          ['ticket-ok', registration('good-token')],
        ]),
      )

      expect(global.fetch).toHaveBeenCalledWith(
        'https://exp.host/--/api/v2/push/getReceipts',
        expect.objectContaining({ method: 'POST' }),
      )
      expect(prisma.pushToken.deleteMany).toHaveBeenCalledWith({
        where: { OR: [registration('dead-token')] },
      })
    })

    it('does nothing when there are no tickets', async () => {
      await service.checkReceipts(new Map())
      expect(global.fetch).not.toHaveBeenCalled()
      expect(prisma.pushToken.deleteMany).not.toHaveBeenCalled()
    })

    it('swallows network errors', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValue(new Error('network down'))
      await expect(service.checkReceipts(new Map([['t1', registration('tok1')]]))).resolves.toBeUndefined()
      expect(prisma.pushToken.deleteMany).not.toHaveBeenCalled()
    })

    it.each(['refreshed', 'transferred', 'recreated'])('retains a %s registration when an old receipt reports a dead device', async (change) => {
      const original = registration('same-token')
      const current = { ...original,
        ...(change === 'refreshed' ? { updatedAt: new Date('2026-11-16T10:01:00Z') } : {}),
        ...(change === 'transferred' ? { userId: 'user-b' } : {}),
        ...(change === 'recreated' ? { id: 'new-row' } : {}),
      }
      let deleted = false
      prisma.pushToken.deleteMany.mockImplementation(async ({ where }) => {
        deleted = where.OR.some((candidate: typeof original) => candidate.id === current.id &&
          candidate.token === current.token && candidate.userId === current.userId &&
          candidate.updatedAt.getTime() === current.updatedAt.getTime())
        return { count: deleted ? 1 : 0 }
      })
      ;(global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ data: {
        ticket: { status: 'error', details: { error: 'DeviceNotRegistered' } },
      } }) })
      await service.checkReceipts(new Map([['ticket', original]]))
      expect(deleted).toBe(false)
      expect(prisma.pushToken.deleteMany).toHaveBeenCalledWith({ where: { OR: [original] } })
    })

    it.each(['user', 'broadcast'])('uses the pre-send registration snapshot for an immediate %s error', async kind => {
      const original = registration('same-token')
      prisma.pushToken.findMany.mockResolvedValue([original])
      prisma.pushToken.deleteMany.mockResolvedValue({ count: 0 })
      ;(global.fetch as jest.Mock).mockImplementation(async () => {
        // Registration rotates while Expo handles the outgoing request.
        prisma.pushToken.findMany.mockResolvedValue([{ ...original, userId: 'user-b', updatedAt: new Date() }])
        return { ok: true, json: async () => ({ data: [
          { status: 'error', details: { error: 'DeviceNotRegistered' } },
        ] }) }
      })
      if (kind === 'user') await service.sendToUser('user-a', 'Title', 'Body')
      else await service.sendToTokens([original.token], 'Title', 'Body')
      expect(prisma.pushToken.deleteMany).toHaveBeenCalledWith({ where: { OR: [original] } })
    })
  })
})
