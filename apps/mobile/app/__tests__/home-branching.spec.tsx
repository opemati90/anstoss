import React from 'react'
import { render } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import HomeScreen from '../(tabs)/index'
import { setFeatureOverride, clearFeatureOverrides } from '../../src/utils/featureFlags'

type AuthState = {
  user: { name: string; registrationRole: string | null } | null
  activeClub: {
    role: string
    club: { id: string; name: string; badgeUrl: string | null; primaryColor: string }
    permissions?: Record<string, boolean>
  } | null
  activeTeamId: string | null
  activeTeamAccess: { role: string } | null
  activeRoleMode: 'ADMIN' | 'COACH' | 'PLAYER' | 'PARENT' | 'FREE_AGENT' | null
  teamsForActiveClub: unknown[]
}

const authState: AuthState = {
  user: { name: 'QA', registrationRole: 'PLAYER' },
  activeClub: null,
  activeTeamId: null,
  activeTeamAccess: null,
  activeRoleMode: null,
  teamsForActiveClub: [],
}

function resetAuthState() {
  authState.user = { name: 'QA', registrationRole: 'PLAYER' }
  authState.activeClub = null
  authState.activeTeamId = null
  authState.activeTeamAccess = null
  authState.activeRoleMode = null
  authState.teamsForActiveClub = []
}

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useFocusEffect: (cb: () => void) => {
    const React = require('react')
    React.useEffect(() => {
      cb()
    }, [cb])
  },
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => authState,
}))

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
  api: jest.fn(() => Promise.resolve([])),
}))

jest.mock('../../src/components/home/LegacyHomeScreen', () => ({
  LegacyHomeScreen: () => {
    const React = require('react')
    const { Text } = require('react-native')
    return React.createElement(Text, null, 'LEGACY HOME')
  },
}))

jest.mock('../../src/components/home/AdminHome', () => ({
  AdminHome: () => {
    const React = require('react')
    const { Text } = require('react-native')
    return React.createElement(Text, null, 'ADMIN HOME')
  },
}))

jest.mock('../../src/components/home/CoachHome', () => ({
  CoachHome: () => {
    const React = require('react')
    const { Text } = require('react-native')
    return React.createElement(Text, null, 'COACH HOME')
  },
}))

jest.mock('../../src/components/home/PlayerHome', () => ({
  PlayerHome: () => {
    const React = require('react')
    const { Text } = require('react-native')
    return React.createElement(Text, null, 'PLAYER HOME')
  },
}))

jest.mock('../../src/components/home/ParentHome', () => ({
  ParentHome: () => {
    const React = require('react')
    const { Text } = require('react-native')
    return React.createElement(Text, null, 'PARENT HOME')
  },
}))

jest.mock('../../src/components/home/FreeAgentHome', () => ({
  FreeAgentHome: () => {
    const React = require('react')
    const { Text } = require('react-native')
    return React.createElement(Text, null, 'FREE AGENT HOME')
  },
}))

jest.mock('../../src/components/sponsors/SponsorStrip', () => ({
  SponsorStrip: () => null,
}))

jest.mock('../../src/components/TeamSwitcher', () => ({
  TeamSwitcher: () => null,
}))

jest.mock('react-i18next', () => {
  const t = (k: string, opts?: { defaultValue?: string } & Record<string, unknown>) => {
    if (opts && typeof opts === 'object' && typeof opts.defaultValue === 'string') {
      // Resolve {{var}} placeholders in defaultValue against opts so plurals
      // and interpolations match the visible text the user sees.
      return opts.defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, name) => {
        const v = (opts as Record<string, unknown>)[name]
        return v == null ? '' : String(v)
      })
    }
    return k
  }
  return { useTranslation: () => ({ t }) }
})

