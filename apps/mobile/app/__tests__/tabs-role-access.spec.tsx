import React from 'react'
import renderer, { act } from 'react-test-renderer'
import TabLayout from '../(tabs)/_layout'

const mockTabsScreen = jest.fn((_props?: unknown) => null)

const authState: {
  activeClub: any
  activeTeamAccess: any
  memberships: any[]
} = {
  activeClub: {
    club: {
      id: 'club-1',
      name: 'SV Albatros',
      badgeUrl: null,
      primaryColor: '#4A4A48',
    },
    role: 'PLAYER',
  },
  activeTeamAccess: null,
  memberships: [
    {
      club: {
        id: 'club-1',
        name: 'SV Albatros',
        badgeUrl: null,
        primaryColor: '#4A4A48',
      },
      role: 'PLAYER',
    },
  ],
}

jest.mock('expo-router', () => {
  // eslint-disable-next-line no-useless-assignment
  const React = require('react')
  const { View } = require('react-native')

  const Tabs = ({ children }: { children?: React.ReactNode }) => <View>{children}</View>
  Tabs.Screen = (props: unknown) => mockTabsScreen(props)

  return { Tabs }
})

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'tabs.home': 'Home',
        'tabs.events': 'Events',
        'tabs.schedule': 'Schedule',
        'tabs.chat': 'Chat',
        'tabs.roster': 'Roster',
        'tabs.more': 'More',
      }

      return map[key] ?? key
    },
  }),
}))

jest.mock('../../src/context/ClubThemeContext', () => ({
  useClubColors: () => ({
    clubPrimary: '#4A4A48',
  }),
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => authState,
}))

jest.mock('../../src/hooks/useClubSwitchGuard', () => ({
  useClubSwitchGuard: jest.fn(),
}))

jest.mock('../../src/components/ClubSwitcher', () => ({
  ClubSwitcher: () => null,
}))

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

describe('TabLayout role access', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('hides the roster tab for parents and renames events to schedule', () => {
    authState.activeClub.role = 'PARENT'
    authState.activeTeamAccess = null

    act(() => {
      renderer.create(<TabLayout />)
    })

    expect(mockTabsScreen).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'events/index',
        options: expect.objectContaining({
          title: 'Schedule',
        }),
      }),
    )
    expect(mockTabsScreen).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'roster/index',
        options: expect.objectContaining({
          href: null,
        }),
      }),
    )
  })

  it('keeps the roster tab available for coaches', () => {
    authState.activeClub.role = 'COACH'
    authState.activeTeamAccess = {
      role: 'HEAD_COACH',
      team: {
        id: 'team-1',
        displayName: 'Senior Team',
        clubId: 'club-1',
      },
    }

    act(() => {
      renderer.create(<TabLayout />)
    })

    expect(mockTabsScreen).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'roster/index',
        options: expect.objectContaining({
          href: undefined,
        }),
      }),
    )
  })
})
