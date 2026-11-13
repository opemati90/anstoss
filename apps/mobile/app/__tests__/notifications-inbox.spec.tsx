import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react-native'

const mockApi = jest.fn()
const mockPush = jest.fn()
const mockSetActiveClub = jest.fn()

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: (...args: unknown[]) => mockPush(...args) },
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'de' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class ApiError extends Error {},
}))
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    activeClub: { club: { id: 'c1' } },
    memberships: [{ club: { id: 'c1' } }, { club: { id: 'c2' } }],
    setActiveClub: mockSetActiveClub,
  }),
}))
jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return { useClubColors: () => FALLBACK_THEME, useIsDark: () => false }
})

import NotificationsScreen from '../notifications'

const now = new Date().toISOString()

function page(items: unknown[], unreadCount = 1) {
  return { items, nextCursor: null, unreadCount }
}

const joinRequest = {
  id: 'n1',
  type: 'JOIN_REQUEST',
  title: 'Neue Beitrittsanfrage',
  body: 'Paul Krüger möchte SV beitreten.',
  clubId: 'c1',
  teamId: null,
  target: { type: 'join_request', clubId: 'c1', requestId: 'jr-1' },
  createdAt: now,
  readAt: null,
}

const fixtureChange = {
  id: 'n2',
  type: 'FIXTURE_CHANGED',
  title: 'Spielplan aktualisiert',
  body: 'Anstoß verschoben auf 15:00',
  clubId: 'c2',
  teamId: 't9',
  target: { type: 'fixture-sync', fixtureId: 'f1', teamId: 't9', clubId: 'c2' },
  createdAt: now,
  readAt: null,
}

describe('Notifications inbox screen', () => {
  beforeEach(() => {
    mockApi.mockReset()
    mockPush.mockReset()
    mockSetActiveClub.mockReset()
  })

  it('lists entries under Today and shows the empty state when there are none', async () => {
    mockApi.mockResolvedValueOnce(page([fixtureChange]))
    const screen = render(<NotificationsScreen />)
    expect(await screen.findByText('notificationsInbox.today')).toBeTruthy()
    expect(screen.getByText('Spielplan aktualisiert')).toBeTruthy()

    mockApi.mockResolvedValueOnce(page([], 0))
    const empty = render(<NotificationsScreen />)
    expect(await empty.findByText('notificationsInbox.emptyTitle')).toBeTruthy()
  })

  it('opening an entry marks it read, switches club and follows its deep link', async () => {
    mockApi.mockResolvedValueOnce(page([fixtureChange])).mockResolvedValueOnce({ unreadCount: 0 })
    const screen = render(<NotificationsScreen />)
    fireEvent.press(await screen.findByTestId('inbox-row-n2'))
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/me/notifications/n2/read', { method: 'POST' }),
    )
    expect(mockSetActiveClub).toHaveBeenCalledWith({ club: { id: 'c2' } })
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/match-detail',
      params: { fixtureId: 'f1', teamId: 't9' },
    })
  })

  it('accepts a join request inline with the request’s current revision', async () => {
    mockApi
      .mockResolvedValueOnce(page([joinRequest]))
      .mockResolvedValueOnce([{ id: 'jr-1', revision: 7 }])
      .mockResolvedValueOnce({ status: 'APPROVED' })
      .mockResolvedValueOnce({ unreadCount: 0 })
    const screen = render(<NotificationsScreen />)
    fireEvent.press(await screen.findByText('notificationsInbox.approve'))
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/clubs/c1/join-requests/jr-1/approve', {
        method: 'POST',
        body: { revision: 7 },
      }),
    )
    expect(await screen.findByText('notificationsInbox.approved')).toBeTruthy()
  })

  it('marks everything read', async () => {
    mockApi.mockResolvedValueOnce(page([joinRequest, fixtureChange], 2)).mockResolvedValueOnce({})
    const screen = render(<NotificationsScreen />)
    fireEvent.press(await screen.findByText('notificationsInbox.markAllRead'))
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/me/notifications/read-all', { method: 'POST' }),
    )
    expect(screen.queryByText('notificationsInbox.markAllRead')).toBeNull()
  })
})
