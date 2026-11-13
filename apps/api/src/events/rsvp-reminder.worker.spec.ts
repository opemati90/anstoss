import { RsvpReminderWorker } from './rsvp-reminder.worker'
import { EventsService } from './events.service'
import { PrismaService } from '../prisma/prisma.service'

describe('RsvpReminderWorker', () => {
  const dateField = { name: 'date' }
  const findMany = jest.fn()
  const remindRsvpAutomatically = jest.fn()
  let worker: RsvpReminderWorker
  beforeEach(() => {
    jest.resetAllMocks()
    worker = new RsvpReminderWorker(
      { event: { findMany, fields: { date: dateField } } } as unknown as PrismaService,
      { remindRsvpAutomatically } as unknown as EventsService,
    )
  })

  it('selects only enabled, upcoming, uncancelled events due within 24 hours', async () => {
    findMany.mockResolvedValue([
      { id: 'e1', clubId: 'c1' },
      { id: 'e2', clubId: 'c2' },
    ])
    await worker.runCycle()
    const query = findMany.mock.calls[0][0]
    expect(query.where).toMatchObject({
      rsvpAutoReminder: true,
      cancelledAt: null,
      archivedAt: null,
    })
    expect(query.where.date.lte.getTime() - query.where.date.gt.getTime()).toBe(86400000)
    expect(query.where.AND[0]).toEqual({
      OR: [{ rsvpAutoReminderFor: null }, { NOT: { rsvpAutoReminderFor: { equals: dateField } } }],
    })
    expect(query.where.AND[1].OR[1].lastRsvpReminderAt.lt.getTime()).toBe(
      query.where.date.gt.getTime() - 86400000,
    )
    expect(remindRsvpAutomatically.mock.calls).toEqual([
      ['c1', 'e1'],
      ['c2', 'e2'],
    ])
  })

  it('continues to other clubs if one event fails', async () => {
    findMany.mockResolvedValue([
      { id: 'e1', clubId: 'c1' },
      { id: 'e2', clubId: 'c2' },
    ])
    remindRsvpAutomatically
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValueOnce({ sent: 1 })
    await worker.runCycle()
    expect(remindRsvpAutomatically).toHaveBeenCalledTimes(2)
  })

  it('does not overlap cycles and recovers after query errors', async () => {
    let release!: (rows: []) => void
    findMany.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve
      }),
    )
    const first = worker.runCycle()
    await worker.runCycle()
    expect(findMany).toHaveBeenCalledTimes(1)
    release([])
    await first
    findMany.mockRejectedValueOnce(new Error('database unavailable')).mockResolvedValueOnce([])
    await worker.runCycle()
    await worker.runCycle()
    expect(findMany).toHaveBeenCalledTimes(3)
  })
})
