import React from 'react'
import { render } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ParentHome } from '../../src/components/home/ParentHome'

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
    if (path.includes('/me/children-events')) {
      return Promise.resolve([
        {
          id: 'c1',
          title: 'U12 match',
          date: '2026-04-28T10:00:00Z',
          location: 'Pitch 2',
          teamName: 'U12',
          teamDisplayName: 'U12 Youth',
        },
      ])
    }
    if (path.includes('/me/children-announcements')) {
      return Promise.resolve([
        { id: 'an1', title: 'Team photo day', body: 'Next Saturday' },
      ])
    }
    return Promise.resolve([])
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

describe('ParentHome', () => {
  it("renders the child's next event", async () => {
    const { findByText } = render(wrap(<ParentHome />))
    expect(await findByText('U12 match')).toBeTruthy()
    expect(await findByText(/U12 Youth/)).toBeTruthy()
  })

  it("renders the child's team announcements", async () => {
    const { findByText } = render(wrap(<ParentHome />))
    expect(await findByText('Team photo day')).toBeTruthy()
  })
})
