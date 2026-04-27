import React from 'react'
import { render, waitFor } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { CoachHome } from '../../src/components/home/CoachHome'

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
    if (path.includes('scope=nextMatch')) {
      return Promise.resolve([
        {
          id: 'm1',
          type: 'MATCH',
          title: 'vs FC Nord',
          date: '2026-05-04T15:30:00Z',
          location: 'Stadion',
        },
      ])
    }
    if (path.includes('scope=thisWeek')) {
      return Promise.resolve([
        {
          id: 'e1',
          type: 'TRAINING',
          title: 'Tuesday training',
          date: '2026-04-23T18:00:00Z',
        },
        {
          id: 'e2',
          type: 'TRAINING',
          title: 'Thursday training',
          date: '2026-04-25T18:00:00Z',
        },
      ])
    }
    if (path.includes('/roster')) {
      return Promise.resolve({ active: 18, trial: 2 })
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

describe('CoachHome', () => {
  it('renders next match with large kick-off time', async () => {
    const { findByText, findAllByText } = render(
      wrap(<CoachHome clubId="club-1" teamId="team-1" />),
    )
    const titleHits = await findAllByText('vs FC Nord')
    expect(titleHits.length).toBeGreaterThan(0)
    expect(await findByText('15:30')).toBeTruthy()
  })

  it("renders this week's events", async () => {
    const { findByText } = render(wrap(<CoachHome clubId="club-1" teamId="team-1" />))
    expect(await findByText('Tuesday training')).toBeTruthy()
    expect(await findByText('Thursday training')).toBeTruthy()
  })

  it('renders roster snapshot counts', async () => {
    const { findByText } = render(wrap(<CoachHome clubId="club-1" teamId="team-1" />))
    await waitFor(async () => {
      expect(await findByText('18')).toBeTruthy()
    })
  })
})
