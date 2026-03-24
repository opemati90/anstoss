import {
  buildExternalMatchId,
  calculateFormStreak,
  collectFixtureChanges,
  extractFussballTeamId,
  mapTableRows,
  parseApiFussballKickoff,
  parseFussballTeamPage,
} from './fussball.utils'

describe('fussball utils', () => {
  it('extracts a team id from a team url', () => {
    expect(
      extractFussballTeamId(
        'https://next.fussball.de/mannschaft/-/011MI9MUDK000000VTVG0001VTR8C1K7',
      ),
    ).toBe('011MI9MUDK000000VTVG0001VTR8C1K7')
  })

  it('parses team preview data from recorded public html', () => {
    const preview = parseFussballTeamPage(
      `
        <html>
          <head>
            <meta property="og:title" content="FC Anstoss" />
          </head>
          <body>
            <section>
              <h2>Wettbewerbe</h2>
              <p>Kreisliga A</p>
            </section>
            <section>
              <h2>Spielstätten</h2>
              <p>Adresse</p>
              <p>Am Sportplatz 1 50667 Köln</p>
            </section>
          </body>
        </html>
      `,
      'Fallback FC',
    )

    expect(preview).toEqual({
      label: 'FC Anstoss',
      competition: 'Kreisliga A',
      pitchAddress: 'Am Sportplatz 1 50667 Köln',
    })
  })

  it('builds stable kickoff timestamps and external match ids', () => {
    const kickoff = parseApiFussballKickoff('Sa. 24.03.26', '15:30')
    expect(kickoff?.toISOString()).toContain('2026-03-24T15:30:00')
    expect(
      buildExternalMatchId({
        externalTeamId: 'TEAMID',
        competition: 'Kreisliga A',
        kickoffAt: kickoff as Date,
        homeTeam: 'FC Anstoss',
        awayTeam: 'SV Test',
      }),
    ).toContain('TEAMID')
  })

  it('maps table rows and calculates form streak', () => {
    const rows = mapTableRows([
      {
        place: '1',
        team: 'FC Anstoss',
        img: null,
        games: '20',
        won: '15',
        draw: '3',
        lost: '2',
        goal: '55:20',
        goalDifference: '35',
        points: '48',
        isPromotion: true,
        isRelegation: false,
      },
    ])

    expect(rows[0].team).toBe('FC Anstoss')
    expect(
      calculateFormStreak(
        [
          {
            kickoffAt: '2026-03-20T10:00:00.000Z',
            status: 'finished',
            homeTeam: 'FC Anstoss',
            awayTeam: 'SV Test',
            resultHome: 2,
            resultAway: 1,
          },
          {
            kickoffAt: '2026-03-12T10:00:00.000Z',
            status: 'finished',
            homeTeam: 'SC Nord',
            awayTeam: 'FC Anstoss',
            resultHome: 0,
            resultAway: 0,
          },
        ],
        'FC Anstoss',
      ),
    ).toEqual(['W', 'D'])
  })

  it('detects relevant fixture changes', () => {
    expect(
      collectFixtureChanges(
        {
          kickoffAt: '2026-03-20T10:00:00.000Z',
          venueName: 'FC Anstoss',
          pitchAddress: 'Am Sportplatz 1',
          status: 'scheduled',
          resultHome: null,
          resultAway: null,
        },
        {
          kickoffAt: '2026-03-20T11:00:00.000Z',
          venueName: 'FC Anstoss',
          pitchAddress: 'Am Sportplatz 2',
          status: 'finished',
          resultHome: 2,
          resultAway: 1,
        },
        [],
      ),
    ).toEqual(['kickoff', 'pitchAddress', 'status', 'result'])
  })
})
