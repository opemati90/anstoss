import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react-native'

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, values?: { name?: string }) => `${key}${values?.name ? `:${values.name}` : ''}` }) }))
jest.mock('expo-crypto', () => ({ randomUUID: () => 'test-operation' }))
jest.mock('@react-native-async-storage/async-storage', () => {
  let data: Record<string, string> = {}
  return { __esModule: true, default: { getAllKeys: jest.fn(async () => Object.keys(data)), getItem: jest.fn(async (key: string) => data[key] ?? null), setItem: jest.fn(async (key: string, value: string) => { data[key] = value }), removeItem: jest.fn(async (key: string) => { delete data[key] }), clear: jest.fn(async () => { data = {} }) } }
})
jest.mock('../../../api/client', () => ({ api: jest.fn() }))
jest.mock('../../../context/ClubThemeContext', () => ({ useClubColors: () => ({ primary: '#135', primary50: '#def', surface: '#fff', borderDefault: '#ccc' }) }))
jest.mock('../../ui/Avatar', () => ({ Avatar: () => null }))
jest.mock('../../ui', () => {
  const { Text } = require('react-native')
  return { Text }
})

import { api } from '../../../api/client'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { CoachAttendancePanel } from '../CoachAttendancePanel'

const mockApi = api as jest.Mock
const props = { clubId: 'club', eventId: 'event', actorId: 'coach', members: [{ userId: 'player', name: 'Alex' }] }

beforeEach(async () => { mockApi.mockReset(); await AsyncStorage.clear() })

it('saves coach attendance without changing the player RSVP', async () => {
  mockApi.mockResolvedValueOnce([]).mockResolvedValueOnce({ userId: 'player', status: 'PRESENT', version: 1 }).mockResolvedValueOnce([{ userId: 'player', status: 'PRESENT', version: 1 }])
  const screen = render(<CoachAttendancePanel {...props} />)
  await waitFor(() => expect(screen.getByLabelText('event.coachAttendance.present:Alex')).toBeTruthy())
  fireEvent.press(screen.getByLabelText('event.coachAttendance.present:Alex'))
  await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/clubs/club/events/event/coach-attendance/player', {
    method: 'PUT', body: { status: 'PRESENT', expectedVersion: null, operationId: 'test-operation', expectedActorId: 'coach' },
  }))
  await waitFor(() => expect(screen.getByLabelText('event.coachAttendance.present:Alex').props.accessibilityState.selected).toBe(true))
})

it('serializes rapid taps while a save is pending', async () => {
  let finish!: (value: object) => void
  mockApi.mockResolvedValueOnce([]).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    .mockResolvedValueOnce([{ userId: 'player', status: 'PRESENT', version: 1 }])
  const screen = render(<CoachAttendancePanel {...props} />)
  await waitFor(() => expect(screen.getByLabelText('event.coachAttendance.present:Alex')).toBeTruthy())
  fireEvent.press(screen.getByLabelText('event.coachAttendance.present:Alex'))
  await waitFor(() => expect(mockApi).toHaveBeenCalledTimes(2))
  fireEvent.press(screen.getByLabelText('event.coachAttendance.absent:Alex'))
  expect(mockApi).toHaveBeenCalledTimes(2)
  finish({ userId: 'player', status: 'PRESENT', version: 1 })
  await waitFor(() => expect(screen.getByLabelText('event.coachAttendance.present:Alex').props.accessibilityState.selected).toBe(true))
})

it('reloads after a failed save and displays an error instead of claiming success', async () => {
  mockApi.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce([])
  const screen = render(<CoachAttendancePanel {...props} />)
  await waitFor(() => expect(screen.getByLabelText('event.coachAttendance.absent:Alex')).toBeTruthy())
  fireEvent.press(screen.getByLabelText('event.coachAttendance.absent:Alex'))
  await waitFor(() => expect(screen.getByText('event.coachAttendance.retry')).toBeTruthy())
})

it('waits for an in-flight save before loading the same event after reopening', async () => {
  let finish!: (value: object) => void
  mockApi.mockResolvedValueOnce([]).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    .mockResolvedValueOnce([{ userId: 'player', status: 'PRESENT', version: 1 }])
    .mockResolvedValueOnce([{ userId: 'player', status: 'PRESENT', version: 1 }])
  const first = render(<CoachAttendancePanel {...props} />)
  await waitFor(() => expect(first.getByLabelText('event.coachAttendance.present:Alex')).toBeTruthy())
  fireEvent.press(first.getByLabelText('event.coachAttendance.present:Alex'))
  await waitFor(() => expect(mockApi).toHaveBeenCalledTimes(2))
  first.unmount()
  const second = render(<CoachAttendancePanel {...props} />)
  expect(mockApi).toHaveBeenCalledTimes(2)
  finish({ userId: 'player', status: 'PRESENT', version: 1 })
  await waitFor(() => expect(second.getByLabelText('event.coachAttendance.present:Alex').props.accessibilityState.selected).toBe(true))
  expect(mockApi).toHaveBeenCalledTimes(4)
})

it('retries the same persisted operation after a lost response and reopening', async () => {
  mockApi.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('timeout'))
    .mockResolvedValueOnce({ settled: true })
    .mockResolvedValueOnce([{ userId: 'player', status: 'PRESENT', version: 1 }])
  const first = render(<CoachAttendancePanel {...props} />)
  await waitFor(() => expect(first.getByLabelText('event.coachAttendance.present:Alex')).toBeTruthy())
  fireEvent.press(first.getByLabelText('event.coachAttendance.present:Alex'))
  await waitFor(() => expect(first.getByText('event.coachAttendance.retry')).toBeTruthy())
  first.unmount()
  const second = render(<CoachAttendancePanel {...props} />)
  await waitFor(() => expect(second.getByLabelText('event.coachAttendance.present:Alex').props.accessibilityState.selected).toBe(true))
  expect(mockApi.mock.calls[1]).toEqual(mockApi.mock.calls[2])
})
