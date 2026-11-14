import { calendarDays, localDateKey } from '../ScheduleDateStrip'

describe('schedule calendar dates', () => {
  it('crosses month/year boundaries using local dates', () => {
    expect(calendarDays(new Date(2026, 11, 30), 4).map(localDateKey)).toEqual([
      '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02',
    ])
  })
  it('does not skip or repeat days across daylight-saving changes', () => {
    for (const month of [2, 9]) {
      const days = calendarDays(new Date(2026, month, 24), 8)
      expect(new Set(days.map(localDateKey)).size).toBe(8)
      expect(days.map((date) => date.getDate())).toEqual([24, 25, 26, 27, 28, 29, 30, 31])
      expect(days.every((date) => date.getHours() === 12)).toBe(true)
    }
  })
})
