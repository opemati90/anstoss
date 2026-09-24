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