jest.mock('../../src/i18n', () => ({
  getAppLanguage: () => 'en',
  getAppLocale: () => 'en-GB',
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

describe('HomeScreen branching', () => {
  beforeEach(() => {
    resetAuthState()
  })

  afterEach(() => clearFeatureOverrides())

  it('falls back to LegacyHomeScreen when flag is off', () => {
    setFeatureOverride('anstoss.roleAwareHome', false)
    authState.activeClub = {
      role: 'OWNER',
      club: { id: 'c1', name: 'FC QA', badgeUrl: null, primaryColor: '#000' },
    }
    const { getByText } = render(wrap(<HomeScreen />))
    expect(getByText('LEGACY HOME')).toBeTruthy()
  })

  it('renders AdminHome branch for OWNER when flag is on', async () => {
    setFeatureOverride('anstoss.roleAwareHome', true)
    authState.activeClub = {
      role: 'OWNER',
      club: { id: 'c1', name: 'FC QA', badgeUrl: null, primaryColor: '#000' },
    }
    const { findByText } = render(wrap(<HomeScreen />))
    expect(await findByText('ADMIN HOME')).toBeTruthy()
  })

  it('renders CoachHome branch for COACH', async () => {
    setFeatureOverride('anstoss.roleAwareHome', true)
    authState.activeClub = {
      role: 'COACH',
      club: { id: 'c1', name: 'FC QA', badgeUrl: null, primaryColor: '#000' },
    }
    authState.activeTeamId = 'team-1'
    const { findByText } = render(wrap(<HomeScreen />))
    expect(await findByText('COACH HOME')).toBeTruthy()
  })

  it('renders PlayerHome branch for PLAYER', async () => {
    setFeatureOverride('anstoss.roleAwareHome', true)
    authState.activeClub = {
      role: 'PLAYER',
      club: { id: 'c1', name: 'FC QA', badgeUrl: null, primaryColor: '#000' },
    }
    authState.activeTeamId = 'team-1'
    const { findByText } = render(wrap(<HomeScreen />))
    expect(await findByText('PLAYER HOME')).toBeTruthy()
  })

  it('renders ParentHome branch for PARENT', async () => {
    setFeatureOverride('anstoss.roleAwareHome', true)
    authState.activeClub = {
      role: 'PARENT',
      club: { id: 'c1', name: 'FC QA', badgeUrl: null, primaryColor: '#000' },
    }
    authState.activeTeamId = null
    const { findByText } = render(wrap(<HomeScreen />))
    expect(await findByText('PARENT HOME')).toBeTruthy()
  })

  it('renders CoachHome when a parent has selected coach team access', async () => {
    setFeatureOverride('anstoss.roleAwareHome', true)
    authState.activeClub = {
      role: 'PARENT',
      club: { id: 'c1', name: 'FC QA', badgeUrl: null, primaryColor: '#000' },
    }
    authState.activeTeamId = 'team-1'
    authState.activeTeamAccess = { role: 'ASSISTANT_COACH' }
    const { findByText, queryByText } = render(wrap(<HomeScreen />))

    expect(await findByText('COACH HOME')).toBeTruthy()
    expect(queryByText('PARENT HOME')).toBeNull()
  })

  it('renders PlayerHome when a parent has selected player team access', async () => {
    setFeatureOverride('anstoss.roleAwareHome', true)
    authState.activeClub = {
      role: 'PARENT',
      club: { id: 'c1', name: 'FC QA', badgeUrl: null, primaryColor: '#000' },
    }
    authState.activeTeamId = 'team-1'
    authState.activeTeamAccess = { role: 'PLAYER' }
    const { findByText, queryByText } = render(wrap(<HomeScreen />))

    expect(await findByText('PLAYER HOME')).toBeTruthy()
    expect(queryByText('PARENT HOME')).toBeNull()
  })

  it('lets an admin who also plays explicitly enter the player home', async () => {
    setFeatureOverride('anstoss.roleAwareHome', true)
    authState.activeClub = {
      role: 'ADMIN',
      club: { id: 'c1', name: 'FC QA', badgeUrl: null, primaryColor: '#000' },
    }
    authState.activeTeamId = 'team-1'
    authState.activeTeamAccess = { role: 'PLAYER' }
    authState.activeRoleMode = 'PLAYER'
    const { findByText, queryByText } = render(wrap(<HomeScreen />))

    expect(await findByText('PLAYER HOME')).toBeTruthy()
    expect(queryByText('ADMIN HOME')).toBeNull()
  })

  it('lets a parent who also plays switch between parent and player homes', async () => {
    setFeatureOverride('anstoss.roleAwareHome', true)
    authState.activeClub = {
      role: 'PARENT',
      club: { id: 'c1', name: 'FC QA', badgeUrl: null, primaryColor: '#000' },
    }
    authState.activeTeamId = 'team-1'
    authState.activeTeamAccess = { role: 'PLAYER' }
    authState.activeRoleMode = 'PARENT'
    const { findByText, queryByText } = render(wrap(<HomeScreen />))

    expect(await findByText('PARENT HOME')).toBeTruthy()
    expect(queryByText('PLAYER HOME')).toBeNull()
  })

  it('renders FreeAgentHome when no club and registrationRole is FREE_AGENT', async () => {
    setFeatureOverride('anstoss.roleAwareHome', true)
    authState.activeClub = null
    authState.user = { name: 'QA', registrationRole: 'FREE_AGENT' }
    const { findByText } = render(wrap(<HomeScreen />))
    expect(await findByText('FREE AGENT HOME')).toBeTruthy()
  })
})
