import { distinctInOrder, isoWeekKey, weekStreaks } from './streak-math'

describe('isoWeekKey', () => {
  it('groups dates in the same ISO week under one key', () => {
    // Mon 2025-09-08 .. Sun 2025-09-14 are all ISO week 2025-W37.
    expect(isoWeekKey(new Date('2025-09-08T00:00:00Z'))).toBe('2025-W37')
    expect(isoWeekKey(new Date('2025-09-14T23:00:00Z'))).toBe('2025-W37')
    expect(isoWeekKey(new Date('2025-09-15T00:00:00Z'))).toBe('2025-W38')
  })

  it('rolls a late-December date into the next ISO year', () => {
    // 2025-12-29 (Mon) belongs to ISO week 2026-W01.
    expect(isoWeekKey(new Date('2025-12-29T12:00:00Z'))).toBe('2026-W01')
  })
})

describe('distinctInOrder', () => {
  it('de-dupes while preserving first-seen order', () => {
    expect(distinctInOrder(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c'])
  })
})

describe('weekStreaks', () => {
  const timeline = ['2025-W30', '2025-W31', '2025-W32', '2025-W33', '2025-W34']

  it('counts a trailing current run and the longest run', () => {
    // Missed W31; attended W30, W32, W33, W34 → current 3, longest 3.
    const hit = new Set(['2025-W30', '2025-W32', '2025-W33', '2025-W34'])
    expect(weekStreaks(timeline, hit)).toEqual({ current: 3, longest: 3 })
  })

  it('breaks the current streak when the most recent week was missed', () => {
    const hit = new Set(['2025-W30', '2025-W31', '2025-W32', '2025-W33'])
    // Missed the last week (W34) → current 0, longest 4.
    expect(weekStreaks(timeline, hit)).toEqual({ current: 0, longest: 4 })
  })

  it('does not count weeks absent from the timeline as breaks', () => {
    // Timeline skips W31/W32 entirely (no events those weeks); a continuous
    // attendance run across the weeks that DID happen stays unbroken.
    const sparse = ['2025-W30', '2025-W33', '2025-W34']
    const hit = new Set(['2025-W30', '2025-W33', '2025-W34'])
    expect(weekStreaks(sparse, hit)).toEqual({ current: 3, longest: 3 })
  })

  it('returns zeros for an empty timeline', () => {
    expect(weekStreaks([], new Set())).toEqual({ current: 0, longest: 0 })
  })
})
