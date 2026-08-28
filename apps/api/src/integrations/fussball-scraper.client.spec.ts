import { FussballScraperClient, isLicensedFussballFeedEnabled } from './fussball-scraper.client'

describe('FussballScraperClient reference-only product mode', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    delete process.env.FUSSBALL_SCRAPER_URL
    delete process.env.FUSSBALL_SCRAPER_API_KEY
    delete process.env.FUSSBALL_LICENSED_FEED_ENABLED
  })

  it('cannot be enabled by deployment variables', async () => {
    process.env.FUSSBALL_SCRAPER_URL = 'https://scraper.example.test'
    process.env.FUSSBALL_SCRAPER_API_KEY = 'secret'
    process.env.FUSSBALL_LICENSED_FEED_ENABLED = 'true'
    const fetchMock = jest.fn()
    global.fetch = fetchMock as never
    const client = new FussballScraperClient()

    expect(isLicensedFussballFeedEnabled()).toBe(false)
    expect(client.isConfigured()).toBe(false)
    expect(client.isAvailable()).toBe(false)
    await expect(client.getGame('match-1')).resolves.toBeNull()
    await expect(client.searchClubs('example')).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports the disabled integration without making a health request', async () => {
    const fetchMock = jest.fn()
    global.fetch = fetchMock as never
    const client = new FussballScraperClient()

    await expect(client.healthCheck()).resolves.toEqual(
      expect.objectContaining({ ok: false }),
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
