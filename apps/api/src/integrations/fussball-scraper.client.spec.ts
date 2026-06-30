import { FussballScraperClient } from './fussball-scraper.client'

describe('FussballScraperClient', () => {
  const ORIGINAL_ENV = { ...process.env }
  const ORIGINAL_FETCH = global.fetch

  function makeClient() {
    return new FussballScraperClient()
  }

  beforeEach(() => {
    process.env.FUSSBALL_SCRAPER_URL = 'https://scraper.test'
    process.env.FUSSBALL_SCRAPER_API_KEY = 'test-key'
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    global.fetch = ORIGINAL_FETCH
    jest.clearAllMocks()
  })

  it('returns null when not configured', async () => {
    delete process.env.FUSSBALL_SCRAPER_URL
    delete process.env.FUSSBALL_SCRAPER_API_KEY
    const client = makeClient()
    expect(client.isConfigured()).toBe(false)
    expect(await client.getGame('any-id')).toBeNull()
  })

  it('returns null and tolerates 404 without opening the breaker', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    })
    global.fetch = fetchMock as unknown as typeof fetch
    const client = makeClient()

    const result = await client.getGame('missing-id')
    expect(result).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // 404 must not count toward the failure budget
    expect(client.isAvailable()).toBe(true)
  })

  it('opens the circuit after 3 consecutive 5xx and stops calling fetch', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    })
    global.fetch = fetchMock as unknown as typeof fetch
    const client = makeClient()

    // 3 failures opens the circuit.
    expect(await client.getGame('a')).toBeNull()
    expect(await client.getGame('b')).toBeNull()
    expect(await client.getGame('c')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(client.isAvailable()).toBe(false)

    // 4th call short-circuits — no extra fetch.
    expect(await client.getGame('d')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('a 2xx after 2 failures resets the failure counter', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      })
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 'game-1' }),
      })
    global.fetch = fetchMock as unknown as typeof fetch
    const client = makeClient()

    await client.getGame('a')
    await client.getGame('b')
    expect(client.isAvailable()).toBe(true) // 2 < 3 threshold

    const ok = await client.getGame('c')
    expect(ok).toEqual({ id: 'game-1' })

    // Subsequent failure should not immediately re-open.
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    })
    await client.getGame('d')
    expect(client.isAvailable()).toBe(true)
  })

  it('sends X-API-Key header on every authenticated request', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    })
    global.fetch = fetchMock as unknown as typeof fetch
    const client = makeClient()

    await client.searchClubs('hertha')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers['X-API-Key']).toBe('test-key')
  })

  it('encodes search query and skips short queries', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    })
    global.fetch = fetchMock as unknown as typeof fetch
    const client = makeClient()

    // Less than 3 chars should not even hit the network
    expect(await client.searchClubs('ab')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()

    await client.searchClubs('FC Bayern')
    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/search/clubs?query=FC%20Bayern')
  })

  it('getTeamScoringInsights hits the scoring-insights path and returns the payload', async () => {
    const payload = {
      team_name: 'SV Albatros',
      sample_size: 3,
      goal_timing: {
        team_name: 'SV Albatros',
        sample_size: 3,
        bands: [{ label: '1-15', scored: 2, conceded: 1 }],
      },
      top_scorers: [{ name: 'A. Müller', goals: 4, matches: 3 }],
    }
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    })
    global.fetch = fetchMock as unknown as typeof fetch
    const client = makeClient()

    const out = await client.getTeamScoringInsights('team-123')
    expect(out).toEqual(payload)
    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/team/team-123/scoring-insights')
  })

  it('toApiFussballGame maps a scraper game to the legacy shape', () => {
    const out = FussballScraperClient.toApiFussballGame({
      id: 'g-1',
      datetime_utc: '2026-05-10T15:30:00Z',
      competition: 'Bezirksliga',
      age_group: 'Herren',
      home_team: 'SV Albatros',
      home_logo: 'h.png',
      away_team: 'SV Babelsberg',
      away_logo: 'a.png',
      status: 'Beendet',
      home_score: '2',
      away_score: '1',
      location: 'Karl-Liebknecht-Stadion',
      location_url: 'https://maps.google.com/?q=...',
      match_events: null,
    })

    expect(out.gameId).toBe('g-1')
    expect(out.homeGoals).toBe(2)
    expect(out.awayGoals).toBe(1)
    expect(out.competition).toBe('Bezirksliga')
    expect(out.location).toBe('Karl-Liebknecht-Stadion')
  })

  it('toApiFussballGame survives missing scores', () => {
    const out = FussballScraperClient.toApiFussballGame({
      id: 'g-2',
      datetime_utc: '2026-05-10T15:30:00Z',
      competition: 'Bezirksliga',
      age_group: null,
      home_team: 'A',
      home_logo: '',
      away_team: 'B',
      away_logo: '',
      status: null,
      home_score: null,
      away_score: '',
      location: null,
      location_url: null,
      match_events: null,
    })

    expect(out.homeGoals).toBeNull()
    expect(out.awayGoals).toBeNull()
  })
})
