import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { EventDetail, MatchLiveStateDto } from '@anstoss/shared'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useStudioMatch } from '../useStudio'

jest.mock('../../api/client', () => ({ api: jest.fn() }))
jest.mock('../../context/AuthContext', () => ({ useAuth: jest.fn() }))
const mockApi = api as jest.MockedFunction<typeof api>
const mockAuth = useAuth as jest.MockedFunction<typeof useAuth>

function auth(clubId = 'club-a', teamId = 'team-a', userId = 'user-a') {
  return {
    user: { id: userId },
    token: `session-${userId}`,
    activeTeamId: teamId,
    activeClub: {
      role: 'ADMIN',
      operationalRoles: [],
      club: { id: clubId, name: clubId, primaryColor: '#123456' },
    },
    activeTeamAccess: { role: 'TEAM_MANAGER', status: 'ACTIVE', team: { id: teamId, clubId } },
  } as unknown as ReturnType<typeof useAuth>
}
function event(id = 'event-a', clubId = 'club-a', teamId = 'team-a') {
  return {
    id,
    clubId,
    teamId,
    type: 'MATCH',
    date: '2026-11-15T14:00:00Z',
    opponent: 'Opponent',
    viewer: { canManage: true },
    lineup: null,
  } as EventDetail
}
const live = (eventId = 'event-a') =>
  ({
    eventId,
    status: 'FINISHED',
    goalsFor: 2,
    goalsAgainst: 1,
    canRecord: true,
    events: [],
  }) as unknown as MatchLiveStateDto
