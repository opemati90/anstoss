/**
 * Whether a team's age group is a youth (Jugend) team. Parents channels are
 * only seeded for youth teams: an adult Herren/Damen squad has no parents to
 * talk to, and an empty "Eltern" channel there is noise.
 *
 * Youth (L7): U7–U19, the Jugend/Junioren classes A–G ("D-Jugend",
 * "E Junioren", "A-Juniorinnen", "Jugend") and Bambini. U20/U21/U23 are
 * adult development squads; Senior, Herren, Damen, Alte Herren, Ü32 and null
 * are adult.
 */
export function isYouthTeam(ageGroup: string | null | undefined): boolean {
  if (!ageGroup) return false
  const value = ageGroup.trim()
  if (!value) return false
  // "Ü32" / "Ü40" are veterans' teams, never youth.
  if (/^ü/i.test(value)) return false
  const under = value.match(/(^|[^a-zäöü])u\s?-?(\d{1,2})\b/i)
  if (under) {
    const age = Number(under[2])
    return age >= 7 && age <= 19
  }
  if (/^[a-g][\s-]?(jugend|junior)/i.test(value)) return true
  if (/(jugend|junior|bambini)/i.test(value)) return true
  return false
}
