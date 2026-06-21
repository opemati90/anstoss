import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'

const mockApi = jest.fn()

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ slug: 'fc-anstoss' }),
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
jest.mock('../../src/api/client', () => {
  class ApiError extends Error {
    status: number
    code?: string
    constructor(msg: string, status: number, code?: string) {
      super(msg)
      this.name = 'ApiError'
      this.status = status
      this.code = code
    }
  }
  return {
    api: (...args: unknown[]) => mockApi(...args),
    ApiError,
  }
})
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ memberships: [], refreshUser: jest.fn() }),
}))
jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({ ...FALLBACK_THEME, primary: '#000', primary50: '#eee' }),
    useIsDark: () => false,
  }
})

import ClubPreview from '../club/[slug]'
import { ApiError } from '../../src/api/client'

describe('club/[slug] — apiErrorKey adoption', () => {
  beforeEach(() => mockApi.mockReset())

  it('surfaces errors.api.rateLimit when the request is rate-limited', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    const clubData = {
      id: 'c1',
      activeClubId: 'c1',
      name: 'FC',
      slug: 'fc-anstoss',
      badgeUrl: null,
      primaryColor: '#000',
      city: null,
      memberCount: 1,
      teamCount: 1,
      isActive: true,
    }
    mockApi.mockImplementation((url: string) => {
      if (url === '/clubs/c1/join-requests') {
        return Promise.reject(new ApiError('rl', 429, 'RATE_LIMIT_EXCEEDED'))
      }
      return Promise.resolve(clubData)
    })

    const { findByTestId } = render(<ClubPreview />)
    const submit = await findByTestId('club-preview-request-to-join')
    await act(async () => {
      fireEvent.press(submit)
    })

    await waitFor(
      () => {
        expect(alertSpy).toHaveBeenCalledWith('errors.api.title', 'errors.api.rateLimit')
      },
      { timeout: 3000 },
    )
    alertSpy.mockRestore()
  })
})
