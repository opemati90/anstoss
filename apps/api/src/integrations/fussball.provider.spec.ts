import { ServiceUnavailableException } from '@nestjs/common'
import { FussballProviderService } from './fussball.provider'

describe('FussballProviderService (reference-only)', () => {
  const provider = new FussballProviderService()

  beforeEach(() => {
    process.env.FUSSBALL_LICENSED_FEED_ENABLED = 'true'
    process.env.FUSSBALL_SCRAPER_URL = 'https://scraper.invalid'
  })

  afterEach(() => {
    delete process.env.FUSSBALL_LICENSED_FEED_ENABLED
    delete process.env.FUSSBALL_SCRAPER_URL
  })

  it.each([
    ['fixture bundle', () => provider.fetchTeamBundle('team-1')],
    ['roster', () => provider.fetchTeamRoster('team-1')],
    ['team page', () => provider.fetchTeamPage('team-1')],
  ])('keeps %s imports disabled even when legacy env flags are set', async (_label, run) => {
    await expect(run()).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('does not expose lineup data', async () => {
    await expect(provider.fetchMatchLineup('match-1')).resolves.toBeNull()
  })
})
