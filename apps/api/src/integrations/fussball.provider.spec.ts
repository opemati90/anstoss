import { ServiceUnavailableException } from '@nestjs/common'
import { FussballProviderService } from './fussball.provider'
import type {
  FussballScraperClient,
  ScraperGame,
  ScraperTeamInfoResponse,
} from './fussball-scraper.client'

function game(over: Partial<ScraperGame>): ScraperGame {
  return {
    id: 'g1',
    datetime_utc: '2026-06-07T15:00:00Z',
    competition: 'Kreisliga A',
    age_group: null,
    home_team: 'SV Albatros',
    home_logo: 'https://logo/home.png',
    away_team: 'FC Adler',
    away_logo: 'https://logo/away.png',
    status: null,
    home_score: null,
    away_score: null,
    location: 'Sportplatz Albatros, Musterstr. 1',
    location_url: null,
    match_events: null,
    ...over,
  }
}

function makeScraper(over: Partial<FussballScraperClient>): FussballScraperClient {
  return {
    isConfigured: () => true,
    getTeamInfo: jest.fn(),
    ...over,
  } as unknown as FussballScraperClient
}

describe('FussballProviderService (scraper-backed)', () => {
  describe('fetchTeamBundle', () => {
    it('throws ServiceUnavailable when the scraper is not configured', async () => {
      const provider = new FussballProviderService(
        makeScraper({ isConfigured: () => false }),
      )
      await expect(provider.fetchTeamBundle('team-1')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      )
    })

    it('throws ServiceUnavailable when the scraper returns no data', async () => {
      const provider = new FussballProviderService(
        makeScraper({ getTeamInfo: jest.fn().mockResolvedValue(null) }),
      )
      await expect(provider.fetchTeamBundle('team-1')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      )
    })

    it('maps scraper games + table to the ApiFussball bundle shape', async () => {
      const info: ScraperTeamInfoResponse = {
        table: {
          entries: [
            {
              place: 1,
              team: 'SV Albatros',
              img: 'https://logo/home.png',
              games: 10,
              won: 7,
              draw: 2,
              lost: 1,
              goal: '25:10',
              goal_difference: 15,
              points: 23,
              is_promotion: true,
              is_relegation: false,
            },
          ],
        },
        prev_games: [game({ id: 'p1', home_score: '2', away_score: '1', status: 'Beendet' })],
        next_games: [game({ id: 'n1', datetime_utc: '2026-06-14T13:30:00Z' })],
      }
      const provider = new FussballProviderService(
        makeScraper({ getTeamInfo: jest.fn().mockResolvedValue(info) }),
      )

      const bundle = await provider.fetchTeamBundle('team-1')

      // Game shape mapped (ISO → German date/time in UTC, score/teams/logos).
      expect(bundle.prevGames[0]).toMatchObject({
        date: '07.06.2026',
        time: '15:00',
        homeTeam: 'SV Albatros',
        awayTeam: 'FC Adler',
        homeScore: '2',
        awayScore: '1',
        status: 'Beendet',
        competition: 'Kreisliga A',
      })
      expect(bundle.nextGames[0]).toMatchObject({ date: '14.06.2026', time: '13:30' })
      // Table row mapped incl. snake_case → camelCase.
      expect(bundle.table[0]).toMatchObject({
        place: 1,
        team: 'SV Albatros',
        goalDifference: 15,
        points: 23,
        isPromotion: true,
        isRelegation: false,
      })
    })
  })

  describe('fetchMatchLineup', () => {
    it('returns null (scraper has no structured lineups)', async () => {
      const provider = new FussballProviderService(makeScraper({}))
      await expect(provider.fetchMatchLineup('match-1')).resolves.toBeNull()
    })
  })

  describe('fetchTeamPage', () => {
    it('derives the team label as the side present in every game + venue from a home game', async () => {
      const info: ScraperTeamInfoResponse = {
        table: null,
        prev_games: [
          game({ home_team: 'SV Albatros', away_team: 'FC Adler' }),
          game({ home_team: 'TSV Falke', away_team: 'SV Albatros', location: 'Falke-Arena' }),
        ],
        next_games: [game({ home_team: 'SV Albatros', away_team: 'SC Möwe' })],
      }
      const provider = new FussballProviderService(
        makeScraper({ getTeamInfo: jest.fn().mockResolvedValue(info) }),
      )

      const { preview } = await provider.fetchTeamPage(
        'https://www.fussball.de/mannschaft/-/team-id/011MIID4P4000000VTVG0001VTR8C1K7',
      )

      expect(preview.label).toBe('SV Albatros')
      expect(preview.competition).toBe('Kreisliga A')
      // venue from the home game (home_team === derived label)
      expect(preview.pitchAddress).toBe('Sportplatz Albatros, Musterstr. 1')
    })
  })
})
