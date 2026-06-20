import type { ImportedFixture } from '@anstoss/shared'

type MatchEventLike = {
  id?: string | null
  type?: string | null
  date?: string | Date | null
  team?: { id?: string | null } | null
}

const DEFAULT_FIXTURE_MATCH_TOLERANCE_MS = 5 * 60 * 1000

export function findFixtureForEvent(
  event: MatchEventLike | null | undefined,
  fixtures: ImportedFixture[] | null | undefined,
  toleranceMs = DEFAULT_FIXTURE_MATCH_TOLERANCE_MS,
): ImportedFixture | null {
  if (!event || event.type !== 'MATCH' || !fixtures?.length) return null

  if (event.id) {
    const direct = fixtures.find((fixture) => fixture.eventId === event.id)
    if (direct) return direct
  }

  if (!event.date) return null
  const eventMs = new Date(event.date).getTime()
  if (Number.isNaN(eventMs)) return null

  const eventTeamId = event.team?.id ?? null
  if (!eventTeamId) return null

  return (
    fixtures.find((fixture) => {
      if (fixture.teamId !== eventTeamId) return false
      const fixtureMs = new Date(fixture.kickoffAt).getTime()
      return (
        !Number.isNaN(fixtureMs) &&
        Math.abs(fixtureMs - eventMs) <= toleranceMs
      )
    }) ?? null
  )
}
