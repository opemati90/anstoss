import { myOpenDuties, outstandingDues } from '../../../hooks/usePlayerHome'
import { eventMetaLine, formatShortDate } from '../HomeKit'

jest.mock('../../../api/client', () => ({ api: jest.fn(), ApiError: class extends Error {} }))
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }))

const NOW = new Date('2026-09-23T10:00:00Z').getTime()
const item = (overrides: Record<string, unknown>) => ({
  planId: 'p',
  planName: 'Beitrag',
  amount: 4500,
  currency: 'EUR',
  cadence: 'YEARLY',
  dueDate: new Date(NOW - 86400000).toISOString(),
  status: 'OVERDUE',
  paidAmount: null,
  paidAt: null,
  paymentReported: false,
  ...overrides,
})

describe('outstandingDues', () => {
  it('sums overdue, part-paid and soon-due pending plans', () => {
    const dues = outstandingDues(
      {
        hasContributions: true,
        bankTransfer: null,
        items: [
          item({}),
          item({ status: 'PARTIAL', amount: 3000, paidAmount: 1000 }),
          item({ status: 'PENDING', dueDate: new Date(NOW + 5 * 86400000).toISOString() }),
          item({ status: 'PENDING', dueDate: new Date(NOW + 60 * 86400000).toISOString() }),
          item({ status: 'PAID' }),
        ],
      } as never,
      NOW,
    )
    expect(dues).toEqual({
      amounts: [{ cents: 4500 + 2000 + 4500, currency: 'EUR' }],
      overdue: true,
      dueDate: expect.any(String),
      planName: expect.any(String),
    })
  })

  it('keeps one total per currency instead of adding EUR and CHF together', () => {
    const dues = outstandingDues(
      {
        hasContributions: true,
        bankTransfer: null,
        items: [
          item({}),
          item({ currency: 'CHF', amount: 2000, status: 'PARTIAL', paidAmount: 500 }),
          item({ amount: 1000, status: 'PARTIAL', paidAmount: 0 }),
        ],
      } as never,
      NOW,
    )
    expect(dues).toEqual({
      amounts: [
        { cents: 5500, currency: 'EUR' },
        { cents: 1500, currency: 'CHF' },
      ],
      overdue: true,
      dueDate: expect.any(String),
      planName: expect.any(String),
    })
  })

  it('treats a reported payment as with the treasurer, not owed', () => {
    expect(
      outstandingDues(
        { hasContributions: true, bankTransfer: null, items: [item({ paymentReported: true })] } as never,
        NOW,
      ),
    ).toBeNull()
  })
})

describe('myOpenDuties', () => {
  it("keeps only the user's pending duties, soonest first", () => {
    const duty = (id: string, user: string, due: string, status = 'PENDING') => ({
      id,
      assignedUserId: user,
      kind: 'JERSEY_CLEANUP',
      status,
      dueDate: due,
    })
    const result = myOpenDuties(
      {
        kit: {
          pending: [
            duty('b', 'me', '2026-09-28T10:00:00Z'),
            duty('a', 'me', '2026-09-25T10:00:00Z'),
            duty('x', 'other', '2026-09-24T10:00:00Z'),
            duty('c', 'me', '2026-09-24T10:00:00Z', 'COMPLETED'),
          ],
          recent: [],
        },
      } as never,
      'me',
    )
    expect(result.map((d) => d.id)).toEqual(['a', 'b'])
  })
})

describe('eventMetaLine', () => {
  it('reads "Sa 26.09. · 14:00 · Treff 13:15" in German', () => {
    const date = new Date(2026, 8, 26, 14, 0)
    const meet = new Date(2026, 8, 26, 13, 15)
    const t = (_k: string, o?: Record<string, unknown>) => `Treff ${String(o?.time)}`
    expect(
      eventMetaLine(
        { title: 'Spiel', date: date.toISOString(), meetingAt: meet.toISOString() },
        'de-DE',
        t,
      ),
    ).toBe('Sa 26.09. · 14:00 · Treff 13:15')
    expect(formatShortDate(date.toISOString(), 'de-DE')).toBe('Sa 26.09.')
  })
})
