import { availabilityClosed, deadlinePreset } from '../availabilityPolicy'
describe('availability policy presentation', () => {
  const now = Date.parse('2026-10-28T12:00:00Z')
  const date = new Date(now + 72 * 3600_000).toISOString()
  it('keeps legacy events open without a policy', () => expect(availabilityClosed({ date }, now)).toBe(false))
  it.each(['rsvpLocked', 'cancelledAt', 'archivedAt'])('closes on %s', (key) => {
    expect(availabilityClosed({ date, [key]: key === 'rsvpLocked' ? true : date }, now)).toBe(true)
  })
  it.each([-1, 0, 1])('uses the exact deadline boundary (%d ms)', (offset) => {
    expect(availabilityClosed({ date, rsvpDeadline: new Date(now + offset).toISOString() }, now)).toBe(offset <= 0)
  })
  it('closes at an earlier rescheduled event start', () => {
    expect(availabilityClosed({ date: new Date(now - 1).toISOString(), rsvpDeadline: date }, now)).toBe(true)
  })
  it('omits expired presets and computes valid absolute deadlines', () => {
    expect(deadlinePreset(date, 24, now)).toBe(new Date(now + 48 * 3600_000).toISOString())
    expect(deadlinePreset(date, 72, now)).toBeNull()
    expect(deadlinePreset('invalid', 24, now)).toBeNull()
  })
})
