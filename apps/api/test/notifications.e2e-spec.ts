import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { NotificationsController } from '../src/notifications/notifications.controller'
import { NotificationsService } from '../src/notifications/notifications.service'
import { ClerkAuthGuard } from '../src/auth/clerk.guard'
import { PrismaService } from '../src/prisma/prisma.service'

describe('Notifications (e2e)', () => {
  let app: INestApplication
  let baseUrl: string

  const mockPreferences = {
    userId: 'user-1',
    clubId: 'club-1',
    eventReminders: true,
    chatMessages: true,
    rosterChanges: false,
  }

  const notificationsService = {
    getPreferences: jest.fn().mockResolvedValue(mockPreferences),
    upsertPreference: jest.fn().mockResolvedValue({
      ...mockPreferences,
      rosterChanges: true,
    }),
  }

  // Stub guard that always allows AND injects req.user
  const authGuard = {
    canActivate: (ctx: any) => {
      const req = ctx.switchToHttp().getRequest()
      req.user = { id: 'user-1' }
      return true
    },
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        { provide: NotificationsService, useValue: notificationsService },
        { provide: PrismaService, useValue: {} },
      ],
    })
      .overrideGuard(ClerkAuthGuard)
      .useValue(authGuard)
      .compile()

    app = moduleRef.createNestApplication()
    await app.listen(0)

    const address = app.getHttpServer().address()
    if (!address || typeof address === 'string') {
      throw new Error('Failed to resolve e2e server address')
    }
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('GET /clubs/:clubId/notification-preferences — gets preferences', async () => {
    const res = await fetch(`${baseUrl}/clubs/club-1/notification-preferences`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.userId).toBe('user-1')
    expect(body.eventReminders).toBe(true)
    expect(body.rosterChanges).toBe(false)
    expect(notificationsService.getPreferences).toHaveBeenCalledWith(
      'user-1',
      'club-1',
    )
  })

  it('PUT /clubs/:clubId/notification-preferences — upserts preferences', async () => {
    const res = await fetch(`${baseUrl}/clubs/club-1/notification-preferences`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventReminders: true,
        chatMessages: true,
        rosterChanges: true,
      }),
    })
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.rosterChanges).toBe(true)
    expect(notificationsService.upsertPreference).toHaveBeenCalled()
  })
})
