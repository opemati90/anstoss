import { isYouthTeam } from './youth-team'

describe('isYouthTeam', () => {
  it.each(['U13', 'u11', 'U 9', 'U7', 'U19', 'D-Jugend', 'E Junioren', 'A-Juniorinnen', 'G-Jugend', 'Bambini', 'Jugend', 'U19 Junioren'])(
    'treats %s as youth',
    (ageGroup) => {
      expect(isYouthTeam(ageGroup)).toBe(true)
    },
  )

  // L7: U20/U21/U23 are adult development squads, not youth.
  it.each([null, undefined, '', 'Senior', 'Herren', 'Damen', 'Alte Herren', 'Ü32', 'Erste Mannschaft', 'U23', 'U21', 'U 20', 'U23 Junioren', 'U6'])(
    'treats %s as adult',
    (ageGroup) => {
      expect(isYouthTeam(ageGroup as string | null | undefined)).toBe(false)
    },
  )
})
