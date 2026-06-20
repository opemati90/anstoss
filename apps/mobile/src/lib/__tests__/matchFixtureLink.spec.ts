import type { ImportedFixture } from '@anstoss/shared'
import { findFixtureForEvent } from '../matchFixtureLink'

function fixture(overrides: Partial<ImportedFixture>): ImportedFixture {
  return {
    id: 'fixture-1',
    clubId: 'club-1',
    teamId: 'team-1',
    teamLinkId: 'link-1',
    provider: 'fussball_public_page',
    externalMatchId: 'external-1',
    competition: 'League',
    season: null,
    kickoffAt: '2026-06-20T15:00:00.000Z',
    status: 'scheduled',
    homeTeam: 'Home',
    awayTeam: 'Away',
    homeLogo: null,
    awayLogo: null,
    venueName: null,
    pitchAddress: null,
    resultHome: null,
    resultAway: null,
    tableSnapshot: null,
    sourceConfidence: 'unofficial_public',
    rawPayload: {},
    lastSeenAt: '2026-06-19T12:00:00.000Z',
    createdAt: '2026-06-19T12:00:00.000Z',
    updatedAt: '2026-06-19T12:00:00.000Z',
    overlay: null,
    eventId: null,
    ...overrides,
  }
}

describe('findFixtureForEvent', () => {
  it('prefers the explicit event link when present', () => {
    const linked = fixture({
      id: 'fixture-linked',
      eventId: 'event-1',
      kickoffAt: '2026-06-20T18:00:00.000Z',
    })
    const timeMatch = fixture({
      id: 'fixture-time',
      eventId: null,
      kickoffAt: '2026-06-20T15:00:00.000Z',
    })

    expect(
      findFixtureForEvent(
        { id: 'event-1', type: 'MATCH', date: '2026-06-20T15:00:00.000Z' },
        [timeMatch, linked],
      )?.id,
    ).toBe('fixture-linked')
  })

  it('falls back to same-team kickoff proximity', () => {
    const otherTeam = fixture({ id: 'other-team', teamId: 'team-2' })
    const sameTeam = fixture({
      id: 'same-team',
      teamId: 'team-1',
      kickoffAt: '2026-06-20T15:00:00.000Z',
    })

    expect(
      findFixtureForEvent(
        {
          id: 'event-1',
          type: 'MATCH',
          date: '2026-06-20T15:05:00.000Z',
          team: { id: 'team-1' },
        },
        [otherTeam, sameTeam],
      )?.id,
    ).toBe('same-team')
  })

  it('does not infer a time-only link without the event team', () => {
    const candidate = fixture({
      id: 'candidate',
      kickoffAt: '2026-06-20T15:00:00.000Z',
    })

    expect(
      findFixtureForEvent(
        {
          id: 'event-1',
          type: 'MATCH',
          date: '2026-06-20T15:00:00.000Z',
        },
        [candidate],
      ),
    ).toBeNull()
  })

  it('does not link non-match or distant events', () => {
    const candidate = fixture({})

    expect(
      findFixtureForEvent(
        { id: 'event-1', type: 'TRAINING', date: candidate.kickoffAt },
        [candidate],
      ),
    ).toBeNull()
    expect(
      findFixtureForEvent(
        { id: 'event-1', type: 'MATCH', date: '2026-06-20T16:00:00.000Z' },
        [candidate],
      ),
    ).toBeNull()
  })
})
