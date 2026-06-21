import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Alert, Share } from 'react-native'

const mockReplace = jest.fn()
const mockApi = jest.fn()
const mockT = (key: string, opts?: Record<string, unknown> & { defaultValue?: string }) =>
  (opts?.defaultValue ?? key).replace(/\{\{(\w+)\}\}/g, (_match, name) =>
    String(opts?.[name] ?? ''),
  )

jest.useFakeTimers()

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: jest.fn() }),
}))

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: jest.fn() },
  useTranslation: () => ({
    t: mockT,
  }),
}))

jest.mock('../../src/context/ClubThemeContext', () => ({
  useClubColors: () => ({
    borderDefault: '#dddddd',
    error: '#c62828',
    primary: '#2255cc',
    surface: '#ffffff',
    surfaceSunken: '#f6f7f9',
    textPrimary: '#111111',
    textSecondary: '#555555',
  }),
}))

jest.mock('../../src/context/OnboardingFlowContext', () => ({
  useOnboardingFlow: () => ({
    state: {
      firstName: 'Mara',
      dateOfBirth: '1997-04-12',
      role: 'PLAYER',
    },
    markStep: jest.fn(),
  }),
}))

jest.mock('../../src/components/ui', () => {
  const React = require('react')
  const { Text, TextInput } = require('react-native')

  return {
    SearchBar: (props: {
      value: string
      onChangeText: (next: string) => void
      placeholder?: string
    }) =>
      React.createElement(TextInput, {
        placeholder: props.placeholder,
        value: props.value,
        onChangeText: props.onChangeText,
      }),
    Text: (props: { children?: React.ReactNode }) =>
      React.createElement(Text, props, props.children),
  }
})

jest.mock('../../src/components/wizard/WizardStep', () => {
  const React = require('react')
  const { Text, View } = require('react-native')

  return {
    WizardStep: (props: { title: string; children: React.ReactNode }) =>
      React.createElement(
        View,
        null,
        React.createElement(Text, null, props.title),
        props.children,
      ),
  }
})

jest.mock('../../src/api/client', () => {
  class ApiError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  }
  return {
    api: (...args: unknown[]) => mockApi(...args),
    ApiError,
  }
})

import ClubSearchScreen from '../(auth)/club-search'

describe('ClubSearchScreen', () => {
  beforeEach(() => {
    mockReplace.mockReset()
    mockApi.mockReset()
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.style !== 'cancel')?.onPress?.()
    })
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.restoreAllMocks()
  })

  it('shows directory-only results, shares them, and posts join requests to active club ids', async () => {
    jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' })
    mockApi
      .mockResolvedValueOnce({
        results: [
          {
            id: 'dir1',
            activeClubId: null,
            name: 'SV Directory',
            slug: 'sv-directory',
            badgeUrl: null,
            primaryColor: '#111111',
            city: 'Berlin',
            isActive: false,
            memberCount: 0,
          },
          {
            id: 'stale-dir',
            activeClubId: null,
            name: 'SV Stale Directory',
            slug: 'sv-stale-directory',
            badgeUrl: null,
            primaryColor: '#111111',
            city: 'Berlin',
            memberCount: 0,
          },
          {
            id: 'search-row-1',
            activeClubId: 'club-1',
            name: 'SV Active',
            slug: 'sv-active',
            badgeUrl: null,
            primaryColor: '#111111',
            city: 'Berlin',
            isActive: true,
            memberCount: 4,
          },
        ],
        nextCursor: null,
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ id: 'request-1' })

    render(<ClubSearchScreen />)

    fireEvent.changeText(screen.getByPlaceholderText('Club name or city'), 'SV')
    await act(async () => {
      jest.advanceTimersByTime(300)
    })

    await waitFor(() => expect(screen.getByText('SV Active')).toBeOnTheScreen())
    expect(screen.getByText('SV Directory')).toBeOnTheScreen()
    expect(screen.getByText('SV Stale Directory')).toBeOnTheScreen()

    fireEvent.press(screen.getByText('SV Directory'))

    await waitFor(() => expect(Share.share).toHaveBeenCalledWith({
      message:
        'I found SV Directory in Anstoss. Can a coach or club admin activate the club so players can join?',
    }))
    expect(mockApi).toHaveBeenCalledTimes(1)

    fireEvent.press(screen.getByText('SV Active'))

    await waitFor(() =>
      expect(mockApi).toHaveBeenLastCalledWith('/clubs/club-1/join-requests', {
        method: 'POST',
        body: { role: 'PLAYER' },
      }),
    )
    expect(mockApi).toHaveBeenCalledWith('/me', {
      method: 'PATCH',
      body: {
        name: 'Mara',
        dateOfBirth: '1997-04-12',
        registrationRole: 'PLAYER',
      },
    })
    expect(mockReplace).toHaveBeenCalledWith('/pending-approval')
  })
})
