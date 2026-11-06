// club-admin review fixes: Aufnahmeantrag details on pending join requests
// that come from a Probetraining, and translated action errors (M3).
import React from 'react'
import { Alert } from 'react-native'
import { fireEvent, render, waitFor } from '@testing-library/react-native'

const mockApi = jest.fn()
const mockPush = jest.fn()

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void) => {
    const React = require('react')
    React.useEffect(() => cb(), [cb])
  },
  router: { back: jest.fn(), push: (...args: unknown[]) => mockPush(...args) },
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) =>
      o ? `${k}(${Object.values(o).map(String).join(',')})` : k,
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
jest.mock('../../src/i18n', () => ({
  __esModule: true,
  default: { language: 'de', resolvedLanguage: 'de' },
  getAppLanguage: () => 'de',
  getAppLocale: () => 'de-DE',
}))
jest.mock('../../src/api/client', () => {
  class ApiError extends Error {
    status: number
    constructor(message: string, mockStatus: number) {
      super(message)
      this.status = mockStatus
    }
  }
  return { api: (...args: unknown[]) => mockApi(...args), ApiError }
})
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ activeClub: { club: { id: 'c1', name: 'SV Albatros' } } }),
}))
jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({ ...FALLBACK_THEME, primary: '#000', primary50: '#eee' }),
    useIsDark: () => false,
  }
})

import PendingRequestsScreen from '../pending-requests'
import { ApiError } from '../../src/api/client'

const TRIAL_REQUEST = {
  id: 'jr-erik',
  role: 'PLAYER',
  teamId: 'team-1',
  message: null,
  status: 'PENDING',
  revision: 1,
  createdAt: '2026-09-23T15:30:00.000Z',
  user: { id: 'u-erik', name: 'Erik Brandt', email: 'erik@example.com', dateOfBirth: '1999-04-02T00:00:00.000Z' },
  trialInviteId: 'trial-1',
  trialInvite: { id: 'trial-1', team: { id: 'team-1', displayName: 'Herren I' } },
  street: 'Lindenstraße 12',
  postalCode: '14467',
  city: 'Potsdam',
  phone: '0171 2345678',
  nationality: null,
  previousClubName: 'TSV Linden',
  lastMatchDate: '2026-06-07',
  sepaConsentAt: '2026-09-23T15:25:00.000Z',
  parentalConsentAt: null,
  releaseStatus: 'PENDING',
  passApplicationAt: null,
  eligibleFrom: null,
}

describe('pending-requests — Aufnahmeantrag from a trial', () => {
  beforeEach(() => {
    mockApi.mockReset()
    mockPush.mockReset()
  })

  it('shows the trial team, previous club, last match, SEPA consent and the Wechsel checklist', async () => {
    mockApi.mockResolvedValueOnce([TRIAL_REQUEST])
    const screen = render(<PendingRequestsScreen />)
    expect(await screen.findByText('TSV Linden')).toBeTruthy()
    expect(screen.getByText(/joinReview\.fromTrial\(Herren I\)/)).toBeTruthy()
    expect(screen.getByText('07.06.2026')).toBeTruthy()
    expect(screen.getByText('joinReview.consentGivenOn(23.09.2026)')).toBeTruthy()
    expect(screen.getByText('wechsel.release.PENDING')).toBeTruthy()
    expect(screen.getAllByText('joinReview.open')).toHaveLength(2)
    // Adult: no parental consent row; no nationality given: no nationality row.
    expect(screen.queryByText('joinReview.parental')).toBeNull()
    expect(screen.queryByText('aufnahme.nationality')).toBeNull()
  })

  it('keeps address and phone behind the Details disclosure', async () => {
    mockApi.mockResolvedValueOnce([TRIAL_REQUEST])
    const screen = render(<PendingRequestsScreen />)
    await screen.findByText('TSV Linden')
    expect(screen.queryByText('0171 2345678')).toBeNull()
    expect(screen.queryByText('Lindenstraße 12, 14467 Potsdam')).toBeNull()
    fireEvent.press(screen.getByLabelText('joinReview.details'))
    expect(screen.getByText('0171 2345678')).toBeTruthy()
    expect(screen.getByText('Lindenstraße 12, 14467 Potsdam')).toBeTruthy()
  })

  it('shows nationality and parental consent only when relevant', async () => {
    mockApi.mockResolvedValueOnce([
      {
        ...TRIAL_REQUEST,
        user: { ...TRIAL_REQUEST.user, dateOfBirth: '2012-01-01T00:00:00.000Z' },
        nationality: 'türkisch',
        parentalConsentAt: null,
      },
    ])
    const screen = render(<PendingRequestsScreen />)
    expect(await screen.findByText('türkisch')).toBeTruthy()
    expect(screen.getByText('joinReview.parental')).toBeTruthy()
    expect(screen.getByText('joinReview.consentMissing')).toBeTruthy()
  })

  it('links to the Wechsel segment of the Wechselbörse', async () => {
    mockApi.mockResolvedValueOnce([TRIAL_REQUEST])
    const screen = render(<PendingRequestsScreen />)
    fireEvent.press(await screen.findByLabelText('joinReview.openWechsel'))
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/wechselboerse', params: { tab: 'wechsel' } })
  })

  it('renders plain requests without any Aufnahmeantrag block', async () => {
    mockApi.mockResolvedValueOnce([{ ...TRIAL_REQUEST, trialInviteId: null, trialInvite: null }])
    const screen = render(<PendingRequestsScreen />)
    await screen.findByText('Erik Brandt')
    expect(screen.queryByText('TSV Linden')).toBeNull()
    expect(screen.queryByText('joinReview.wechselHeader')).toBeNull()
  })

  it('shows a translated conflict message and reloads on 409 (M3)', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    mockApi
      .mockResolvedValueOnce([TRIAL_REQUEST])
      .mockRejectedValueOnce(new ApiError('Join request revision mismatch', 409))
      .mockResolvedValueOnce([])
    const screen = render(<PendingRequestsScreen />)
    fireEvent.press(await screen.findByText('pendingRequests.approve'))
    await waitFor(() => expect(alert).toHaveBeenCalledWith('common.error', 'aufgaben.errorConflict'))
    await waitFor(() => expect(mockApi).toHaveBeenCalledTimes(3))
    alert.mockRestore()
  })
})
