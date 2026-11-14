import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { StudioBrandKit, UpdateStudioBrandKitInput } from '@anstoss/shared'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useStudioBrandKit } from '../useStudioBrandKit'

jest.mock('../../api/client', () => ({ api: jest.fn() }))
jest.mock('../../context/AuthContext', () => ({ useAuth: jest.fn() }))
const mockApi = api as jest.MockedFunction<typeof api>
const mockAuth = useAuth as jest.MockedFunction<typeof useAuth>

function auth(clubId = 'club-a', userId = 'user-a', role = 'ADMIN', offices: string[] = []) {
  return {
    user: { id: userId },
    token: `session-${userId}`,
    activeTeamId: 'team-a',
    activeClub: { role, operationalRoles: offices, club: { id: clubId } },
    activeTeamAccess: { role: 'PLAYER', status: 'ACTIVE', team: { id: 'team-a', clubId } },
  } as unknown as ReturnType<typeof useAuth>
}
function kit(clubId = 'club-a', patch: Partial<StudioBrandKit> = {}): StudioBrandKit {
  return {
    clubId,
    crestUrl: null,
    sponsors: [],
    fontPairing: 'CONDENSED',
    handle: '@confirmed',
    hashtags: [],
    colors: { primary: '#123456', accent: '#D4F25C', dark: '#121A15', light: '#F1EEE4' },
    accounts: [
      { channel: 'INSTAGRAM', connected: false, handle: null },
      { channel: 'FACEBOOK', connected: false, handle: null },
    ],
    templateSetAt: null,
    ...patch,
  }
}
function deferred() {
  let resolve!: (value: unknown) => void
  let reject!: (error: Error) => void
  const promise = new Promise<unknown>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
beforeEach(() => {
  mockApi.mockReset()
  mockAuth.mockReturnValue(auth())
  mockApi.mockResolvedValue(kit())
})

it('loads only a validated server-confirmed kit', async () => {
  const { result } = renderHook(() => useStudioBrandKit())
  await waitFor(() => expect(result.current.ready).toBe(true))
  expect(result.current.kit).toEqual(kit())
  expect(result.current.canEdit).toBe(true)
  expect(mockApi).toHaveBeenCalledWith('/clubs/club-a/studio/brand-kit')
})

it.each([null, {}, kit('foreign'), kit('club-a', { colors: { primary: 'bad' } } as never)])(
  'does not synthesize success from malformed or foreign responses: %p',
  async (response) => {
    mockApi.mockResolvedValue(response)
    const { result } = renderHook(() => useStudioBrandKit())
    await waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current.kit).toBeNull()
    expect(result.current.ready).toBe(false)
  },
)

it.each(['club', 'user', 'token', 'team', 'permission'])(
  'immediately hides settings on %s changes and rejects stale callbacks',
  async (field) => {
    const { result, rerender } = renderHook(() => useStudioBrandKit())
    await waitFor(() => expect(result.current.ready).toBe(true))
    const oldRefresh = result.current.refresh
    const oldSave = result.current.save
    const pending = deferred()
    mockApi.mockImplementation(() => pending.promise)
    const next = auth(
      field === 'club' ? 'club-b' : 'club-a',
      field === 'user' ? 'user-b' : 'user-a',
    )
    if (field === 'token') next.token = 'session-new'
    if (field === 'team') next.activeTeamId = 'team-b'
    if (field === 'permission') next.activeClub!.role = 'PLAYER'
    mockAuth.mockReturnValue(next)
    rerender({})
    expect(result.current.kit).toBeNull()
    expect(result.current.ready).toBe(false)
    const calls = mockApi.mock.calls.length
    await act(async () => {
      await oldRefresh()
      expect(await oldSave({ handle: '@wrong' })).toBe(false)
    })
    expect(mockApi).toHaveBeenCalledTimes(calls)
  },
)

it('clears settings on logout and shares no cached kit with a subsequent mount', async () => {
  const first = renderHook(() => useStudioBrandKit())
  await waitFor(() => expect(first.result.current.ready).toBe(true))
  mockAuth.mockReturnValue({ ...auth(), user: null, token: null, activeClub: null })
  first.rerender({})
  expect(first.result.current.kit).toBeNull()
  first.unmount()
  mockAuth.mockReturnValue(auth())
  mockApi.mockImplementation(() => deferred().promise)
  const second = renderHook(() => useStudioBrandKit())
  expect(second.result.current.kit).toBeNull()
  expect(second.result.current.ready).toBe(false)
})

it('does not let a late read replace a newer refresh', async () => {
  const old = deferred()
  mockApi.mockImplementationOnce(() => old.promise)
  const { result } = renderHook(() => useStudioBrandKit())
  mockApi.mockResolvedValue(kit('club-a', { handle: '@new' }))
  await act(async () => {
    await result.current.refresh()
  })
  await act(async () => {
    old.resolve(kit())
  })
  expect(result.current.kit?.handle).toBe('@new')
})

it('shows the last confirmed kit while refreshing but disables export readiness', async () => {
  const { result } = renderHook(() => useStudioBrandKit())
  await waitFor(() => expect(result.current.ready).toBe(true))
  const refresh = deferred()
  mockApi.mockImplementationOnce(() => refresh.promise)
  act(() => {
    void result.current.refresh()
  })
  expect(result.current.kit?.handle).toBe('@confirmed')
  expect(result.current.loading).toBe(true)
  expect(result.current.ready).toBe(false)
  await act(async () => {
    refresh.reject(new Error('Revoked'))
  })
  expect(result.current.kit).toBeNull()
  expect(result.current.error).toBe(true)
})