const consent = {
  userId: 'player-a',
  photoConsent: true,
  publicNaming: true,
  isMinor: false,
  parentalConsent: null,
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function respond(detail = event()) {
  mockApi.mockImplementation(async (path) => {
    if (path.includes('/studio/context'))
      return { eventId: detail.id, consents: [consent] } as never
    if (path.endsWith('/live') || path.endsWith('/live/result')) return live(detail.id) as never
    return detail as never
  })
}
beforeEach(() => {
  mockApi.mockReset()
  mockAuth.mockReturnValue(auth())
  respond()
})

it('loads a single validated match snapshot with team-scoped context', async () => {
  const { result } = renderHook(() => useStudioMatch('event-a'))
  await waitFor(() => expect(result.current.ready).toBe(true))
  expect(result.current.match.consents).toEqual([consent])
  expect(result.current.match.goalsFor).toBe(2)
  expect(mockApi).toHaveBeenCalledWith('/clubs/club-a/studio/context?teamId=team-a&eventId=event-a')
})

it.each(['club', 'team', 'user', 'token', 'event'])(
  'clears stale data immediately when %s changes',
  async (field) => {
    const { result, rerender } = renderHook(({ id }: { id: string }) => useStudioMatch(id), {
      initialProps: { id: 'event-a' },
    })
    await waitFor(() => expect(result.current.ready).toBe(true))
    const pending = deferred<never>()
    mockApi.mockImplementation(() => pending.promise)
    const next = auth(
      field === 'club' ? 'club-b' : 'club-a',
      field === 'team' ? 'team-b' : 'team-a',
      field === 'user' ? 'user-b' : 'user-a',
    )
    if (field === 'token') next.token = 'new-session'
    mockAuth.mockReturnValue(next)
    rerender({ id: field === 'event' ? 'event-b' : 'event-a' })
    expect(result.current.event).toBeNull()
    expect(result.current.match.consents).toEqual([])
    expect(result.current.ready).toBe(false)
  },
)

it('ignores late responses from a previous club', async () => {
  const oldDetail = deferred<EventDetail>()
  respond()
  const normal = mockApi.getMockImplementation()!
  mockApi.mockImplementation((path, options) =>
    path === '/clubs/club-a/events/event-a' ? (oldDetail.promise as never) : normal(path, options),
  )
  const { result, rerender } = renderHook(() => useStudioMatch())
  await waitFor(() => expect(mockApi).toHaveBeenCalledWith('/clubs/club-a/events/event-a'))
  mockAuth.mockReturnValue(auth('club-b', 'team-b'))
  respond(event('event-b', 'club-b', 'team-b'))
  rerender({})
  await waitFor(() => expect(result.current.event?.id).toBe('event-b'))
  await act(async () => {
    oldDetail.resolve(event())
  })
  expect(result.current.event?.id).toBe('event-b')
  expect(result.current.match.club.name).toBe('club-b')
})

it('does not accept an older refresh after a newer refresh', async () => {
  const oldContext = deferred<never>()
  mockApi.mockImplementationOnce(() => oldContext.promise)
  const { result } = renderHook(() => useStudioMatch())
  await act(async () => {
    await result.current.refresh()
  })
  expect(result.current.ready).toBe(true)
  await act(async () => {
    oldContext.resolve({ eventId: null, consents: [] } as never)
  })
  expect(result.current.event?.id).toBe('event-a')
})

it('does not let an old refresh callback invalidate the current club request', async () => {
  const { result, rerender } = renderHook(() => useStudioMatch())
  await waitFor(() => expect(result.current.ready).toBe(true))
  const previousRefresh = result.current.refresh
  const context = deferred<never>()
  respond(event('event-b', 'club-b', 'team-b'))
  mockApi.mockImplementationOnce(() => context.promise)
  mockAuth.mockReturnValue(auth('club-b', 'team-b'))
  rerender({})
  const calls = mockApi.mock.calls.length
  await act(async () => {
    await previousRefresh()
  })
  expect(mockApi).toHaveBeenCalledTimes(calls)
  await act(async () => {
    context.resolve({ eventId: 'event-b', consents: [] } as never)
  })
  await waitFor(() => expect(result.current.event?.id).toBe('event-b'))
})

it.each(['logout', 'role', 'team-status'])(
  'clears data on %s and rejects an old mutation callback',
  async (kind) => {
    const next = auth()
    next.activeClub!.role = 'PLAYER'
    mockAuth.mockReturnValue(next)
    const { result, rerender } = renderHook(() => useStudioMatch())
    await waitFor(() => expect(result.current.ready).toBe(true))
    const previousSave = result.current.saveResult
    if (kind === 'logout') {
      next.user = null
      next.token = null
      next.activeClub = null
    }
    if (kind === 'role') next.activeTeamAccess!.role = 'PLAYER'
    if (kind === 'team-status') next.activeTeamAccess!.status = 'REVOKED'
    mockAuth.mockReturnValue({ ...next })
    mockApi.mockClear()
    rerender({})
    expect(result.current.event).toBeNull()
    expect(result.current.match.consents).toEqual([])
    expect(await previousSave(4, 0)).toBe(false)
    expect(mockApi).not.toHaveBeenCalled()
  },
)

it.each(['club', 'team', 'event', 'live'])('rejects mismatched %s records', async (kind) => {
  const detail = event()
  if (kind === 'club') detail.clubId = 'other-club'
  if (kind === 'team') detail.teamId = 'other-team'
  if (kind === 'event') detail.id = 'other-event'
  mockApi.mockImplementation(async (path) => {
    if (path.includes('/studio/context'))
      return { eventId: 'event-a', consents: [consent] } as never
    if (path.endsWith('/live')) return live(kind === 'live' ? 'other-event' : 'event-a') as never
    return detail as never
  })
  const { result } = renderHook(() => useStudioMatch('event-a'))
  await waitFor(() => expect(result.current.error).toBe(true))
  expect(result.current.event).toBeNull()
  expect(result.current.match.consents).toEqual([])
})

it('fails closed when context is unavailable, without club-wide feed fallback', async () => {
  mockApi.mockRejectedValue(new Error('Unavailable'))
  const { result } = renderHook(() => useStudioMatch())
  await waitFor(() => expect(result.current.error).toBe(true))
  expect(result.current.ready).toBe(false)
  expect(mockApi).toHaveBeenCalledTimes(1)
  expect(result.current.match.consents).toEqual([])
})

it('does not load data for a coach without a permitted Studio office', async () => {
  const next = auth()
  next.activeClub!.role = 'COACH'
  next.activeTeamAccess!.role = 'HEAD_COACH'
  mockAuth.mockReturnValue(next)
  const { result } = renderHook(() => useStudioMatch())
  expect(result.current.ready).toBe(false)
  expect(result.current.loading).toBe(false)
  expect(mockApi).not.toHaveBeenCalled()
})

it('rejects invalid scores and surfaces a failed result write as false', async () => {
  const { result } = renderHook(() => useStudioMatch())
  await waitFor(() => expect(result.current.ready).toBe(true))
  mockApi.mockClear()
  expect(await result.current.saveResult(-1, 0)).toBe(false)
  expect(mockApi).not.toHaveBeenCalled()
  mockApi.mockRejectedValue(new Error('Write failed'))
  expect(await result.current.saveResult(4, 0)).toBe(false)
  expect(result.current.live?.goalsFor).toBe(2)
})

it('ignores a result-write response after a club switch', async () => {
  const { result, rerender } = renderHook(() => useStudioMatch())
  await waitFor(() => expect(result.current.ready).toBe(true))
  const pending = deferred<MatchLiveStateDto>()
  mockApi.mockImplementationOnce(() => pending.promise as never)
  const save = result.current.saveResult(4, 0)
  mockAuth.mockReturnValue(auth('club-b', 'team-b'))
  respond(event('event-b', 'club-b', 'team-b'))
  rerender({})
  await waitFor(() => expect(result.current.event?.id).toBe('event-b'))
  await act(async () => {
    pending.resolve({ ...live(), goalsFor: 4 })
  })
  expect(await save).toBe(false)
  expect(result.current.live?.eventId).toBe('event-b')
})
