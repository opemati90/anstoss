import type { ImportedFixture } from '@anstoss/shared'

/**
 * Kader fix H3: own-team detection for Spiele & Tabelle. The server resolves
 * which side of each fixture is ours from the fixture's team link; the table
 * highlight compares against that exact name (normalised the same way the
 * API normalises team names), never a prefix.
 */
export function normalizeTeamName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s\-_.]+/g, ' ')
    .replace(/[^a-z0-9äöüß ]/g, '')
    .trim()
}

/** The linked team's name as fussball.de spells it, from the fixtures. */
export function ownTeamNameOf(fixtures: Array<Pick<ImportedFixture, 'ownTeamName'>>): string | null {
  for (const fixture of fixtures) {
    if (fixture.ownTeamName) return fixture.ownTeamName
  }
  return null
}

export function isOwnTableRow(rowTeam: string, ownTeamName: string | null): boolean {
  if (!ownTeamName) return false
  const own = normalizeTeamName(ownTeamName)
  return own.length > 0 && normalizeTeamName(rowTeam) === own
}

/**
 * Split fixtures from the "upcoming" and "recent" API scopes into two lists
 * without duplicates. Around kick-off the same match comes back from both
 * scopes; each fixture appears once — finished under results (newest first),
 * everything else (scheduled, live, postponed) under upcoming (soonest first).
 */
export function splitFixtures<T extends Pick<ImportedFixture, 'id' | 'status' | 'kickoffAt'>>(
  upcoming: T[],
  recent: T[],
): { upcoming: T[]; results: T[] } {
  const byId = new Map<string, T>()
  for (const fixture of [...upcoming, ...recent]) byId.set(fixture.id, fixture)
  const unique = [...byId.values()]
  const time = (f: T) => new Date(f.kickoffAt).getTime()
  return {
    upcoming: unique.filter((f) => f.status !== 'finished').sort((a, b) => time(a) - time(b)),
    results: unique.filter((f) => f.status === 'finished').sort((a, b) => time(b) - time(a)),
  }
}
