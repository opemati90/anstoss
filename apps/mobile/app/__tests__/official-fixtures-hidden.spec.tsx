import React from 'react'
import { render } from '@testing-library/react-native'

let mockParams: Record<string, string> = {}
jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native')
    return <Text testID="redirect">{href}</Text>
  },
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn() },
}))
jest.mock('../../src/api/client', () => ({ api: jest.fn() }))
jest.mock('../../src/context/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../../src/context/ClubThemeContext', () => ({ useClubColors: jest.fn() }))
jest.mock('react-native-webview', () => ({ WebView: 'WebView' }))
jest.mock('../../src/components/match/RecordedMatchLive', () => ({
  RecordedMatchLive: ({ eventId }: { eventId: string }) => {
    const { Text } = require('react-native')
    return <Text testID="recorded-match">{eventId}</Text>
  },
}))

import TeamSpiele from '../team-spiele'
import LeagueTable from '../league-table'
import FussballLink from '../fussball-link'
import OfficialPage from '../official-team-page'
import MatchDetail from '../match-detail'
import MatchLive from '../match-live'
import PhotoWall from '../photo-wall'
import { api } from '../../src/api/client'

beforeEach(() => {
  jest.clearAllMocks()
  mockParams = { fixtureId: 'old-fixture', teamId: 'team-1' }
})

it.each([
  ['fixtures', TeamSpiele],
  ['league table', LeagueTable],
  ['provider setup', FussballLink],
  ['provider webview', OfficialPage],
  ['imported match', MatchDetail],
  ['imported live match', MatchLive],
  ['fixture photos', PhotoWall],
] as const)('redirects old %s links without loading provider data', (_name, Component) => {
  const screen = render(<Component />)
  expect(screen.getByTestId('redirect').props.children).toBe('/(tabs)')
  expect(api).not.toHaveBeenCalled()
})

it('keeps coach-recorded matches accessible', () => {
  mockParams = { eventId: 'match-1' }
  const screen = render(<MatchLive />)
  expect(screen.getByTestId('recorded-match').props.children).toBe('match-1')
  expect(screen.queryByTestId('redirect')).toBeNull()
})
