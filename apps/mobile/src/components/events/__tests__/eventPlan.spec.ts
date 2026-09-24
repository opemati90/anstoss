import { eventFlowDe } from '../../../i18n/eventFlow/de'
import { eventFlowTr } from '../../../i18n/eventFlow/tr'
import {
  defaultKickoff,
  defaultTrainingDate,
  planDates,
  seasonEnd,
  winterBreak,
} from '../eventPlan'
import {
  eventDisplayTitle,
  eventTimeLine,
  meetingLeadMinutes,
  reasonLabel,
} from '../eventFormat'

const t = (key: string, options?: Record<string, unknown>) =>
  options?.time ? `${key}:${options.time}` : key

/** A translator over the real eventFlow strings, for title rendering. */
function translator(strings: Record<string, unknown>) {
  return (key: string, options?: Record<string, unknown>) => {
    const value = key
      .replace(/^eventFlow\./, '')
      .split('.')
      .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], strings)
    return String(value ?? key).replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(options?.[name] ?? ''))
  }
}
const de = translator(eventFlowDe as unknown as Record<string, unknown>)
const tr = translator(eventFlowTr as unknown as Record<string, unknown>)

describe('eventPlan defaults', () => {
  it('never defaults a new training to tonight at midnight', () => {
    const late = new Date(2026, 8, 23, 23, 40)
    const value = defaultTrainingDate(late)
    expect(value.getHours()).toBe(19)
    expect(value.getMinutes()).toBe(0)
    expect(value.getDate()).toBe(24)
  })

  it('keeps today when 19:00 is still more than an hour away', () => {
    const morning = new Date(2026, 8, 23, 9, 0)
    expect(defaultTrainingDate(morning).getDate()).toBe(23)
  })

  it('defaults kickoff to next Sunday 15:00', () => {
    const tuesday = new Date(2026, 8, 22, 12, 0)
    const kickoff = defaultKickoff(tuesday)
    expect(kickoff.getDay()).toBe(0)
    expect(kickoff.getDate()).toBe(27)
    expect(kickoff.getHours()).toBe(15)
  })

  it('rolls to the following Sunday once this Sunday 15:00 has passed', () => {
    const sundayEvening = new Date(2026, 8, 27, 18, 0)
    expect(defaultKickoff(sundayEvening).getDate()).toBe(4)
  })

  it('ends the season on 30.06 and offers the Winterpause only before December', () => {
    expect(seasonEnd(new Date(2026, 8, 1))).toEqual(new Date(2027, 5, 30, 23, 59, 0, 0))
    expect(seasonEnd(new Date(2027, 1, 1))).toEqual(new Date(2027, 5, 30, 23, 59, 0, 0))
    expect(winterBreak(new Date(2026, 8, 1))?.getMonth()).toBe(11)
    expect(winterBreak(new Date(2026, 11, 20))).toBeNull()
    expect(winterBreak(new Date(2027, 2, 1))).toBeNull()
  })
})

describe('planDates', () => {
  const now = new Date(2026, 8, 20, 12, 0) // Sunday

  it('plans Di + Do every week at the chosen time', () => {
    const from = new Date(2026, 8, 21)
    const until = new Date(2026, 9, 4, 23, 59)
    const dates = planDates(from, until, [2, 4], 1, 19, 0, now)
    expect(dates.map((d) => `${d.getDate()}.${d.getMonth() + 1}`)).toEqual([
      '22.9',
      '24.9',
      '29.9',
      '1.10',
    ])
    expect(dates.every((d) => d.getHours() === 19)).toBe(true)
  })

  it('skips every other week for a 14-day plan', () => {
    const from = new Date(2026, 8, 21)
    const until = new Date(2026, 9, 31)
    const dates = planDates(from, until, [3], 2, 18, 30, now)
    expect(dates.map((d) => d.getDate())).toEqual([23, 7, 21])
  })

  it('returns nothing without a weekday', () => {
    expect(planDates(now, new Date(2026, 11, 1), [], 1, 19, 0, now)).toEqual([])
  })
})

describe('eventFormat', () => {
  const kickoff = '2030-06-23T13:00:00.000Z'
  const meeting = '2030-06-23T12:00:00.000Z'

  it('titles matches by opponent and venue side, in the reader’s language (M6)', () => {
    expect(
      eventDisplayTitle({ title: 'x', type: 'MATCH', date: kickoff, opponent: 'SV Babelsberg 03', homeAway: 'AWAY' }, de),
    ).toBe('Auswärtsspiel bei SV Babelsberg 03')
    expect(
      eventDisplayTitle({ title: 'x', type: 'MATCH', date: kickoff, opponent: 'FC Stahl', homeAway: 'HOME' }, de),
    ).toBe('Heimspiel gegen FC Stahl')
    expect(
      eventDisplayTitle({ title: 'x', type: 'MATCH', date: kickoff, opponent: 'FC Stahl', homeAway: 'AWAY' }, tr),
    ).toBe('Deplasman: FC Stahl')
    // No US-style "@ X" in any language.
    expect(
      eventDisplayTitle({ title: '@ FC Stahl', type: 'MATCH', date: kickoff, opponent: 'FC Stahl', homeAway: 'AWAY' }, de),
    ).not.toContain('@')
  })

  it('renders a derived Training title in the reader’s language (L7)', () => {
    expect(eventDisplayTitle({ title: 'Training', type: 'TRAINING', date: kickoff, autoTitle: true }, tr)).toBe(
      'Antrenman',
    )
    // Rows stored before the fix in the creator's language.
    expect(eventDisplayTitle({ title: 'Allenamento', type: 'TRAINING', date: kickoff }, de)).toBe('Training')
    expect(eventDisplayTitle({ title: 'Torwarttraining', type: 'TRAINING', date: kickoff }, tr)).toBe(
      'Torwarttraining',
    )
  })

  it('prints Treff and Anstoß for a match', () => {
    const line = eventTimeLine(
      { title: 'x', type: 'MATCH', date: kickoff, meetingAt: meeting },
      'de-DE',
      t,
    )
    expect(line).toMatch(/^eventFlow\.time\.meeting:\d\d:\d\d · eventFlow\.time\.kickoff:\d\d:\d\d$/)
    expect(meetingLeadMinutes({ date: kickoff, meetingAt: meeting })).toBe(60)
  })

  it('prints a start–end range for a training with a duration', () => {
    const line = eventTimeLine({ title: 'x', type: 'TRAINING', date: kickoff, durationMin: 90 }, 'de-DE', t)
    expect(line).toMatch(/^\d\d:\d\d–\d\d:\d\d$/)
  })

  it('maps reasons, including the legacy injury code, and ignores unknown ones', () => {
    expect(reasonLabel('injury', t)).toBe('eventFlow.reason.injured')
    expect(reasonLabel('suspended', t)).toBe('eventFlow.reason.suspended')
    expect(reasonLabel('hangover', t)).toBeNull()
    expect(reasonLabel(null, t)).toBeNull()
  })
})
