import React from 'react'
import { render, waitFor } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import HomeScreen from '../(tabs)/index'
import {
  setFeatureOverride,
  clearFeatureOverrides,
} from '../../src/utils/featureFlags'

type AuthState = {
  user: { name: string; registrationRole: string | null } | null
  activeClub:
    | {
        role: string
        club: { id: string; name: string; badgeUrl: string | null; primaryColor: string }
        permissions?: Record<string, boolean>
      }
    | null
  activeTeamId: string | null
  activeTeamAccess: unknown
  teamsForActiveClub: unknown[]
}

const authState: AuthState = {
  user: { name: 'QA', registrationRole: 'PLAYER' },
  activeClub: null,
  activeTeamId: null,
  activeTeamAccess: null,
  teamsForActiveClub: [],
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

jest.mock('../../src/components/TeamSwitcher', () => ({
  TeamSwitcher: () => null,
}))

jest.mock('react-i18next', () => {
  const t = (k: string) => k
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
  afterEach(() => clearFeatureOverrides())

  it('falls back to LegacyHomeScreen when flag is off', () => {
    setFeatureOverride('anstoss.roleAwareHome', false)
    authState.activeClub = {
      role: 'OWNER',
      club: { id: 'c1', name: 'FC QA', badgeUrl: null, primaryColor: '#000' },
    }
    const { getByText } = render(wrap(<HomeScreen />))
    expect(getByText(/home\.greeting/)).toBeTruthy()
  })

  it('renders AdminHome branch for OWNER when flag is on', async () => {
    setFeatureOverride('anstoss.roleAwareHome', true)
    authState.activeClub = {
      role: 'OWNER',
      club: { id: 'c1', name: 'FC QA', badgeUrl: null, primaryColor: '#000' },
    }
    const { findByText } = render(wrap(<HomeScreen />))
    expect(await findByText(/Dashboard/i)).toBeTruthy()
  })

  it('renders CoachHome branch for COACH', async () => {
    setFeatureOverride('anstoss.roleAwareHome', true)
    authState.activeClub = {
      role: 'COACH',
      club: { id: 'c1', name: 'FC QA', badgeUrl: null, primaryColor: '#000' },
    }
    authState.activeTeamId = 'team-1'
    const { findByText } = render(wrap(<HomeScreen />))
    expect(await findByText(/Next match/i)).toBeTruthy()
  })

  it('renders PlayerHome branch for PLAYER', async () => {
    setFeatureOverride('anstoss.roleAwareHome', true)
    authState.activeClub = {
      role: 'PLAYER',
      club: { id: 'c1', name: 'FC QA', badgeUrl: null, primaryColor: '#000' },
    }
    authState.activeTeamId = 'team-1'
    const { findByText } = render(wrap(<HomeScreen />))
    expect(await findByText(/Next event/i)).toBeTruthy()
  })

  it('renders ParentHome branch for PARENT', async () => {
    setFeatureOverride('anstoss.roleAwareHome', true)
    authState.activeClub = {
      role: 'PARENT',
      club: { id: 'c1', name: 'FC QA', badgeUrl: null, primaryColor: '#000' },
    }
    authState.activeTeamId = null
    const { findByText } = render(wrap(<HomeScreen />))
    await waitFor(async () =>
      expect(await findByText(/Next event/i)).toBeTruthy(),
    )
  })

  it('renders FreeAgentHome when no club and registrationRole is FREE_AGENT', async () => {
    setFeatureOverride('anstoss.roleAwareHome', true)
    authState.activeClub = null
    authState.user = { name: 'QA', registrationRole: 'FREE_AGENT' }
    const { findAllByText } = render(wrap(<HomeScreen />))
    const hits = await findAllByText(/Profile/i)
    expect(hits.length).toBeGreaterThan(0)
  })
})
