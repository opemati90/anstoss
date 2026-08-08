import React from 'react'
import renderer, { act } from 'react-test-renderer'
import TabLayout from '../(tabs)/_layout'

const mockTabsScreen = jest.fn((_props?: unknown) => null)
const mockTabs = jest.fn((_props?: unknown) => undefined)

jest.mock('expo-router', () => {
  // eslint-disable-next-line no-useless-assignment
  const React = require('react')
  const { View } = require('react-native')

  const Tabs = (props: { children?: React.ReactNode }) => {
    mockTabs(props)
    return <View>{props.children}</View>
  }
  Tabs.Screen = (props: any) => mockTabsScreen(props)

  return { Tabs, Redirect: () => null, router: { push: jest.fn() } }
})

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'tabs.home': 'Start',
        'tabs.events': 'Termine',
        'tabs.chat': 'Chat',
        'tabs.roster': 'Kader',
        'tabs.more': 'Mehr',
        'tabs.profile': 'Profil',
      }

      return map[key] ?? key
    },
  }),
}))

jest.mock('../../src/context/ClubThemeContext', () => ({
  useClubColors: () => ({
    clubPrimary: '#1E3A5F',
  }),
  useIsDark: () => false,
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', registrationRole: 'CLUB_ADMIN' },
    isLoading: false,
    activeClub: {
      club: {
        id: 'club-1',
        name: 'Test FC',
        badgeUrl: null,
        primaryColor: '#1A1A18',
      },
      role: 'OWNER',
    },
    memberships: [
      {
        club: {
          id: 'club-1',
          name: 'Test FC',
          badgeUrl: null,
          primaryColor: '#1A1A18',
        },
        role: 'OWNER',
      },
    ],
  }),
}))

jest.mock('../../src/hooks/useClubSwitchGuard', () => ({
  useClubSwitchGuard: jest.fn(),
}))

jest.mock('../../src/components/ClubSwitcher', () => ({
  ClubSwitcher: () => null,
}))

jest.mock('../../src/components/DmListView', () => ({
  useDmUnreadCount: () => 0,
}))

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

describe('TabLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('registers translated tab titles for nested index routes', () => {
    act(() => {
      renderer.create(<TabLayout />)
    })

    expect(mockTabsScreen).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'chat/index',
        options: expect.objectContaining({
          title: 'Chat',
        }),
      }),
    )
    expect(mockTabsScreen).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'more/index',
        options: expect.objectContaining({
          title: 'Profil',
        }),
      }),
    )
    expect(mockTabsScreen).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'events/index',
        options: expect.objectContaining({
          title: 'Termine',
        }),
      }),
    )
    expect(mockTabsScreen).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'roster/index',
        options: expect.objectContaining({
          title: 'Kader',
        }),
      }),
    )
  })

  it('keeps tab scenes mounted to prevent blank transitions', () => {
    act(() => {
      renderer.create(<TabLayout />)
    })

    expect(mockTabs).toHaveBeenCalledWith(
      expect.objectContaining({
        detachInactiveScreens: false,
        screenOptions: expect.objectContaining({
          lazy: false,
          freezeOnBlur: false,
        }),
      }),
    )
  })
})