it('waits for a confirmed write, normalizes inputs and blocks duplicate saves/refreshes', async () => {
  const { result } = renderHook(() => useStudioBrandKit())
  await waitFor(() => expect(result.current.ready).toBe(true))
  const saved = deferred()
  mockApi.mockImplementationOnce(() => saved.promise)
  let save!: Promise<boolean>
  act(() => {
    save = result.current.save({ handle: '  @new  ' })
  })
  expect(result.current.kit?.handle).toBe('@confirmed')
  expect(result.current.saving).toBe(true)
  expect(result.current.ready).toBe(false)
  await act(async () => {
    expect(await result.current.save({ handle: '@duplicate' })).toBe(false)
    await result.current.refresh()
  })
  expect(mockApi).toHaveBeenCalledTimes(2)
  expect(mockApi).toHaveBeenLastCalledWith('/clubs/club-a/studio/brand-kit', {
    method: 'PUT',
    body: { handle: '@new' },
  })
  await act(async () => {
    saved.resolve(kit('club-a', { handle: '@new' }))
    expect(await save).toBe(true)
  })
  expect(result.current.kit?.handle).toBe('@new')
  expect(result.current.saving).toBe(false)
})

it.each(['network', 'wrong-club', 'unpersisted', 'malformed'])(
  'reports failed persistence on %s and never displays an optimistic edit',
  async (mode) => {
    const { result } = renderHook(() => useStudioBrandKit())
    await waitFor(() => expect(result.current.ready).toBe(true))
    if (mode === 'network') mockApi.mockRejectedValueOnce(new Error('Offline'))
    else
      mockApi.mockResolvedValueOnce(
        mode === 'wrong-club' ? kit('foreign') : mode === 'malformed' ? {} : kit(),
      )
    await act(async () => {
      expect(await result.current.save({ handle: '@new' })).toBe(false)
    })
    expect(result.current.ready).toBe(false)
    expect(result.current.error).toBe(true)
    expect(result.current.kit).toBeNull()
    mockApi.mockResolvedValue(kit())
    await act(async () => {
      await result.current.refresh()
    })
    expect(result.current.kit?.handle).toBe('@confirmed')
  },
)

it('rejects a late write acknowledgement after switching clubs and back', async () => {
  const { result, rerender } = renderHook(() => useStudioBrandKit())
  await waitFor(() => expect(result.current.ready).toBe(true))
  const pending = deferred()
  mockApi.mockImplementationOnce(() => pending.promise)
  let save!: Promise<boolean>
  act(() => {
    save = result.current.save({ handle: '@stale' })
  })
  mockAuth.mockReturnValue(auth('club-b'))
  mockApi.mockResolvedValue(kit('club-b'))
  rerender({})
  await waitFor(() => expect(result.current.kit?.clubId).toBe('club-b'))
  mockAuth.mockReturnValue(auth())
  mockApi.mockResolvedValue(kit())
  rerender({})
  await waitFor(() => expect(result.current.ready).toBe(true))
  await act(async () => {
    pending.resolve(kit('club-a', { handle: '@stale' }))
    expect(await save).toBe(false)
  })
  expect(result.current.kit?.handle).toBe('@confirmed')
})

it.each(['CAPTAIN', 'TEAM_COORDINATOR'])(
  'allows %s to read but not alter the club brand',
  async (office) => {
    mockAuth.mockReturnValue(auth('club-a', 'user-a', 'PLAYER', [office]))
    const { result } = renderHook(() => useStudioBrandKit())
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.canEdit).toBe(false)
    await act(async () => {
      expect(await result.current.save({ handle: '@new' })).toBe(false)
    })
    expect(mockApi).toHaveBeenCalledTimes(1)
  },
)

it.each(['BOARD_MEMBER', 'MEDIA_MANAGER'])(
  'allows the explicit club-wide %s office to edit',
  async (office) => {
    mockAuth.mockReturnValue(auth('club-a', 'user-a', 'PLAYER', [office]))
    const { result } = renderHook(() => useStudioBrandKit())
    await waitFor(() => expect(result.current.canEdit).toBe(true))
  },
)

it.each([
  {},
  { handle: 'x'.repeat(41) },
  { clubId: 'foreign' },
  { sponsors: [{ id: 's', name: 'Sponsor', logoUrl: 'https://bad.test' }] },
])('rejects empty/invalid/unknown-field changes before requesting a write: %p', async (patch) => {
  const { result } = renderHook(() => useStudioBrandKit())
  await waitFor(() => expect(result.current.ready).toBe(true))
  await act(async () => {
    expect(await result.current.save(patch as UpdateStudioBrandKitInput)).toBe(false)
  })
  expect(mockApi).toHaveBeenCalledTimes(1)
  expect(result.current.ready).toBe(true)
})

it('accepts sponsor acknowledgement with server-owned logo data', async () => {
  const { result } = renderHook(() => useStudioBrandKit())
  await waitFor(() => expect(result.current.ready).toBe(true))
  mockApi.mockResolvedValueOnce(
    kit('club-a', {
      sponsors: [{ id: 's', name: 'Sponsor', logoUrl: 'https://example.test/logo.png' }],
    }),
  )
  await act(async () => {
    expect(await result.current.save({ sponsors: [{ id: 's', name: 'Sponsor' }] })).toBe(true)
  })
})
