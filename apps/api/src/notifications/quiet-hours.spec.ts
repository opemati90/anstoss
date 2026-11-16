import { upsertNotificationPreferenceSchema } from '@anstoss/shared'
import { isQuietAt } from './quiet-hours'

describe('notification quiet-hour timezones', () => {
  const preference = { quietStart: '22:00', quietEnd: '07:00', quietTimeZone: 'Europe/Berlin' }
  it.each([
    ['2026-11-22T05:00:00Z', true], // 06:00 Berlin: quiet
    ['2026-11-22T06:00:00Z', false], // 07:00 Berlin: end-exclusive
    ['2026-07-22T04:00:00Z', true], // summer offset +02
    ['2026-07-22T05:00:00Z', false],
    ['2026-11-22T21:00:00Z', true], // 22:00 start-inclusive
  ])('evaluates %s in Berlin independently of the host', (instant, quiet) => {
    expect(isQuietAt(preference, new Date(instant))).toBe(quiet)
  })
  it('distinguishes London from Berlin at the same instant', () => {
    const now = new Date('2026-11-22T06:00:00Z')
    expect(isQuietAt(preference, now)).toBe(false)
    expect(isQuietAt({ ...preference, quietTimeZone: 'Europe/London' }, now)).toBe(true)
  })
  it('treats equal bounds as disabled and supports daytime ranges', () => {
    expect(isQuietAt({ ...preference, quietEnd: '22:00' })).toBe(false)
    expect(
      isQuietAt(
        { ...preference, quietStart: '12:00', quietEnd: '13:00' },
        new Date('2026-11-22T11:30:00Z'),
      ),
    ).toBe(true)
  })
  it('rejects invalid timezone input before persistence', () => {
    expect(
      upsertNotificationPreferenceSchema.safeParse({ quietTimeZone: 'not/a-timezone' }).success,
    ).toBe(false)
    expect(
      upsertNotificationPreferenceSchema.safeParse({ quietTimeZone: 'Europe/Berlin' }).success,
    ).toBe(true)
  })
})
