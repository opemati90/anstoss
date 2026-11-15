import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { NotFoundException } from '@nestjs/common'
import { SupportService } from './support.service'
import type { PrismaService } from '../prisma/prisma.service'

// Opt-in only: never mutate a remotely hosted or non-test database.
const url = process.env.SUPPORT_TEST_DATABASE_URL
if (url) {
  const parsed = new URL(url)
  if (parsed.hostname !== '127.0.0.1' || !parsed.pathname.endsWith('_test')) {
    throw new Error('Support integration tests require a localhost *_test database')
  }
}

;(url ? describe : describe.skip)('Support database lifecycle', () => {
  const prisma = new PrismaClient({ datasources: { db: { url } } })
  const support = new SupportService(prisma as unknown as PrismaService)
  const userId = `support-test-${randomUUID()}`
  const actor = { id: null, name: 'Support QA', email: null, authMethod: 'admin-key' as const }
  let ticketId: string

  beforeAll(async () => {
    await prisma.user.create({ data: { id: userId, name: 'Support QA requester' } })
  })
  afterAll(async () => {
    // Only this run's exact IDs; no global cleanup or fixture reset.
    if (ticketId)
      await prisma.auditLog.deleteMany({
        where: { metadata: { path: ['ticketId'], equals: ticketId } },
      })
    await prisma.user.deleteMany({ where: { id: userId } })
    await prisma.$disconnect()
  })

  it('serializes duplicate creation, isolates ownership, replies and erases the thread', async () => {
    const input = {
      requestId: randomUUID(),
      category: 'BUG' as const,
      subject: 'Keyboard report',
      body: 'History disappears on opening the keyboard.',
    }
    const [first, retry] = await Promise.all([
      support.create(userId, input),
      support.create(userId, input),
    ])
    ticketId = first.id
    expect(retry.id).toBe(ticketId)
    expect(first.messages).toHaveLength(1)
    await expect(support.detail(ticketId, 'someone-else')).rejects.toBeInstanceOf(NotFoundException)
    expect(await support.listForUser('someone-else', 0)).toEqual([])

    const reply = { requestId: randomUUID(), body: 'Please try the new test build.' }
    const [answered, duplicate] = await Promise.all([
      support.reply(ticketId, reply, null, actor),
      support.reply(ticketId, reply, null, actor),
    ])
    expect(answered.status).toBe('WAITING')
    expect(duplicate.messages).toHaveLength(2)
    expect(duplicate.messages[1].fromSupport).toBe(true)
    await support.setStatus(ticketId, 'RESOLVED', actor)
    const reopened = await support.reply(
      ticketId,
      { requestId: randomUUID(), body: 'Still happening.' },
      userId,
    )
    expect(reopened.status).toBe('OPEN')
    expect(reopened.messages).toHaveLength(3)
    // Same deletion used during account erasure; children must cascade.
    await prisma.supportTicket.deleteMany({ where: { requesterId: userId } })
    expect(await prisma.supportMessage.count({ where: { ticketId } })).toBe(0)
    await expect(support.detail(ticketId, userId)).rejects.toBeInstanceOf(NotFoundException)
  })
})
