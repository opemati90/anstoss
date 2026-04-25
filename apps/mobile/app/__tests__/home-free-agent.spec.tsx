import React from 'react'
import { render } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { FreeAgentHome } from '../../src/components/home/FreeAgentHome'

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))

jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({
      ...FALLBACK_THEME,
      primary: '#1E3A5F',
      primary50: '#DDE7F1',
    }),
    useIsDark: () => false,
  }
})

jest.mock('../../src/api/client', () => ({
  api: jest.fn((path: string) => {
    if (path.includes('/me/free-agent-profile')) {
      return Promise.resolve({
        displayName: 'Lea',
        position: ['ST'],
        experienceYears: 3,
        location: 'Berlin',
        availableForTrials: true,
        bio: '',
      })
    }
    return Promise.resolve(null)
  }),
}))

const wrap = (ui: React.ReactElement) => (
  <SafeAreaProvider
    initialMetrics={{
      insets: { top: 0, bottom: 0, left: 0, right: 0 },
      frame: { x: 0, y: 0, width: 375, height: 812 },
    }}
  >
    {ui}
  </SafeAreaProvider>
)

describe('FreeAgentHome', () => {
  it('renders the profile completeness card', async () => {
    const { findByText } = render(wrap(<FreeAgentHome />))
    expect(await findByText(/Profile/i)).toBeTruthy()
    expect(await findByText(/%$/)).toBeTruthy()
  })

  it('renders the trial invites empty state', async () => {
    const { findByText } = render(wrap(<FreeAgentHome />))
    expect(await findByText(/No trial invites yet/i)).toBeTruthy()
  })

  it('renders the nearby clubs empty state', async () => {
    const { findByText } = render(wrap(<FreeAgentHome />))
    expect(await findByText(/Nearby clubs/i)).toBeTruthy()
    expect(await findByText(/We'll surface clubs/i)).toBeTruthy()
  })
})
