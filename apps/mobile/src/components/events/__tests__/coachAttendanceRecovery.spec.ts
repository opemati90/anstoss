jest.mock('@react-native-async-storage/async-storage', () => {
  const data = new Map<string, string>()
  return { __esModule: true, default: {
    getAllKeys: jest.fn(async () => [...data.keys()]),
    getItem: jest.fn(async (key: string) => data.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { data.set(key, value) }),
    removeItem: jest.fn(async (key: string) => { data.delete(key) }),
    clear: jest.fn(async () => { data.clear() }),
  } }
})
jest.mock('../../../api/client', () => ({ api: jest.fn(), ApiError: class ApiError extends Error { status = 0 } }))
import AsyncStorage from '@react-native-async-storage/async-storage'
import { api } from '../../../api/client'
import { acknowledgeAttendanceRejections, attendanceJournalKey, clearDeletedActorAttendance, isAttendanceActorRetired, recoverAttendanceJournals, resumeConfirmedAttendanceCleanup, withAttendanceLock } from '../coachAttendanceRecovery'

const mockApi = api as jest.Mock
beforeEach(async () => { await AsyncStorage.clear(); mockApi.mockReset() })

it('recovers only the signed-in account and retains a target-free rejection notice', async () => {
  const a = attendanceJournalKey('actor-a', 'club', 'event')
  const b = attendanceJournalKey('actor-b', 'club', 'event')
  const pending = JSON.stringify({ userId: 'player', status: 'PRESENT', expectedVersion: null, operationId: 'op' })
  await AsyncStorage.setItem(a, pending)
  await AsyncStorage.setItem(b, pending)
  mockApi.mockResolvedValue({ settled: true, rejected: true })
  await recoverAttendanceJournals('actor-a')
  expect(await AsyncStorage.getItem(a)).toBeNull()
  expect(await AsyncStorage.getItem(`${a}/rejected/op`)).toBe('op')
  expect(await AsyncStorage.getItem(b)).toBe(pending)
  expect(mockApi).toHaveBeenCalledTimes(1)
})
it('clears a deleted actor even when a journal write is already waiting', async () => {
  const actor = 'actor-deleted-test'
  const key = attendanceJournalKey(actor, 'club', 'event')
  let release!: () => void
  let entered!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const ready = new Promise<void>((resolve) => { entered = resolve })
  const write = withAttendanceLock(key, async () => {
    entered()
    await gate
    await AsyncStorage.setItem(key, 'pending')
  })
  await ready
  const cleanup = clearDeletedActorAttendance(actor)
  expect(isAttendanceActorRetired(actor)).toBe(true)
  release()
  await Promise.all([write, cleanup])
  expect(await AsyncStorage.getItem(key)).toBeNull()
})

it('does not clear a newer rejection when an older notice is acknowledged', async () => {
  const key = `${attendanceJournalKey('actor-c', 'club', 'event')}/rejected/operation-b`
  await AsyncStorage.setItem(key, 'operation-b')
  await acknowledgeAttendanceRejections([{ key, operationId: 'operation-a' }])
  expect(await AsyncStorage.getItem(key)).toBe('operation-b')
})

it('rotates through more than one batch when early journals cannot be resolved', async () => {
  for (let i = 0; i < 21; i++) {
    const key = attendanceJournalKey('actor-rotation', 'club', `event-${String(i).padStart(2, '0')}`)
    await AsyncStorage.setItem(key, JSON.stringify({ userId: 'player', status: 'PRESENT', expectedVersion: null, operationId: 'op' }))
  }
  mockApi.mockRejectedValue(new Error('offline'))
  await recoverAttendanceJournals('actor-rotation')
  expect(mockApi).toHaveBeenCalledTimes(20)
  await recoverAttendanceJournals('actor-rotation')
  expect(mockApi.mock.calls.some(([url]) => String(url).includes('event-20'))).toBe(true)
})

it('resumes confirmed deletion cleanup after a restart while preserving other accounts', async () => {
  const deleted = attendanceJournalKey('actor-confirmed', 'club', 'event')
  const other = attendanceJournalKey('actor-other', 'club', 'event')
  const marker = '@anstoss/coach-attendance-cleanup/actor-confirmed'
  await AsyncStorage.setItem(deleted, 'pending')
  await AsyncStorage.setItem(other, 'pending')
  await AsyncStorage.setItem(marker, 'confirmed')
  await resumeConfirmedAttendanceCleanup()
  expect(await AsyncStorage.getItem(deleted)).toBeNull()
  expect(await AsyncStorage.getItem(marker)).toBeNull()
  expect(await AsyncStorage.getItem(other)).toBe('pending')
})

it('keeps a confirmed cleanup marker after a transient storage failure', async () => {
  const marker = '@anstoss/coach-attendance-cleanup/actor-storage-failure'
  const journal = attendanceJournalKey('actor-storage-failure', 'club', 'event')
  await AsyncStorage.setItem(marker, 'confirmed')
  await AsyncStorage.setItem(journal, 'pending')
  jest.mocked(AsyncStorage.removeItem).mockRejectedValueOnce(new Error('storage unavailable'))
  await resumeConfirmedAttendanceCleanup()
  expect(await AsyncStorage.getItem(marker)).toBe('confirmed')
  await resumeConfirmedAttendanceCleanup()
  expect(await AsyncStorage.getItem(marker)).toBeNull()
  expect(await AsyncStorage.getItem(journal)).toBeNull()
})

