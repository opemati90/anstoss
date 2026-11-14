import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react-native'

const mockApi = jest.fn()
let mockMembership: { role: string; operationalRoles: string[] } = { role: 'OWNER', operationalRoles: [] }

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() } }))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o ? `${k} ${JSON.stringify(o)}` : k),
    i18n: { language: 'de-DE' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class ApiError extends Error {},
}))
jest.mock('../../src/i18n', () => ({ getAppLanguage: () => 'de', getAppLocale: () => 'de-DE' }))
jest.mock('../../src/utils/haptics', () => ({ Haptics: { select: jest.fn(), tap: jest.fn() } }))
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ activeClub: { club: { id: 'c1', name: 'FC' }, ...mockMembership } }),
}))
jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return { useClubColors: () => FALLBACK_THEME, useIsDark: () => false }
})

import { planFeatureFlags } from '@anstoss/shared'
import AboScreen from '../abo'
import { __resetClubPlanCache, canManageClubPlan } from '../../src/hooks/useClubPlan'

const boardPlan = {
  clubId: 'c1',
  tier: 'FREE',
  source: 'NONE',
  trialEndsAt: null,
  trialUsed: false,
  limits: { teams: 1, players: 30 },
  usage: { teams: 1, players: 22 },
  prices: {
    monthly: { amountCents: 1099, currency: 'EUR' },
    yearly: { amountCents: 10990, currency: 'EUR' },
  },
  features: planFeatureFlags('FREE'),
  canManage: true,
}

describe('Abo screen (board 35)', () => {
  beforeEach(() => {
    mockApi.mockReset()
    __resetClubPlanCache()
    mockMembership = { role: 'OWNER', operationalRoles: [] }
  })

  it('shows the current plan, usage, Verein card and docked trial action', async () => {
    mockApi.mockResolvedValue(boardPlan)
    const s = render(<AboScreen />)
    expect(await s.findByText('clubPlan.teamLimit')).toBeTruthy()
    expect(mockApi).toHaveBeenCalledWith('/clubs/c1/plan')
    expect(s.getByText('clubPlan.usage {"used":1,"limit":1}')).toBeTruthy()
    expect(s.getByText('clubPlan.usage {"used":22,"limit":30}')).toBeTruthy()
    expect(s.getByText('clubPlan.features.clubColors')).toBeTruthy()
    expect(s.getByText('clubPlan.features.matchdayStudio')).toBeTruthy()
    expect(s.getByText('clubPlan.features.actingSessions')).toBeTruthy()
    expect(s.getByTestId('abo-price').props.children).toMatch(/10,99/)
    expect(s.getByTestId('abo-start-trial')).toBeTruthy()
  })

  it('switches to the yearly price', async () => {
    mockApi.mockResolvedValue(boardPlan)
    const s = render(<AboScreen />)
    await s.findByText('clubPlan.teamLimit')
    fireEvent.press(s.getByTestId('abo-interval-yearly'))
    expect(s.getByTestId('abo-price').props.children).toMatch(/109,90/)
    expect(s.getByText('clubPlan.perYear')).toBeTruthy()
  })

  it('starts the trial for Vorstand/Kassenwart', async () => {
    mockApi.mockImplementation((path: string) =>
      path.endsWith('/trial')
        ? Promise.resolve({
            ...boardPlan,
            tier: 'PRO',
            source: 'TRIAL',
            trialUsed: true,
            trialEndsAt: '2026-12-13T12:00:00.000Z',
            limits: { teams: 5, players: 150 },
            features: planFeatureFlags('PRO'),
          })
        : Promise.resolve(boardPlan),
    )
    const s = render(<AboScreen />)
    fireEvent.press(await s.findByTestId('abo-start-trial'))
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/clubs/c1/plan/trial', { method: 'POST', body: {} }),
    )
    expect(await s.findByTestId('abo-status-note')).toBeTruthy()
    expect(s.queryByTestId('abo-start-trial')).toBeNull()
  })

  it('is read-only for members who cannot manage the plan', async () => {
    mockApi.mockResolvedValue({ ...boardPlan, canManage: false })
    const s = render(<AboScreen />)
    expect(await s.findByText('clubPlan.readOnly')).toBeTruthy()
    expect(s.queryByTestId('abo-start-trial')).toBeNull()
  })

  it('degrades quietly to Kostenlos when the endpoint is missing', async () => {
    mockMembership = { role: 'COACH', operationalRoles: ['TREASURER'] }
    mockApi.mockRejectedValue(new Error('404'))
    const s = render(<AboScreen />)
    expect(await s.findByTestId('abo-start-trial')).toBeTruthy()
    expect(s.getByText('clubPlan.usage {"used":0,"limit":30}')).toBeTruthy()
  })

  it('lets only Vorstand and Kassenwart manage the plan', () => {
    expect(canManageClubPlan({ role: 'ADMIN', operationalRoles: [] })).toBe(true)
    expect(canManageClubPlan({ role: 'PLAYER', operationalRoles: ['TREASURER'] })).toBe(true)
    expect(canManageClubPlan({ role: 'COACH', operationalRoles: ['SECRETARY'] })).toBe(false)
    expect(canManageClubPlan(null)).toBe(false)
  })
})
