jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}) }))
jest.mock('react-native-webview', () => ({ WebView: 'WebView' }))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
jest.mock('../../src/context/ClubThemeContext', () => ({
  useClubColors: () => ({ background: '#fff', primary: '#000' }),
}))

import { parseOfficialPage } from '../official-team-page'

describe('official team-page URL policy', () => {
  it.each([
    'https://www.fussball.de/mannschaft/fc-test/-/saison/2026/team-id/123',
    'https://next.fussball.de/team/fc-test/123',
    'https://www.dfb.de/team/fc-test',
    'https://www.fupa.net/team/fc-test',
  ])('allows a specific official HTTPS page: %s', (url) => {
    expect(parseOfficialPage(url)).toBe(url)
  })

  it.each([
    'http://www.fussball.de/team/123',
    'https://fussball.de.evil.example/team/123',
    'https://user@www.fussball.de/team/123',
    'https://user:password@www.fussball.de/team/123',
    'https://www.fussball.de:444/team/123',
    'https://www.fussball.de/',
    'file:///etc/passwd',
    'not-a-url',
  ])('rejects an unsafe or non-specific page: %s', (url) => {
    expect(parseOfficialPage(url)).toBeNull()
  })

  it('removes fragments before loading the official page', () => {
    expect(parseOfficialPage('https://www.fussball.de/team/123#token')).toBe(
      'https://www.fussball.de/team/123',
    )
  })
})
