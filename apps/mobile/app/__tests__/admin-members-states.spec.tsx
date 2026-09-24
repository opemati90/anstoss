import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react-native'

const mockApi = jest.fn()

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void) => {
    const React = require('react')
    React.useEffect(() => cb(), [cb])
  },
  router: { push: jest.fn(), back: jest.fn() },
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o && 'count' in o ? `${k}:${String(o.count)}` : k),
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class ApiError extends Error {},
}))
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ activeClub: { club: { id: 'c1', name: 'FC' }, role: 'ADMIN' } }),
}))
jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({ ...FALLBACK_THEME, primary: '#000', primary50: '#eee' }),
    useIsDark: () => false,
  }
})

import AdminMembersScreen, { normalisePage } from '../admin-members'

const page = (items: Array<{ id: string; name: string; isActive?: boolean; isYouth?: boolean }>, total = items.length) => ({
  items: items.map((m) => ({
    id: m.id,
    userId: `u-${m.id}`,
    role: 'PLAYER',
    isActive: m.isActive ?? true,
    isYouth: m.isYouth ?? false,
    teamNames: ['Herren I'],
    user: { id: `u-${m.id}`, name: m.name, avatarUrl: null },
  })),
  total,
  offset: 0,
  limit: 50,
  counts: { all: 126, active: 112, passive: 14, youth: 53 },
})

describe('admin-members — Mitgliederliste', () => {
  beforeEach(() => mockApi.mockReset())

  it('renders a layout-matching skeleton while loading', () => {
    mockApi.mockImplementation(() => new Promise(() => {}))
    const { getByTestId } = render(<AdminMembersScreen />)
    expect(getByTestId('admin-members-loading')).toBeTruthy()
  })

  it('asks for a paginated page and shows the single total', async () => {
    mockApi.mockResolvedValue(page([{ id: '1', name: 'Tim Weber' }], 126))
    const { findByText } = render(<AdminMembersScreen />)
    expect(await findByText('Tim Weber')).toBeTruthy()
    expect(await findByText('verein.members.totalCount:126')).toBeTruthy()
    expect(mockApi).toHaveBeenCalledWith('/clubs/c1/members?limit=50&offset=0&filter=all')
  })

  it('switches filter to Passiv', async () => {
    mockApi.mockResolvedValue(page([{ id: '1', name: 'Werner Albrecht', isActive: false }]))
    const { findByTestId } = render(<AdminMembersScreen />)
    fireEvent.press(await findByTestId('members-filter-passive'))
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/clubs/c1/members?limit=50&offset=0&filter=passive'),
    )
  })

  it('shows a composed empty state when nobody matches', async () => {
    mockApi.mockResolvedValue(page([]))
    const { findByText } = render(<AdminMembersScreen />)
    expect(await findByText('verein.members.emptyTitle')).toBeTruthy()
  })

  it('shows an inline error with retry on failure', async () => {
    mockApi.mockRejectedValue(new Error('net'))
    const { findByText } = render(<AdminMembersScreen />)
    expect(await findByText('verein.members.loadError')).toBeTruthy()
  })

  it('still works against an older API that returns a bare array', () => {
    const result = normalisePage(
      [
        { id: 'a', role: 'PLAYER', isActive: false, user: { id: 'a', name: 'Gisela Hahn', avatarUrl: null } },
        { id: 'b', role: 'PLAYER', isYouth: true, user: { id: 'b', name: 'Emil Koch', avatarUrl: null } },
      ],
      'passive',
      '',
    )
    expect(result.items.map((row) => row.user.name)).toEqual(['Gisela Hahn'])
    expect(result.counts).toEqual({ all: 2, active: 1, passive: 1, youth: 1 })
  })
})
