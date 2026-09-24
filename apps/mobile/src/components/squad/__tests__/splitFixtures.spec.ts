import { splitFixtures } from '../fixtureSide'

const fx = (id: string, status: string, kickoffAt: string) => ({ id, status, kickoffAt }) as never

describe('splitFixtures', () => {
  it('lists a live match once, under upcoming, even when both scopes return it', () => {
    const live = fx('m1', 'live', '2026-09-24T12:00:00Z')
    const { upcoming, results } = splitFixtures([live], [live])
    expect(upcoming.map((f: { id: string }) => f.id)).toEqual(['m1'])
    expect(results).toHaveLength(0)
  })

  it('puts finished matches under results, newest first, and scheduled soonest first', () => {
    const { upcoming, results } = splitFixtures(
      [fx('s2', 'scheduled', '2026-10-04T13:00:00Z'), fx('s1', 'scheduled', '2026-09-27T13:00:00Z')],
      [fx('f1', 'finished', '2026-09-13T13:00:00Z'), fx('f2', 'finished', '2026-09-20T13:00:00Z')],
    )
    expect(upcoming.map((f: { id: string }) => f.id)).toEqual(['s1', 's2'])
    expect(results.map((f: { id: string }) => f.id)).toEqual(['f2', 'f1'])
  })
})
