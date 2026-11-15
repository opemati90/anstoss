import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { createSupportTicketSchema, supportReplySchema } from '@anstoss/shared'
import { FakePrisma } from '../test-utils/fake-prisma'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { PlatformAdminGuard } from '../admin/platform-admin.guard'
import { SupportController, SupportAdminController } from './support.controller'
import { SupportService } from './support.service'

const actor = {
  id: 'admin',
  email: 'admin@example.invalid',
  name: 'Support',
  authMethod: 'session' as const,
}
const input = {
  requestId: 'aab47e9f-b803-49c8-8839-626e7c3865e0',
  category: 'BUG' as const,
  subject: 'Chat keyboard',
  body: 'Messages disappear on keyboard open.',
}
function setup() {
  const db = new FakePrisma(
    {
      user: {},
      auditLog: {},
      supportMessage: {},
      supportTicket: {
        messages: { kind: 'many', model: 'supportMessage', to: 'ticketId' },
      },
    },
    {
      user: [{ id: 'player', deletedAt: null }],
      supportTicket: [
        {
          id: 'ticket',
          requesterId: 'player',
          requestId: 'old',
          status: 'OPEN',
          subject: 'Private problem',
          category: 'BUG',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      supportMessage: [
        {
          id: 'message',
          ticketId: 'ticket',
          requestId: 'first',
          fromSupport: false,
          body: 'Private report',
          createdAt: new Date(),
        },
      ],
    },
  )
  return { db, service: new SupportService(db as never) }
}

describe('User support boundaries', () => {
  it('requires separate app and platform-admin authentication', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, SupportController)).toEqual([ClerkAuthGuard])
    expect(Reflect.getMetadata(GUARDS_METADATA, SupportAdminController)).toEqual([
      PlatformAdminGuard,
    ])
  })
  it('does not require club membership and scopes private history to its requester', async () => {
    const { service } = setup()
    expect(await service.listForUser('other', 0)).toEqual([])
    expect(await service.listForUser('player', 0)).toHaveLength(1)
    await expect(service.detail('ticket', 'other')).rejects.toThrow(NotFoundException)
    expect((await service.detail('ticket', 'player')).messages).toHaveLength(1)
  })
  it('rejects replies to another user’s ticket before writes', async () => {
    const { service, db } = setup()
    await expect(service.reply('ticket', input, 'other')).rejects.toThrow(NotFoundException)
    await expect(service.reply('ticket', input, null)).rejects.toThrow(UnauthorizedException)
    expect(db.rows('supportMessage')).toHaveLength(1)
    expect(db.rows('auditLog')).toHaveLength(0)
  })
  it('retries a support reply once, audits no private text and lets the user reopen it', async () => {
    const { service, db } = setup()
    const reply = { requestId: input.requestId, body: 'Please update your app.' }
    await service.reply('ticket', reply, null, actor)
    await service.reply('ticket', reply, null, actor)
    expect(db.rows('supportMessage')).toHaveLength(2)
    expect(db.rows('supportTicket')[0].status).toBe('WAITING')
    expect(db.rows('auditLog')).toHaveLength(1)
    expect(JSON.stringify(db.rows('auditLog'))).not.toContain(reply.body)
    await service.setStatus('ticket', 'RESOLVED', actor)
    await service.reply('ticket', { requestId: 'user-reply', body: 'It still happens.' }, 'player')
    expect(db.rows('supportTicket')[0].status).toBe('OPEN')
    expect(db.rows('supportMessage')[2].fromSupport).toBe(false)
  })
  it('does not let user-supplied IDs impersonate a staff reply', async () => {
    const { service } = setup()
    await service.reply('ticket', input, null, actor)
    await expect(service.reply('ticket', input, 'player')).rejects.toThrow(ConflictException)
  })
  it('makes request creation retry-safe and rejects erased accounts', async () => {
    const { service, db } = setup()
    await service.create('player', input)
    await service.create('player', input)
    expect(db.rows('supportTicket')).toHaveLength(2)
    db.rows('user')[0].deletedAt = new Date()
    await expect(service.create('player', input)).rejects.toThrow(UnauthorizedException)
  })
  it('caps daily new requests', async () => {
    const { service, db } = setup()
    db.tables.supportTicket = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      requesterId: 'player',
      requestId: String(i),
      createdAt: new Date(),
    }))
    await expect(service.create('player', input)).rejects.toThrow(ConflictException)
  })
  it('validates limits and refuses requester/admin fields from the client', () => {
    expect(createSupportTicketSchema.safeParse(input).success).toBe(true)
    expect(createSupportTicketSchema.safeParse({ ...input, requesterId: 'other' }).success).toBe(
      false,
    )
    expect(createSupportTicketSchema.safeParse({ ...input, body: 'x'.repeat(4001) }).success).toBe(
      false,
    )
    expect(
      supportReplySchema.safeParse({ requestId: input.requestId, body: 'hi', fromSupport: true })
        .success,
    ).toBe(false)
  })
})
