import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { EventReminderWorker } from './event-reminder.worker'
import { NotificationsService } from '../notifications/notifications.service'
import { advanceReminderDelivery, RECEIPT_WAIT_MS } from '../push/reminder-delivery'

const url = process.env.REMINDER_TEST_DATABASE_URL
if (url) {
  const parsed = new URL(url)
  if (parsed.hostname !== '127.0.0.1' || !parsed.pathname.endsWith('_test')) {
    throw new Error('Reminder integration tests require an isolated localhost *_test database')
  }
}

;(url ? describe : describe.skip)('personal reminder PostgreSQL delivery claims', () => {
  const run = randomUUID()
  const userId = `reminder-user-${run}`
  const clubId = `reminder-club-${run}`
  const teamId = `reminder-team-${run}`
  const eventId = `reminder-event-${run}`
  const prefId = `reminder-pref-${run}`
  let prisma: PrismaClient
  const push = { advanceEventReminder: jest.fn() }
  const teams = { assertReadableAccess: jest.fn().mockResolvedValue({}) }
  function worker() {
    // Restrict batch discovery to this run's exact fixture. Existing simulator
    // reminders must never be marked/sent by this integration suite.
    const scoped = {
      eventReminderPreference: {
        findMany: () =>
          prisma.eventReminderPreference.findMany({
            where: { id: prefId, sent: false },
            select: { id: true },
          }),
        updateMany: prisma.eventReminderPreference.updateMany.bind(prisma.eventReminderPreference),
      },
      $transaction: prisma.$transaction.bind(prisma),
    }
    return new EventReminderWorker(scoped as never, push as never, teams as never)
  }
  beforeAll(async () => {
    if (!url) throw new Error('REMINDER_TEST_DATABASE_URL required')
    prisma = new PrismaClient({ datasources: { db: { url } } })
    await prisma.user.create({
      data: { id: userId, name: 'Local reminder QA', preferredLanguage: 'en' },
    })
    await prisma.club.create({
      data: { id: clubId, name: 'Local reminder QA', slug: `reminder-${run}` },
    })
    const group = await prisma.teamGroup.create({
      data: { clubId, type: 'SENIOR', displayName: 'Local QA' },
    })
    await prisma.team.create({
      data: { id: teamId, clubId, groupId: group.id, name: 'QA', displayName: 'QA' },
    })
    await prisma.event.create({
      data: {
        id: eventId,
        clubId,
        teamId,
        createdById: userId,
        title: 'Local reminder QA',
        date: new Date(Date.now() + 30 * 60_000),
      },
    })
    await prisma.eventReminderPreference.create({
      data: { id: prefId, eventId, userId, remindAt: new Date(Date.now() - 1000) },
    })
  })
  afterAll(async () => {
    if (!prisma) return
    // Exact test-owned club cascades its test-only team/event/preference rows.
    await prisma.club.deleteMany({ where: { id: clubId } })
    await prisma.user.deleteMany({ where: { id: userId } })
    await prisma.$disconnect()
  })
  it('keeps provider failures pending, then sends once across simultaneous worker instances', async () => {
    push.advanceEventReminder.mockResolvedValue({
      complete: false,
      state: { eventDate: '', devices: [] },
      nextAt: new Date(Date.now() + 60_000),
    })
    await worker().runCycle()
    let row = await prisma.eventReminderPreference.findUniqueOrThrow({ where: { id: prefId } })
    expect(row.sent).toBe(false)
    expect(row.remindAt.getTime()).toBeGreaterThan(Date.now())
    await prisma.eventReminderPreference.update({
      where: { id: prefId },
      data: { remindAt: new Date(Date.now() - 1000) },
    })
    push.advanceEventReminder.mockClear().mockImplementation(async () => {
      // Keep the row locked while the other worker attempts its claim.
      await new Promise((resolve) => setTimeout(resolve, 80))
      return {
        complete: true,
        state: { eventDate: '', devices: [] },
        nextAt: new Date(Date.now() + 60_000),
      }
    })
    await Promise.all([worker().runCycle(), worker().runCycle()])
    row = await prisma.eventReminderPreference.findUniqueOrThrow({ where: { id: prefId } })
    expect(row.sent).toBe(true)
    expect(push.advanceEventReminder).toHaveBeenCalledTimes(1)
  })
  it('serializes nullable club-wide preferences and upgrades all legacy duplicate zones', async () => {
    const service = new NotificationsService(prisma as never)
    const values = { quietStart: '22:00', quietEnd: '07:00', quietTimeZone: 'Europe/Berlin' }
    await Promise.all([
      service.upsertPreference(userId, clubId, values),
      service.upsertPreference(userId, clubId, values),
    ])
    const where = { userId, clubId, teamId: null }
    expect(await prisma.notificationPreference.count({ where })).toBe(1)
    // Simulate historical duplicates allowed by PostgreSQL's nullable unique.
    await prisma.notificationPreference.create({
      data: { ...where, quietStart: '23:00', quietEnd: '08:00' },
    })
    await service.upsertPreference(userId, clubId, { ...values, quietStart: null, quietEnd: null })
    const rows = await prisma.notificationPreference.findMany({ where })
    expect(rows).toHaveLength(2)
    expect(
      rows.every(
        (row) =>
          row.quietTimeZone === 'Europe/Berlin' && row.quietStart === null && row.quietEnd === null,
      ),
    ).toBe(true)
  })
  it('persists a ticket then a fresh worker polls it without sending another notification', async () => {
    let clock = Date.now()
    const transport = {
      send: jest.fn().mockResolvedValue([{ status: 'ok', id: 'local-receipt' }]),
      receipts: jest.fn().mockResolvedValue({ 'local-receipt': { status: 'ok' } }),
    }
    push.advanceEventReminder.mockImplementation((input) =>
      advanceReminderDelivery({
        saved: input.saved,
        eventDate: input.eventDate,
        now: clock,
        canSend: true,
        tokens: [{ id: 'local-device-id', token: 'synthetic-not-a-real-token' }],
        transport,
      }),
    )
    await prisma.eventReminderPreference.update({
      where: { id: prefId },
      data: { sent: false, remindAt: new Date(Date.now() - 1000) },
    })
    await worker().runCycle()
    const queued = await prisma.eventReminderPreference.findUniqueOrThrow({ where: { id: prefId } })
    expect(queued.sent).toBe(false)
    expect(JSON.stringify(queued.deliveryState)).toContain('local-receipt')
    expect(JSON.stringify(queued.deliveryState)).not.toContain('synthetic-not-a-real-token')
    clock += RECEIPT_WAIT_MS
    await prisma.eventReminderPreference.update({
      where: { id: prefId },
      data: { remindAt: new Date(Date.now() - 1000) },
    })
    await worker().runCycle()
    const finished = await prisma.eventReminderPreference.findUniqueOrThrow({
      where: { id: prefId },
    })
    expect(finished.sent).toBe(true)
    expect(JSON.stringify(finished.deliveryState)).toContain('accepted')
    expect(transport.send).toHaveBeenCalledTimes(1)
    expect(transport.receipts).toHaveBeenCalledWith(['local-receipt'])
  })
})
