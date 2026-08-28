import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import DmNewScreen from '../dm-new'

const mockReplace = jest.fn()
const mockApi = jest.fn()

jest.mock('expo-router', () => ({ router: { replace: (...args: unknown[]) => mockReplace(...args) } }))
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'me' },
    activeClub: { club: { id: 'club-1' } },
  }),
}))
jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return { useClubColors: () => FALLBACK_THEME, useIsDark: () => false }
})
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'dm.newConversation': 'New conversation',
        'dm.searchMembers': 'Search members...',
        'dm.searchHint': 'Enter at least two letters',
        'dm.startConversationWith': 'Start conversation with',
        'dm.restricted': 'Private messages with minors are limited to linked guardians.',
        'dm.resolveError': 'Could not open conversation.',
        'common.errorTitle': 'Something went wrong',
      })[key] ?? key,
  }),
}))
jest.mock('../../src/api/client', () => {
  class MockApiError extends Error {
    status: number
    constructor(message: string, mockStatus: number) {
      super(message)
      this.status = mockStatus
    }
  }
  return {
    api: (...args: unknown[]) => mockApi(...args),
    ApiError: MockApiError,
  }
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function member(id: string, name: string) {
  return {
    id: `membership-${id}`,
    role: 'PLAYER',
    user: {
      id,
      name,
      avatarUrl: null,
      teamAccess: [{ role: 'PLAYER', team: { id: 'team-1', displayName: 'Women I' } }],
    },
  }
}

describe('DmNewScreen server directory', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
  })

  afterEach(() => jest.useRealTimers())

  it('ignores an older search response after the query changes', async () => {
    const older = deferred<{ items: ReturnType<typeof member>[]; nextCursor: null }>()
    const newer = deferred<{ items: ReturnType<typeof member>[]; nextCursor: null }>()
    mockApi.mockImplementation((path: string) => {
      if (path.includes('query=ab&')) return older.promise
      if (path.includes('query=abc&')) return newer.promise
      return Promise.resolve({ items: [], nextCursor: null })
    })
    const screen = render(<DmNewScreen />)
    const input = screen.getByPlaceholderText('Search members...')

    fireEvent.changeText(input, 'ab')
    await act(async () => jest.advanceTimersByTime(300))
    fireEvent.changeText(input, 'abc')
    await act(async () => jest.advanceTimersByTime(300))
    await act(async () => newer.resolve({ items: [member('new', 'New Result')], nextCursor: null }))
    await act(async () => older.resolve({ items: [member('old', 'Old Result')], nextCursor: null }))

    expect(screen.getByText('New Result')).toBeTruthy()
    expect(screen.queryByText('Old Result')).toBeNull()
  })

  it('explains a safeguarding denial instead of silently doing nothing', async () => {
    const { ApiError } = jest.requireMock('../../src/api/client') as {
      ApiError: new (message: string, status: number) => Error
    }
    mockApi.mockImplementation((path: string) => {
      if (path.includes('/member-directory?')) {
        return Promise.resolve({ items: [member('minor', 'Young Player')], nextCursor: null })
      }
      return Promise.reject(new ApiError('Forbidden', 403))
    })
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    const screen = render(<DmNewScreen />)
    fireEvent.changeText(screen.getByPlaceholderText('Search members...'), 'yo')
    await act(async () => jest.advanceTimersByTime(300))
    fireEvent.press(await screen.findByLabelText('Start conversation with Young Player'))

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        'Something went wrong',
        'Private messages with minors are limited to linked guardians.',
      ),
    )
  })
})
