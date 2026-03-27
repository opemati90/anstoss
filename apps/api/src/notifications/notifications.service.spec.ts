import { Test, TestingModule } from '@nestjs/testing'
import { NotificationsService } from './notifications.service'
import { PrismaService } from '../prisma/prisma.service'

describe('NotificationsService', () => {
  let service: NotificationsService
  let prisma: {
    notificationPreference: {
      findMany: jest.Mock
      upsert: jest.Mock
    }
  }

  beforeEach(async () => {
    prisma = {
      notificationPreference: {
        findMany: jest.fn(),
        upsert: jest.fn(),
      },
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile()

    service = module.get(NotificationsService)
  })

  describe('getPreferences', () => {
    it('returns preferences for user and club', async () => {
      const mockPrefs = [
        { id: '1', userId: 'u1', clubId: 'c1', teamId: null, mutedChat: true },
      ]
      prisma.notificationPreference.findMany.mockResolvedValue(mockPrefs)

      const result = await service.getPreferences('u1', 'c1')
      expect(result).toEqual(mockPrefs)
      expect(prisma.notificationPreference.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1', clubId: 'c1' },
        orderBy: { createdAt: 'asc' },
      })
    })
  })

  describe('upsertPreference', () => {
    it('upserts with team-specific scope', async () => {
      const mockResult = { id: '1', mutedChat: true }
      prisma.notificationPreference.upsert.mockResolvedValue(mockResult)

      const result = await service.upsertPreference('u1', 'c1', {
        teamId: 't1',
        mutedChat: true,
      })

      expect(result).toEqual(mockResult)
      expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_clubId_teamId: { userId: 'u1', clubId: 'c1', teamId: 't1' },
          },
          create: expect.objectContaining({
            userId: 'u1',
            clubId: 'c1',
            teamId: 't1',
            mutedChat: true,
          }),
        }),
      )
    })

    it('upserts club-wide preference when no teamId', async () => {
      prisma.notificationPreference.upsert.mockResolvedValue({ id: '2' })

      await service.upsertPreference('u1', 'c1', {
        mutedEvents: true,
      })

      expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_clubId_teamId: { userId: 'u1', clubId: 'c1', teamId: null },
          },
          create: expect.objectContaining({
            teamId: null,
            mutedEvents: true,
          }),
        }),
      )
    })
  })

  describe('getMutedUserIds', () => {
    it('returns set of user IDs with muted chat', async () => {
      prisma.notificationPreference.findMany.mockResolvedValue([
        { userId: 'u1' },
        { userId: 'u2' },
      ])

      const result = await service.getMutedUserIds('c1', 't1', 'chat')

      expect(result).toEqual(new Set(['u1', 'u2']))
      expect(prisma.notificationPreference.findMany).toHaveBeenCalledWith({
        where: {
          clubId: 'c1',
          OR: [{ teamId: 't1' }, { teamId: null }],
          mutedChat: true,
        },
        select: { userId: true },
      })
    })

    it('maps events category to mutedEvents field', async () => {
      prisma.notificationPreference.findMany.mockResolvedValue([])

      await service.getMutedUserIds('c1', 't1', 'events')

      expect(prisma.notificationPreference.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ mutedEvents: true }),
        }),
      )
    })

    it('maps announcements category to mutedAnnouncements field', async () => {
      prisma.notificationPreference.findMany.mockResolvedValue([])

      await service.getMutedUserIds('c1', 't1', 'announcements')

      expect(prisma.notificationPreference.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ mutedAnnouncements: true }),
        }),
      )
    })
  })

  describe('isInQuietHours', () => {
    it('returns false when no quiet hours configured', async () => {
      prisma.notificationPreference.findMany.mockResolvedValue([])

      expect(await service.isInQuietHours('u1', 'c1')).toBe(false)
    })

    it('returns true when current time is within quiet range', async () => {
      const now = new Date()
      const startHour = now.getHours()
      const start = `${String(startHour).padStart(2, '0')}:00`
      const end = `${String((startHour + 2) % 24).padStart(2, '0')}:00`

      prisma.notificationPreference.findMany.mockResolvedValue([
        { quietStart: start, quietEnd: end },
      ])

      expect(await service.isInQuietHours('u1', 'c1')).toBe(true)
    })

    it('returns false when current time is outside quiet range', async () => {
      const now = new Date()
      const futureHour = (now.getHours() + 4) % 24
      const start = `${String(futureHour).padStart(2, '0')}:00`
      const end = `${String((futureHour + 2) % 24).padStart(2, '0')}:00`

      prisma.notificationPreference.findMany.mockResolvedValue([
        { quietStart: start, quietEnd: end },
      ])

      expect(await service.isInQuietHours('u1', 'c1')).toBe(false)
    })

    it('handles overnight quiet hours (e.g. 22:00 to 07:00)', async () => {
      const now = new Date()
      // Set range that wraps midnight and includes current time
      const currentHour = now.getHours()
      // Start 1 hour before current, end 1 hour after
      const start = `${String((currentHour - 1 + 24) % 24).padStart(2, '0')}:00`
      const end = `${String((currentHour + 1) % 24).padStart(2, '0')}:00`

      prisma.notificationPreference.findMany.mockResolvedValue([
        { quietStart: start, quietEnd: end },
      ])

      // This should be true whether or not it wraps midnight
      expect(await service.isInQuietHours('u1', 'c1')).toBe(true)
    })
  })
})
