import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { PlayerHome } from '../../src/components/home/PlayerHome'

const mockApi = jest.fn()

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
  api: (...a: unknown[]) => mockApi(...a),
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

describe('PlayerHome', () => {
  beforeEach(() => {
    mockApi.mockImplementation((path: string) => {
      if (path.includes('/events?') && path.includes('scope=upcoming')) {
        return Promise.resolve([
          {
            id: 'e1',
            type: 'TRAINING',
            title: 'Monday training',
            date: '2026-04-28T18:00:00Z',
            myRsvp: null,
            yesCount: 0,
            maybeCount: 0,
            noCount: 0,
          },
        ])
      }
      if (path.includes('/chat/latest')) {
        return Promise.resolve({ preview: 'See you tomorrow!', author: 'Coach Max' })
      }
      if (path.includes('/announcements')) {
        return Promise.resolve([{ id: 'an1', title: 'Club BBQ', body: 'Saturday' }])
      }
      return Promise.resolve(null)
    })
  })

  it('renders the next-event RSVP hero', async () => {
    const { findByText } = render(wrap(<PlayerHome clubId="club-1" teamId="team-1" />))
    expect(await findByText('Monday training')).toBeTruthy()
    expect(await findByText('Yes')).toBeTruthy()
    expect(await findByText('Maybe')).toBeTruthy()
    expect(await findByText('No')).toBeTruthy()
  })

  it('RSVP Yes fires an API PUT', async () => {
    const { findByText } = render(wrap(<PlayerHome clubId="club-1" teamId="team-1" />))
    const yes = await findByText('Yes')
    fireEvent.press(yes)
    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith(
        expect.stringMatching(/\/events\/e1\/rsvp$/),
        expect.objectContaining({ method: 'PUT', body: { status: 'YES' } }),
      )
    })
  })

  it('renders chat preview', async () => {
    const { findByText } = render(wrap(<PlayerHome clubId="club-1" teamId="team-1" />))
    expect(await findByText(/See you tomorrow/)).toBeTruthy()
  })

  it('renders announcement titles', async () => {
    const { findByText } = render(wrap(<PlayerHome clubId="club-1" teamId="team-1" />))
    expect(await findByText('Club BBQ')).toBeTruthy()
  })
})
