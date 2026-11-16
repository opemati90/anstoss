import { TeamAccessDeniedError } from '@anstoss/shared'
import { EventReminderWorker } from './event-reminder.worker'

describe('personal event reminder delivery', () => {
  const now = new Date('2026-11-16T12:00:00Z')
  const pref = {
    id: 'pref',
    userId: 'user',
    sent: false,
    remindAt: now,
    user: { preferredLanguage: 'en', deletedAt: null },
    event: {
      id: 'event',
      teamId: 'team',
      clubId: 'club',
      title: 'Training',
      type: 'TRAINING',
      opponent: null,
      homeAway: null,
      autoTitle: false,
      location: 'Berlin',
      date: new Date(now.getTime() + 3600_000),
      cancelledAt: null,
      archivedAt: null,
    },
  }
  function setup() {
    const preferences = {
      findMany: jest.fn().mockResolvedValue([{ id: pref.id }]),
      findUnique: jest.fn().mockResolvedValue(pref),
      update: jest.fn(),
      updateMany: jest.fn(),
    }
    const tx = {
      eventReminderPreference: preferences,
      $queryRaw: jest.fn().mockResolvedValue([{ id: pref.id }]),
    }
    const prisma = {
      ...tx,
      $transaction: jest.fn(async (fn: (db: typeof tx) => unknown) => fn(tx)),
    }
    const push = {
      advanceEventReminder: jest
        .fn()
        .mockResolvedValue({
          complete: false,
          state: { eventDate: pref.event.date.toISOString(), devices: [] },
          nextAt: new Date(now.getTime() + 60_000),
        }),
    }
    const teams = { assertReadableAccess: jest.fn().mockResolvedValue({}) }
    const worker = new EventReminderWorker(prisma as never, push as never, teams as never)
    jest.spyOn(worker['logger'], 'warn').mockImplementation(() => undefined)
    return { worker, preferences, push, teams, tx }
  }
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(now)
  })
  afterEach(() => {
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  it('rechecks access and sends localized copy with the correct club/team route', async () => {
    const { worker, push, preferences, teams } = setup()
    await worker.runCycle()
    expect(teams.assertReadableAccess).toHaveBeenCalledWith('user', 'team', { eventId: 'event' })
    expect(push.advanceEventReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user',
        body: expect.stringContaining('Berlin'),
        data: {
          type: 'event',
          reminderId: 'pref',
          eventId: 'event',
          clubId: 'club',
          teamId: 'team',
        },
      }),
    )
    expect(preferences.update).toHaveBeenCalledWith({
      where: { id: 'pref' },
      data: expect.objectContaining({ sent: false, deliveryState: expect.any(Object) }),
    })
  })
  it.each(['provider rejection', 'missing token', 'quiet hours', 'muted category'])(
    'does not mark %s as sent; schedules a fair retry',
    async () => {
      const { worker, preferences } = setup()
      await worker.runCycle()
      expect(preferences.update).not.toHaveBeenCalledWith({
        where: { id: 'pref' },
        data: { sent: true },
      })
      expect(preferences.update).toHaveBeenCalledWith({
        where: { id: 'pref' },
        data: expect.objectContaining({ sent: false, remindAt: new Date(now.getTime() + 60_000) }),
      })
    },
  )
  it('does not disclose event details after team access was revoked', async () => {
    const { worker, teams, push, preferences } = setup()
    teams.assertReadableAccess.mockRejectedValue(new TeamAccessDeniedError('Access revoked'))
    await worker.runCycle()
    expect(push.advanceEventReminder).not.toHaveBeenCalled()
    expect(preferences.update).toHaveBeenCalledWith({ where: { id: 'pref' }, data: { sent: true } })
  })
  it.each([{ cancelledAt: now }, { archivedAt: now }, { date: now }])(
    'expires inactive or already-started events: %p',
    async (change) => {
      const { worker, preferences, push } = setup()
      preferences.findUnique.mockResolvedValue({ ...pref, event: { ...pref.event, ...change } })
      await worker.runCycle()
      expect(push.advanceEventReminder).not.toHaveBeenCalled()
    },
  )
  it('skips a reminder already locked by another API instance', async () => {
    const { worker, tx, push } = setup()
    tx.$queryRaw.mockResolvedValue([])
    await worker.runCycle()
    expect(push.advanceEventReminder).not.toHaveBeenCalled()
  })
  it('continues receipt-only processing after kickoff for a late accepted ticket', async () => {
    const { worker, preferences, push } = setup()
    preferences.findUnique.mockResolvedValue({
      ...pref,
      event: { ...pref.event, date: now },
      deliveryState: {
        eventDate: now.toISOString(),
        devices: [
          {
            tokenId: 'token-id',
            status: 'receipt',
            attempts: 1,
            nextAt: now.getTime(),
            ticketId: 'receipt',
          },
        ],
      },
    })
    await worker.runCycle()
    expect(push.advanceEventReminder).toHaveBeenCalled()
  })
  it('skips a reminder disabled after the batch was read', async () => {
    const { worker, preferences, push } = setup()
    preferences.findUnique.mockResolvedValue(null)
    await worker.runCycle()
    expect(push.advanceEventReminder).not.toHaveBeenCalled()
  })
  it('reschedules instead of sending early after an event was delayed', async () => {
    const { worker, preferences, push } = setup()
    const date = new Date(now.getTime() + 5 * 3600_000)
    preferences.findUnique.mockResolvedValue({ ...pref, event: { ...pref.event, date } })
    await worker.runCycle()
    expect(push.advanceEventReminder).not.toHaveBeenCalled()
    expect(preferences.update).toHaveBeenCalledWith({
      where: { id: 'pref' },
      data: { remindAt: new Date(date.getTime() - 3600_000) },
    })
  })
  it('recovers from database errors on a later cycle', async () => {
    const { worker, preferences, push } = setup()
    preferences.findMany.mockRejectedValueOnce(new Error('Database unavailable'))
    await expect(worker.runCycle()).resolves.toBeUndefined()
    await worker.runCycle()
    expect(push.advanceEventReminder).toHaveBeenCalledTimes(1)
  })
})
