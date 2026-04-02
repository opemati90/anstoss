import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { MessagesController } from '../src/messages/messages.controller'
import { MessagesService } from '../src/messages/messages.service'
import { ClerkAuthGuard } from '../src/auth/clerk.guard'
import { PrismaService } from '../src/prisma/prisma.service'

describe('Messages (e2e)', () => {
  let app: INestApplication
  let baseUrl: string

  const mockPinnedMessage = {
    id: 'msg-1',
    teamId: 'team-1',
    text: 'Training morgen um 18 Uhr!',
    pinnedAt: new Date().toISOString(),
    pinnedBy: 'user-1',
  }

  const messagesService = {
    pinMessage: jest.fn().mockResolvedValue(mockPinnedMessage),
    unpinMessage: jest.fn().mockResolvedValue({ success: true }),
    getPinnedMessage: jest.fn().mockResolvedValue(mockPinnedMessage),
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
      controllers: [MessagesController],
      providers: [
        { provide: MessagesService, useValue: messagesService },
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

  it('PATCH /clubs/:clubId/teams/:teamId/messages/:messageId/pin — pins a message', async () => {
    const res = await fetch(
      `${baseUrl}/clubs/club-1/teams/team-1/messages/msg-1/pin`,
      { method: 'PATCH' },
    )
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.id).toBe('msg-1')
    expect(body.pinnedBy).toBe('user-1')
    expect(messagesService.pinMessage).toHaveBeenCalledWith(
      'msg-1',
      'team-1',
      'user-1',
    )
  })

  it('PATCH /clubs/:clubId/teams/:teamId/messages/:messageId/unpin — unpins a message', async () => {
    const res = await fetch(
      `${baseUrl}/clubs/club-1/teams/team-1/messages/msg-1/unpin`,
      { method: 'PATCH' },
    )
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.success).toBe(true)
    expect(messagesService.unpinMessage).toHaveBeenCalledWith(
      'msg-1',
      'team-1',
      'user-1',
    )
  })

  it('GET /clubs/:clubId/teams/:teamId/messages/pinned — gets pinned message', async () => {
    const res = await fetch(
      `${baseUrl}/clubs/club-1/teams/team-1/messages/pinned`,
    )
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.id).toBe('msg-1')
    expect(body.text).toBe('Training morgen um 18 Uhr!')
    expect(messagesService.getPinnedMessage).toHaveBeenCalledWith(
      'team-1',
      'user-1',
    )
  })
})
