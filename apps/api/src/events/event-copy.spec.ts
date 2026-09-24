import {
  EVENT_LOCALES,
  eventTitleFor,
  formatEventDateFor,
  resolveEventLocale,
  resolveStoredTitle,
  rideCancelledCopy,
  rsvpReminderCopy,
  squadNominatedCopy,
} from './event-copy'

const match = (homeAway: 'HOME' | 'AWAY') => ({
  title: 'SV Babelsberg 03',
  type: 'MATCH',
  opponent: 'SV Babelsberg 03',
  homeAway,
  autoTitle: true,
})

describe('event-copy', () => {
  it('renders derived match titles per language, never "@ X" (M6)', () => {
    expect(eventTitleFor(match('HOME'), 'de')).toBe('Heimspiel gegen SV Babelsberg 03')
    expect(eventTitleFor(match('AWAY'), 'de')).toBe('Auswärtsspiel bei SV Babelsberg 03')
    for (const locale of EVENT_LOCALES) {
      const title = eventTitleFor(match('AWAY'), locale)
      expect(title).toContain('SV Babelsberg 03')
      expect(title).not.toMatch(/^@|^vs\./)
    }
    // A pre-migration row still reads naturally.
    expect(
      eventTitleFor({ ...match('AWAY'), title: '@ SV Babelsberg 03', autoTitle: false }, 'en'),
    ).toBe('Away at SV Babelsberg 03')
  })

  it('renders the Training title in the reader’s language (L7)', () => {
    const training = { title: 'Training', type: 'TRAINING', autoTitle: true }
    expect(eventTitleFor(training, 'tr')).toBe('Antrenman')
    expect(eventTitleFor(training, 'it')).toBe('Allenamento')
    expect(
      eventTitleFor({ title: 'Torwarttraining', type: 'TRAINING', autoTitle: false }, 'fr'),
    ).toBe('Torwarttraining')
  })

  it('stores neutral fallbacks for derived titles', () => {
    expect(resolveStoredTitle({ type: 'TRAINING', title: 'Treino' })).toEqual({
      title: 'Training',
      autoTitle: true,
    })
    expect(resolveStoredTitle({ type: 'MATCH', title: 'vs. X', opponent: 'X' })).toEqual({
      title: 'X',
      autoTitle: true,
    })
    expect(resolveStoredTitle({ type: 'OTHER', title: '' })).toBeNull()
  })

  it('resolves Turkish and falls back to German', () => {
    expect(resolveEventLocale('tr-TR')).toBe('tr')
    expect(resolveEventLocale('ar')).toBe('de')
    expect(resolveEventLocale(null)).toBe('de')
  })

  it('formats dates in the reader’s locale (M2)', () => {
    const date = new Date('2026-10-10T13:00:00.000Z')
    expect(formatEventDateFor(date, 'de')).toBe('Sa., 10.10.')
    expect(formatEventDateFor(date, 'en')).not.toBe(formatEventDateFor(date, 'de'))
  })

  it('has guardian and player squad copy in all six languages (M2)', () => {
    for (const locale of EVENT_LOCALES) {
      const self = squadNominatedCopy(locale, { eventTitle: 'T', date: 'D' })
      const child = squadNominatedCopy(locale, { eventTitle: 'T', date: 'D', childName: 'Mia' })
      expect(child.body).toContain('Mia')
      expect(self.body).not.toContain('Mia')
      expect(child.body).not.toBe(self.body)
    }
    expect(squadNominatedCopy('de', { eventTitle: 'T', date: 'D', childName: 'Mia' }).body).toBe(
      'Mia ist im Kader für T am D.',
    )
  })

  it('has ride-cancelled and reminder copy in all six languages', () => {
    const bodies = EVENT_LOCALES.map(
      (locale) =>
        rideCancelledCopy(locale, {
          driverName: 'Tim',
          eventTitle: 'T',
          date: 'D',
          childName: 'Mia',
        }).body,
    )
    expect(new Set(bodies).size).toBe(6)
    const reminders = EVENT_LOCALES.map(
      (locale) =>
        rsvpReminderCopy(locale, {
          event: { title: 'Training', type: 'TRAINING', autoTitle: true },
          date: new Date('2026-10-10T17:00:00.000Z'),
        }).body,
    )
    expect(new Set(reminders).size).toBe(6)
  })
})
