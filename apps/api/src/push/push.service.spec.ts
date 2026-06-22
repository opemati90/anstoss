import { Test, TestingModule } from '@nestjs/testing'
import { PushService } from './push.service'
import { PrismaService } from '../prisma/prisma.service'

describe('PushService', () => {
  let service: PushService
  let prisma: {
    teamAccess: { findMany: jest.Mock }
    pushToken: { findMany: jest.Mock; deleteMany: jest.Mock }
    notificationPreference: { findMany: jest.Mock }
  }
  let notificationsService: {
    getMutedUserIds: jest.Mock
    isInQuietHours: jest.Mock
  }

  beforeEach(async () => {
    prisma = {
      teamAccess: { findMany: jest.fn() },
      pushToken: { findMany: jest.fn(), deleteMany: jest.fn() },
      notificationPreference: { findMany: jest.fn().mockResolvedValue([]) },
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
      prisma.pushToken.findMany.mockResolvedValue([
        { token: 'tok1' },
        { token: 'tok2' },
      ])

      await service.sendToTeam('t1', 'Title', 'Body', undefined, undefined, {
        clubId: 'c1',
        category: 'chat',
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
      prisma.teamAccess.findMany.mockResolvedValue([
        { userId: 'u1', clubId: 'c1' },
      ])
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
    let prismaWithUpsert: typeof prisma & {
      pushToken: typeof prisma.pushToken & { upsert: jest.Mock }
    }

    beforeEach(() => {
      prismaWithUpsert = prisma as typeof prismaWithUpsert
      prismaWithUpsert.pushToken.upsert = jest.fn()
    })

    it('upserts token', async () => {
      prismaWithUpsert.pushToken.upsert.mockResolvedValue({
        token: 'tok1',
        userId: 'u1',
      })

      await service.registerToken('u1', 'tok1', 'ios')

      expect(prismaWithUpsert.pushToken.upsert).toHaveBeenCalledWith({
        where: { token: 'tok1' },
        create: { userId: 'u1', token: 'tok1', platform: 'ios' },
        update: expect.objectContaining({
          userId: 'u1',
          platform: 'ios',
        }),
      })
    })
  })

  describe('checkReceipts', () => {
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
          ['ticket-dead', 'dead-token'],
          ['ticket-ok', 'good-token'],
        ]),
      )

      expect(global.fetch).toHaveBeenCalledWith(
        'https://exp.host/--/api/v2/push/getReceipts',
        expect.objectContaining({ method: 'POST' }),
      )
      expect(prisma.pushToken.deleteMany).toHaveBeenCalledWith({
        where: { token: { in: ['dead-token'] } },
      })
    })

    it('does nothing when there are no tickets', async () => {
      await service.checkReceipts(new Map())
      expect(global.fetch).not.toHaveBeenCalled()
      expect(prisma.pushToken.deleteMany).not.toHaveBeenCalled()
    })

    it('swallows network errors', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValue(new Error('network down'))
      await expect(
        service.checkReceipts(new Map([['t1', 'tok1']])),
      ).resolves.toBeUndefined()
      expect(prisma.pushToken.deleteMany).not.toHaveBeenCalled()
    })
  })
})
