// Wechselbörse review H4: under 18 the guardian consents, never the child.
import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react-native'

const mockApi = jest.fn()

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('../../src/utils/useSafeAreaInsetsSafe', () => ({
  useSafeAreaInsetsSafe: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker')
jest.mock('expo-router', () => ({
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({ trialId: 'trial-1' }),
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
jest.mock('../../src/i18n', () => ({
  __esModule: true,
  default: { language: 'de', resolvedLanguage: 'de' },
}))
jest.mock('../../src/api/client', () => {
  class ApiError extends Error {
    status = 500
  }
  return { api: (...args: unknown[]) => mockApi(...args), ApiError }
})
let mockDob = '2009-03-01'
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u-luca', name: 'Luca Brandt', email: 'luca@example.de', dateOfBirth: mockDob },
    activeClub: null,
  }),
}))
jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({ ...FALLBACK_THEME, primary: '#000', primary50: '#eee' }),
    useIsDark: () => false,
  }
})

import AufnahmeantragScreen from '../aufnahmeantrag/[trialId]'
import { resetApiCache } from '../../src/features/wechsel/query'

const OFFER = {
  id: 'trial-1',
  clubId: 'c1',
  status: 'OFFERED',
  joinRequest: null,
  club: { id: 'c1', name: 'SV Albatros', badgeUrl: null, primaryColor: '#1B4F9C' },
  team: { id: 't1', displayName: 'Herren II' },
}

function dob(years: number) {
  const d = new Date()
  d.setFullYear(d.getFullYear() - years)
  d.setMonth(d.getMonth() - 1)
  return d.toISOString().slice(0, 10)
}

async function fill(screen: ReturnType<typeof render>) {
  await screen.findByText('SV Albatros')
  fireEvent.changeText(screen.getByLabelText('aufnahme.street'), 'Kastanienallee 12')
  fireEvent.changeText(screen.getByLabelText('aufnahme.postalCode'), '14482')
  fireEvent.changeText(screen.getByLabelText('aufnahme.city'), 'Potsdam')
  fireEvent(screen.getByLabelText('aufnahme.hadClub'), 'valueChange', false)
}

describe('Aufnahmeantrag for a 17-year-old', () => {
  beforeEach(() => {
    resetApiCache()
    mockApi.mockReset()
    mockApi.mockImplementation(async (path: string) => (path === '/trial-invites/trial-1' ? OFFER : {}))
    mockDob = dob(17)
  })

  it('asks for the guardian email instead of a SEPA tick and sends it', async () => {
    const screen = render(<AufnahmeantragScreen />)
    await fill(screen)
    expect(screen.queryByLabelText('aufnahme.sepaConsent')).toBeNull()
    expect(screen.getByText('aufnahme.guardianIntro')).toBeTruthy()

    fireEvent.changeText(screen.getByLabelText('aufnahme.guardianEmail'), 'luca@example.de')
    fireEvent.press(screen.getByText('aufnahme.submit'))
    expect(await screen.findByText('aufnahme.guardianEmailOwn')).toBeTruthy()

    fireEvent.changeText(screen.getByLabelText('aufnahme.guardianEmail'), 'Eltern.Brandt@example.de')
    fireEvent.press(screen.getByText('aufnahme.submit'))
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/clubs/c1/join-requests', {
        method: 'POST',
        body: expect.objectContaining({
          trialInviteId: 'trial-1',
          guardianEmail: 'eltern.brandt@example.de',
        }),
      }),
    )
    const body = mockApi.mock.calls.find(([p]) => p === '/clubs/c1/join-requests')[1].body
    expect(body.sepaConsent).toBeUndefined()
    expect(body.parentalConsent).toBeUndefined()
  })

  it('adults still consent to SEPA themselves; nationality is optional', async () => {
    mockDob = dob(24)
    const screen = render(<AufnahmeantragScreen />)
    await fill(screen)
    expect(screen.queryByLabelText('aufnahme.guardianEmail')).toBeNull()
    expect(screen.getByText('aufnahme.nationalityHint')).toBeTruthy()
    fireEvent(screen.getByLabelText('aufnahme.sepaConsent'), 'valueChange', true)
    fireEvent.press(screen.getByText('aufnahme.submit'))
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/clubs/c1/join-requests', {
        method: 'POST',
        body: expect.objectContaining({ sepaConsent: true }),
      }),
    )
  })
})
