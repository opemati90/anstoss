import { randomUUID } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import { TeamsService } from '../teams/teams.service'
import { EventsController } from './events.controller'
import { EventsService } from './events.service'
import { RsvpReminderWorker } from './rsvp-reminder.worker'

// Opt-in, real PostgreSQL test. Never falls back to DATABASE_URL or production.
const databaseUrl = process.env.ANSTOSS_REMINDER_TEST_DATABASE_URL
if (databaseUrl) {
  const target = new URL(databaseUrl)
  if (target.hostname !== '127.0.0.1' || !target.pathname.endsWith('_test')) {
    throw new Error('Reminder integration tests require an isolated localhost *_test database')
  }
}

const databaseTests = databaseUrl ? describe : describe.skip
databaseTests('RSVP reminders with PostgreSQL and real event/permission services', () => {
  const runId = `reminder-test-${randomUUID()}`
  let prisma: PrismaService
  const push = {
    sendToUser: jest.fn().mockResolvedValue(undefined),
    sendToTeamRendered: jest.fn().mockResolvedValue(undefined),
    sendToUserLocalized: jest.fn().mockResolvedValue(undefined),
  }
  let events: EventsService
  let controller: EventsController
  let clubId: string
  let teamId: string
  let coachId: string
  let playerId: string
  let otherPlayerId: string
  let outsiderId: string
  const futureDate = () => new Date(Date.now() + 12 * 60 * 60 * 1000)
  const create = (rsvpAutoReminder?: boolean) =>
    controller.create({ id: coachId }, clubId, {
      type: 'TRAINING',
      date: futureDate().toISOString(),
      teamId,
      rsvpAutoReminder,
    })

  beforeAll(async () => {
    prisma = new PrismaService({ datasources: { db: { url: databaseUrl! } } })
    events = new EventsService(
      prisma,
      new TeamsService(prisma),
      { getOverdueContributionsForUser: jest.fn().mockResolvedValue([]) } as never,
      push as never,
      { emitEventUpsert: jest.fn(), emitRsvpUpdate: jest.fn() } as never,
      { postSystemNotice: jest.fn().mockResolvedValue(undefined) } as never,
    )
    controller = new EventsController(events)
    await prisma.$connect()
    const coach = await prisma.user.create({ data: { name: runId, preferredLanguage: 'de' } })
    coachId = coach.id
    playerId = (
      await prisma.user.create({ data: { name: `${runId}-player`, preferredLanguage: 'de' } })
    ).id
    otherPlayerId = (
      await prisma.user.create({ data: { name: `${runId}-other`, preferredLanguage: 'en' } })
    ).id
    outsiderId = (await prisma.user.create({ data: { name: `${runId}-outsider` } })).id
    clubId = (await prisma.club.create({ data: { name: runId, slug: runId } })).id
    const group = await prisma.teamGroup.create({
      data: { clubId, type: 'SENIOR', displayName: 'Test' },
    })
    teamId = (
      await prisma.team.create({
        data: { clubId, groupId: group.id, name: 'test', displayName: 'Test' },
      })
    ).id
    await prisma.membership.createMany({
      data: [coachId, playerId, otherPlayerId].map((userId) => ({
        userId,
        clubId,
        role: 'PLAYER',
      })),
    })
    await prisma.teamAccess.createMany({
      data: [
        { clubId, teamId, userId: coachId, role: 'HEAD_COACH', status: 'ACTIVE' },
        { clubId, teamId, userId: playerId, role: 'PLAYER', status: 'ACTIVE' },
        { clubId, teamId, userId: otherPlayerId, role: 'PLAYER', status: 'ACTIVE' },
      ],
    })
  })

  beforeEach(async () => {
    // Only rows owned by this test run, inside the explicitly isolated database.
    await prisma.event.deleteMany({ where: { clubId } })
    jest.clearAllMocks()
  })

  afterAll(async () => {
    if (clubId) {
      await prisma.club.delete({ where: { id: clubId } })
      await prisma.eventSeries.deleteMany({ where: { clubId } })
    }
    await prisma.user.deleteMany({
      where: { id: { in: [coachId, playerId, otherPlayerId, outsiderId].filter(Boolean) } },
    })
    await prisma.$disconnect()
  })

  it('round-trips false/default/updated values through controller, service, DB and feed', async () => {
    const disabled = await create(false)
    const enabled = await create()
    expect(disabled.rsvpAutoReminder).toBe(false)
    expect(enabled.rsvpAutoReminder).toBe(true)
    await controller.update({ id: coachId }, clubId, disabled.id, { rsvpAutoReminder: true })
    await controller.update({ id: coachId }, clubId, enabled.id, { rsvpAutoReminder: false })
    const feed = await events.listUpcoming(teamId, coachId)
    expect(feed.find((event) => event.id === disabled.id)?.rsvpAutoReminder).toBe(true)
    expect(feed.find((event) => event.id === enabled.id)?.rsvpAutoReminder).toBe(false)
    expect((await events.findById(clubId, enabled.id, coachId)).rsvpAutoReminder).toBe(false)
  })

  it('persists the switch on every recurring occurrence and following edit', async () => {
    const date = futureDate()
    const result = await controller.createSeries({ id: coachId }, clubId, {
      type: 'TRAINING',
      teamId,
      date: date.toISOString(),
      rsvpAutoReminder: false,
      repeat: { intervalWeeks: 1, until: new Date(date.getTime() + 14 * 86400000).toISOString() },
    })
    expect(result.events).toHaveLength(3)
    expect(result.events.every((event) => !event.rsvpAutoReminder)).toBe(true)
    await controller.update({ id: coachId }, clubId, result.events[0].id, {
      rsvpAutoReminder: true,
      scope: 'following',
    })
    const rows = await prisma.event.findMany({ where: { seriesId: result.series.id, clubId } })
    expect(rows.every((event) => event.rsvpAutoReminder)).toBe(true)
  })

  it('rejects changes by a player, an outsider and a mismatched route club', async () => {
    const event = await create(false)
    for (const userId of [playerId, outsiderId]) {
      await expect(
        controller.update({ id: userId }, clubId, event.id, { rsvpAutoReminder: true }),
      ).rejects.toThrow()
    }
    await expect(
      controller.update({ id: coachId }, 'wrong-club', event.id, { rsvpAutoReminder: true }),
    ).rejects.toThrow()
    expect(
      (await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).rsvpAutoReminder,
    ).toBe(false)
  })

  it('sends one localized batch across concurrent worker instances and repeated cycles', async () => {
    const event = await create()
    const first = new RsvpReminderWorker(prisma, events)
    const second = new RsvpReminderWorker(prisma, events)
    await Promise.all([first.runCycle(), second.runCycle()])
    await first.runCycle()
    expect(push.sendToUser).toHaveBeenCalledTimes(2)
    expect(new Set(push.sendToUser.mock.calls.map((call) => call[0]))).toEqual(
      new Set([playerId, otherPlayerId]),
    )
    expect(push.sendToUser.mock.calls.find((call) => call[0] === playerId)?.[2]).toContain(
      'Hast du',
    )
    expect(push.sendToUser.mock.calls.find((call) => call[0] === otherPlayerId)?.[2]).not.toContain(
      'Hast du',
    )
    expect(
      (await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).rsvpAutoReminderFor,
    ).toEqual(event.date)
  })

  it('reflects the player RSVP in the coach aggregate and reminds only the unanswered player', async () => {
    const event = await create()
    await events.upsertRsvp(event.id, playerId, 'YES')
    expect(await events.getRsvpSummary(event.id, coachId)).toEqual({ yes: 1, maybe: 0, no: 0 })
    await new RsvpReminderWorker(prisma, events).runCycle()
    expect(push.sendToUser).toHaveBeenCalledTimes(1)
    expect(push.sendToUser.mock.calls[0][0]).toBe(otherPlayerId)
  })

  it('never schedules disabled, cancelled, archived, past or distant events', async () => {
    const disabled = await create(false)
    const cancelled = await create()
    const archived = await create()
    const past = await create()
    const distant = await create()
    await prisma.event.update({ where: { id: cancelled.id }, data: { cancelledAt: new Date() } })
    await prisma.event.update({ where: { id: archived.id }, data: { archivedAt: new Date() } })
    await prisma.event.update({
      where: { id: past.id },
      data: { date: new Date(Date.now() - 1000) },
    })
    await prisma.event.update({
      where: { id: distant.id },
      data: { date: new Date(Date.now() + 25 * 3600000) },
    })
    await new RsvpReminderWorker(prisma, events).runCycle()
    expect(push.sendToUser).not.toHaveBeenCalled()
    expect(
      (await prisma.event.findUniqueOrThrow({ where: { id: disabled.id } })).rsvpAutoReminderFor,
    ).toBeNull()
  })

  it('recognizes a rescheduled kickoff without re-sending for the previous kickoff', async () => {
    const event = await create()
    const worker = new RsvpReminderWorker(prisma, events)
    await worker.runCycle()
    expect(push.sendToUser).toHaveBeenCalledTimes(2)
    const changedDate = new Date(event.date.getTime() + 3600000)
    await controller.update({ id: coachId }, clubId, event.id, { date: changedDate.toISOString() })
    await worker.runCycle()
    expect(push.sendToUser).toHaveBeenCalledTimes(2) // shared 24-hour cooldown still applies
    await prisma.event.update({
      where: { id: event.id },
      data: { lastRsvpReminderAt: new Date(Date.now() - 25 * 3600000) },
    })
    await worker.runCycle()
    expect(push.sendToUser).toHaveBeenCalledTimes(4)
    expect(
      (await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).rsvpAutoReminderFor,
    ).toEqual(changedDate)
  })
})
