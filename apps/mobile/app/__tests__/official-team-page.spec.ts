jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}) }))
jest.mock('react-native-webview', () => ({ WebView: 'WebView' }))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
jest.mock('../../src/context/ClubThemeContext', () => ({
  useClubColors: () => ({ background: '#fff', primary: '#000' }),
}))

import {
  parseOfficialPage,
  parseOfficialWidget,
  shouldAllowOfficialWidgetNavigation,
} from '../official-team-page'

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

describe('official FUSSBALL.DE widget policy', () => {
  it('accepts a validated widget id and type', () => {
    expect(
      parseOfficialWidget({
        widgetId: '47c66e04-204b-49ec-8a54-9e7e429df6c4',
        widgetType: 'competition',
      }),
    ).toEqual({
      id: '47c66e04-204b-49ec-8a54-9e7e429df6c4',
      type: 'competition',
    })
  })

  it.each([
    { widgetId: '<script>alert(1)</script>', widgetType: 'competition' },
    { widgetId: '47c66e04-204b-49ec-8a54-9e7e429df6c4', widgetType: '../../script' },
    { widgetId: 'short', widgetType: 'team' },
  ])('rejects unsafe widget metadata', (params) => {
    expect(parseOfficialWidget(params)).toBeNull()
  })

  it('allows only the generated document base and official destination pages', () => {
    expect(shouldAllowOfficialWidgetNavigation('about:blank')).toBe(true)
    expect(shouldAllowOfficialWidgetNavigation('https://www.fussball.de/')).toBe(true)
    expect(shouldAllowOfficialWidgetNavigation('https://www.fussball.de/team/123')).toBe(true)
    expect(shouldAllowOfficialWidgetNavigation('https://evil.example/')).toBe(false)
  })
})
