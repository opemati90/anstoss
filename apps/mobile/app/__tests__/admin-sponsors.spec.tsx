import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react-native'

const mockRouterPush = jest.fn()
const authState = {
  activeClub: {
    club: { id: 'c1', name: 'FC Test', slug: 'fc-test' },
    role: 'OWNER',
  },
}
const entitlementsState = { features: ['sponsor_logos'] as string[] }

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockRouterPush(...args), back: jest.fn() },
}))
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown> & { defaultValue?: string }) => {
      const map: Record<string, string> = {
        'sponsors.editSponsorA11y': 'Edit {{name}}',
        'sponsors.deleteSponsorA11y': 'Delete {{name}}',
      }
      const template = map[key] ?? opts?.defaultValue ?? key
      return template.replace(/\{\{(\w+)\}\}/g, (_match, name) =>
        typeof opts?.[name] === 'string' ? opts[name] : '',
      )
    },
    i18n: { language: 'en' },
  }),
}))
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => authState }))
jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({
      ...FALLBACK_THEME,
      clubPrimary: '#000',
      clubPrimaryLight: '#eee',
      primary: '#000',
      primary50: '#eee',
    }),
    useIsDark: () => false,
  }
})
jest.mock('../../src/api/client', () => ({
  api: jest.fn(),
  ApiError: class ApiError extends Error {
    status = 0
    code = ''
    constructor(msg: string, status = 0, code = '') {
      super(msg)
      this.status = status
      this.code = code
    }
  },
}))
jest.mock('../../src/hooks/useEntitlements', () => ({
  useEntitlements: () => ({
    has: (f: string) => entitlementsState.features.includes(f),
    refresh: jest.fn(),
    isPremium: true,
    loading: false,
    plan: 'PREMIUM',
    features: entitlementsState.features,
    data: null,
  }),
}))
jest.mock('../../src/components/billing/PaywallSheet', () => ({
  PaywallSheet: ({ visible }: { visible: boolean }) =>
    visible ? <></> : null,
}))
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({ canceled: true, assets: [] }),
}))
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { PNG: 'png' },
}))

import AdminSponsorsScreen from '../admin-sponsors'
import { api } from '../../src/api/client'

const mockApi = api as jest.Mock

describe('AdminSponsorsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockApi.mockReset()
    entitlementsState.features = ['sponsor_logos']
    authState.activeClub = {
      club: { id: 'c1', name: 'FC Test', slug: 'fc-test' },
      role: 'OWNER',
    }
  })

  it('renders the empty state when the club has no sponsors', async () => {
    mockApi.mockResolvedValue([])
    const { getByText } = render(<AdminSponsorsScreen />)
    await waitFor(() => {
      expect(getByText('sponsors.empty')).toBeTruthy()
    })
    expect(mockApi).toHaveBeenCalledWith('/clubs/c1/sponsors')
  })

  it('lists existing sponsors with edit and delete actions', async () => {
    mockApi.mockResolvedValue([
      {
        id: 's1',
        name: 'Sparkasse',
        logoUrl: 'https://cdn.example/s1.png',
        linkUrl: null,
        displayOrder: 0,
      },
    ])
    const { getByText, getByLabelText } = render(<AdminSponsorsScreen />)
    await waitFor(() => {
      expect(getByText('Sparkasse')).toBeTruthy()
    })
    expect(getByLabelText('Edit Sparkasse')).toBeTruthy()
    expect(getByLabelText('Delete Sparkasse')).toBeTruthy()
  })

  it('blocks non-admin roles', () => {
    authState.activeClub = {
      club: { id: 'c1', name: 'FC Test', slug: 'fc-test' },
      role: 'PLAYER',
    }
    const { getByText } = render(<AdminSponsorsScreen />)
    expect(getByText('common.accessDenied')).toBeTruthy()
  })

  it('opens the paywall when add is pressed without entitlement', async () => {
    entitlementsState.features = []
    mockApi.mockResolvedValue([])
    const { getByLabelText } = render(<AdminSponsorsScreen />)
    await waitFor(() => {
      expect(getByLabelText('sponsors.add')).toBeTruthy()
    })
    fireEvent.press(getByLabelText('sponsors.add'))
    // PaywallSheet renders nothing because the mock returns a fragment;
    // the assertion is that pressing Add did NOT route into a form.
    // If it did, we'd see the name input rendered.
    expect(() => getByLabelText('sponsors.namePlaceholder')).toThrow()
  })
})
