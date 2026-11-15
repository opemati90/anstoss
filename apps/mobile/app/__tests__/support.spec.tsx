import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import SupportScreen from '../support'
import { api } from '../../src/api/client'

let mockUser: { id: string } | null = { id: 'requester' }
let mockFocus: (() => void | (() => void)) | undefined
jest.mock('../../src/api/client', () => ({ api: jest.fn() }))
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }))
jest.mock('../../src/context/ClubThemeContext', () => ({
  useClubColors: () => require('../../src/theme/club-theme').FALLBACK_THEME,
  useIsDark: () => false,
}))
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), canGoBack: () => true },
  useFocusEffect: (callback: () => void | (() => void)) => {
    mockFocus = callback
    require('react').useEffect(callback, [callback])
  },
}))
jest.mock('expo-crypto', () => ({ randomUUID: () => 'f47ac10b-58cc-4372-a567-0e02b2c3d479' }))
jest.mock('expo-application', () => ({
  nativeApplicationVersion: '1.0.2',
  nativeBuildVersion: '92',
}))
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('../../src/utils/useSafeAreaInsetsSafe', () => ({
  useSafeAreaInsetsSafe: () => ({ top: 24, bottom: 12 }),
}))
const mockApi = api as jest.Mock
const ticket = {
  id: 'ticket',
  subject: 'Keyboard problem',
  status: 'OPEN',
  messages: [{ id: 'message', body: 'The history disappears.', fromSupport: false }],
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUser = { id: 'requester' }
  mockApi.mockResolvedValue([])
})

it('does not describe a failed history load as an empty inbox and can retry', async () => {
  mockApi.mockRejectedValueOnce(new Error('Unavailable'))
  const view = render(<SupportScreen />)
  await view.findByText('support.error')
  expect(view.queryByText('support.empty')).toBeNull()
  fireEvent.press(view.getByText('support.refresh'))
  await view.findByText('support.empty')
  expect(view.queryByText('support.error')).toBeNull()
})

it('submits a validated report and displays the returned thread', async () => {
  const view = render(<SupportScreen />)
  await waitFor(() => expect(view.getByText('support.empty')).toBeTruthy())
  fireEvent.changeText(view.getByTestId('support-subject'), 'Keyboard problem')
  fireEvent.changeText(view.getByTestId('support-body'), 'The history disappears.')
  mockApi.mockResolvedValueOnce(ticket)
  fireEvent.press(view.getByTestId('support-send'))
  await waitFor(() => expect(view.getByText('The history disappears.')).toBeTruthy())
  expect(mockApi).toHaveBeenLastCalledWith(
    '/me/support',
    expect.objectContaining({
      method: 'POST',
      body: expect.objectContaining({ subject: 'Keyboard problem', appVersion: '1.0.2' }),
    }),
  )
  expect(view.getByText('support.you')).toBeTruthy()
})

it('keeps the draft and request ID when retrying a failed write', async () => {
  const view = render(<SupportScreen />)
  await waitFor(() => expect(view.getByText('support.empty')).toBeTruthy())
  fireEvent.changeText(view.getByTestId('support-subject'), 'Keyboard problem')
  fireEvent.changeText(view.getByTestId('support-body'), 'The history disappears.')
  mockApi.mockRejectedValueOnce(new Error('Offline'))
  fireEvent.press(view.getByTestId('support-send'))
  await waitFor(() => expect(view.getByText('support.error')).toBeTruthy())
  expect(view.getByTestId('support-body').props.value).toBe('The history disappears.')
  const firstId = mockApi.mock.calls[1][1].body.requestId
  mockApi.mockResolvedValueOnce(ticket)
  fireEvent.press(view.getByTestId('support-send'))
  await waitFor(() => expect(view.getByText('support.you')).toBeTruthy())
  expect(mockApi.mock.calls[2][1].body.requestId).toBe(firstId)
})

it('refreshes the selected thread on focus and clears private state on account switch', async () => {
  mockApi.mockResolvedValueOnce([ticket]).mockResolvedValueOnce(ticket)
  const view = render(<SupportScreen />)
  fireEvent.press(await view.findByText('Keyboard problem · support.OPEN'))
  await view.findByText('The history disappears.')
  mockApi.mockResolvedValueOnce({ ...ticket, status: 'WAITING' })
  await act(async () => {
    mockFocus?.()
  })
  expect(mockApi).toHaveBeenLastCalledWith('/me/support/ticket')
  expect(view.getByText('support.WAITING')).toBeTruthy()
  mockUser = { id: 'other-requester' }
  mockApi.mockResolvedValueOnce([])
  view.rerender(<SupportScreen />)
  await waitFor(() => expect(view.getByText('support.empty')).toBeTruthy())
  expect(view.queryByText('The history disappears.')).toBeNull()
})
