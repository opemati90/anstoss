import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { DmController } from '../src/dm/dm.controller'
import { DmService } from '../src/dm/dm.service'
import { ClerkAuthGuard } from '../src/auth/clerk.guard'
import { PrismaService } from '../src/prisma/prisma.service'

describe('DM Flow (e2e)', () => {
  let app: INestApplication
  let baseUrl: string

  const mockConversation = {
    id: 'conv-1',
    clubId: 'club-1',
    participants: ['user-1', 'user-2'],
    lastMessageAt: new Date().toISOString(),
  }

  const mockMessages = [
    { id: 'msg-1', conversationId: 'conv-1', senderId: 'user-1', text: 'Hallo!' },
    { id: 'msg-2', conversationId: 'conv-1', senderId: 'user-2', text: 'Hi!' },
  ]

  const dmService = {
    listConversations: jest.fn().mockResolvedValue([mockConversation]),
    findOrCreateConversation: jest.fn().mockResolvedValue(mockConversation),
    getMessages: jest.fn().mockResolvedValue(mockMessages),
    markAsRead: jest.fn().mockResolvedValue({ success: true }),
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
      controllers: [DmController],
      providers: [
        { provide: DmService, useValue: dmService },
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

  it('GET /clubs/:clubId/conversations — lists conversations', async () => {
    const res = await fetch(`${baseUrl}/clubs/club-1/conversations`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe('conv-1')
    expect(dmService.listConversations).toHaveBeenCalledWith('user-1', 'club-1')
  })

  it('POST /clubs/:clubId/conversations — creates or finds a conversation', async () => {
    const res = await fetch(`${baseUrl}/clubs/club-1/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantId: 'user-2' }),
    })
    expect(res.status).toBe(201)

    const body = await res.json()
    expect(body.id).toBe('conv-1')
    expect(body.participants).toContain('user-2')
    expect(dmService.findOrCreateConversation).toHaveBeenCalledWith(
      'user-1',
      'club-1',
      'user-2',
    )
  })

  it('GET /clubs/:clubId/conversations/:conversationId/messages — gets messages', async () => {
    const res = await fetch(`${baseUrl}/clubs/club-1/conversations/conv-1/messages`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(2)
    expect(body[0].text).toBe('Hallo!')
    expect(dmService.getMessages).toHaveBeenCalledWith('user-1', 'conv-1', undefined)
  })

  it('PUT /clubs/:clubId/conversations/:conversationId/read — marks as read', async () => {
    const res = await fetch(`${baseUrl}/clubs/club-1/conversations/conv-1/read`, {
      method: 'PUT',
    })
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.success).toBe(true)
    expect(dmService.markAsRead).toHaveBeenCalledWith('user-1', 'conv-1')
  })
})
