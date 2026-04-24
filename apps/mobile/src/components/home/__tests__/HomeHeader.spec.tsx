import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { HomeHeader } from '../HomeHeader'

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

jest.mock('../../../context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../../theme/club-theme')
  return {
    useClubColors: () => ({
      ...FALLBACK_THEME,
      primary: '#1E3A5F',
      primary50: '#DDE7F1',
    }),
    useIsDark: () => false,
  }
})

describe('HomeHeader', () => {
  it('renders club name, role chip, and notification bell', () => {
    const onBellPress = jest.fn()
    const { getByText, getByLabelText } = render(
      <SafeAreaProvider
        initialMetrics={{
          insets: { top: 0, bottom: 0, left: 0, right: 0 },
          frame: { x: 0, y: 0, width: 375, height: 812 },
        }}
      >
        <HomeHeader
          clubName="FC QA"
          clubBadgeUrl={null}
          roleLabel="ADMIN"
          notificationCount={3}
          onNotificationsPress={onBellPress}
        />
      </SafeAreaProvider>,
    )

    expect(getByText('FC QA')).toBeTruthy()
    expect(getByText('ADMIN')).toBeTruthy()
    const bell = getByLabelText('Notifications, 3 unread')
    fireEvent.press(bell)
    expect(onBellPress).toHaveBeenCalled()
  })

  it('hides the unread badge when count is zero', () => {
    const { queryByLabelText, getByLabelText } = render(
      <SafeAreaProvider
        initialMetrics={{
          insets: { top: 0, bottom: 0, left: 0, right: 0 },
          frame: { x: 0, y: 0, width: 375, height: 812 },
        }}
      >
        <HomeHeader
          clubName="FC QA"
          clubBadgeUrl={null}
          roleLabel="PLAYER"
          notificationCount={0}
          onNotificationsPress={() => {}}
        />
      </SafeAreaProvider>,
    )
    expect(getByLabelText('Notifications')).toBeTruthy()
    expect(queryByLabelText('Notifications, 3 unread')).toBeNull()
  })
})
