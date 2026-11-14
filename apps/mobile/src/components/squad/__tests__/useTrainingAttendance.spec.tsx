import { act, renderHook, waitFor } from '@testing-library/react-native'
import { api } from '../../../api/client'
import { attendanceFor, useTrainingAttendance } from '../useTrainingAttendance'

jest.mock('../../../api/client', () => ({ api: jest.fn() }))
const mockApi = api as jest.MockedFunction<typeof api>
const training = (id: string, date: string) => ({ id, date })
const earlier = training('earlier', '2020-01-01T18:00:00Z')
const later = training('later', '2020-01-02T18:00:00Z')

beforeEach(() => mockApi.mockReset())

it('does not request staff attendance for players or a missing team', async () => {
  const { result, rerender } = renderHook(
    ({ team, allowed }: { team: string | null; allowed: boolean }) =>
      useTrainingAttendance('club', team, 4, allowed),
    { initialProps: { team: 'team' as string | null, allowed: false } },
  )
  await act(async () => {
    result.current.reload()
  })
  rerender({ team: null, allowed: true })
  expect(mockApi).not.toHaveBeenCalled()
  expect(result.current.attendance).toBeNull()
})

it('uses recorded check-ins, never RSVP yes, and leaves unrecorded slots unknown', async () => {
  mockApi.mockImplementation(async (path) => {
    if (path.includes('/events?')) return [earlier, later] as never
    if (path.includes('/earlier/attendance')) {
      return { checkIns: [], rsvps: [{ userId: 'player', status: 'YES' }] } as never
    }
    return { checkIns: [{ userId: 'player' }] } as never
  })
  const { result } = renderHook(() => useTrainingAttendance('club', 'team', 4, true))
  await waitFor(() => expect(result.current.attendance).not.toBeNull())
  expect(attendanceFor(result.current.attendance, 'player', 4)).toEqual([null, null, null, true])
  expect(attendanceFor(result.current.attendance, 'other-player', 4)).toBeNull()
  expect(mockApi).toHaveBeenCalledWith('/clubs/club/events/earlier/attendance')
  expect(mockApi).not.toHaveBeenCalledWith('/clubs/club/events/earlier')
})

it('does not turn failed reports into absences or use cancelled/future trainings', async () => {
  mockApi.mockImplementation(async (path) => {
    if (path.includes('/events?')) {
      return [
        earlier,
        { ...later, cancelledAt: later.date },
        training('future', '2099-01-01'),
      ] as never
    }
    throw new Error('Report unavailable')
  })
  const { result } = renderHook(() => useTrainingAttendance('club', 'team', 4, true))
  await waitFor(() => expect(result.current.attendance).not.toBeNull())
  expect(result.current.attendance?.trainings).toEqual([earlier])
  expect(attendanceFor(result.current.attendance, 'player', 4)).toBeNull()
  expect(mockApi).toHaveBeenCalledTimes(2)
})

it('clears data immediately on access loss and ignores its late response', async () => {
  let resolveReport!: (value: unknown) => void
  mockApi.mockImplementation(async (path) => {
    if (path.includes('/events?')) return [earlier] as never
    return new Promise((resolve) => {
      resolveReport = resolve
    }) as never
  })
  const { result, rerender } = renderHook(
    ({ allowed }: { allowed: boolean }) => useTrainingAttendance('club', 'team', 4, allowed),
    { initialProps: { allowed: true } },
  )
  await waitFor(() => expect(resolveReport).toBeDefined())
  rerender({ allowed: false })
  await act(async () => {
    resolveReport({ checkIns: [{ userId: 'player' }] })
  })
  expect(result.current.attendance).toBeNull()
})

it('ignores an older club response after switching teams', async () => {
  let resolveOld!: (value: unknown) => void
  mockApi.mockImplementation(async (path) => {
    if (path.includes('/events?')) return [earlier] as never
    if (path.includes('/clubs/old/'))
      return new Promise((resolve) => {
        resolveOld = resolve
      }) as never
    return { checkIns: [{ userId: 'new-player' }] } as never
  })
  const { result, rerender } = renderHook(
    ({ club }: { club: string }) => useTrainingAttendance(club, 'team', 4, true),
    { initialProps: { club: 'old' } },
  )
  await waitFor(() => expect(resolveOld).toBeDefined())
  rerender({ club: 'new' })
  await waitFor(() => expect(result.current.attendance?.byUser['new-player']).toEqual([true]))
  await act(async () => {
    resolveOld({ checkIns: [{ userId: 'old-player' }] })
  })
  expect(result.current.attendance?.byUser['old-player']).toBeUndefined()
})
