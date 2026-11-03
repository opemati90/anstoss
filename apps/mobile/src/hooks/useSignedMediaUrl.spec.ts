import { act, renderHook, waitFor } from '@testing-library/react-native'
import { __resetSignedMediaUrlCache, useSignedMediaUrl } from './useSignedMediaUrl'

const mockApi = jest.fn()
let mockActor = 'actor-a'
jest.mock('../api/client', () => ({ api: (...args: unknown[]) => mockApi(...args) }))
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: mockActor } }) }))

describe('useSignedMediaUrl', () => {
  beforeEach(() => {
    mockApi.mockReset()
    mockActor = 'actor-a'
    __resetSignedMediaUrlCache()
  })

  afterEach(() => jest.useRealTimers())

  it('never renders private references and refreshes a mounted attachment before expiry', async () => {
    jest.useFakeTimers()
    mockApi.mockResolvedValueOnce({ url: 'https://signed/first' })
      .mockResolvedValueOnce({ url: 'https://signed/second' })
    const { result, unmount } = renderHook(() => useSignedMediaUrl('private-message', 'https://private-media.anstoss.invalid/chat/x'))
    expect(result.current).toBeNull()
    await act(async () => { await Promise.resolve() })
    expect(result.current).toBe('https://signed/first')
    await act(async () => { jest.advanceTimersByTime(4 * 60 * 1000); await Promise.resolve() })
    expect(result.current).toBe('https://signed/second')
    unmount()
  })

  it('does not fall back to a private reference when signing fails', async () => {
    mockApi.mockRejectedValueOnce({ status: 403 })
    const { result } = renderHook(() => useSignedMediaUrl('private-denied', 'https://private-media.anstoss.invalid/chat/x'))
    await waitFor(() => expect(mockApi).toHaveBeenCalledTimes(1))
    expect(result.current).toBeNull()
  })

  it('reauthorizes instead of reusing a capability after remount', async () => {
    jest.useFakeTimers()
    mockApi.mockResolvedValueOnce({ url: 'https://signed/first' }).mockResolvedValueOnce({ url: 'https://signed/new' })
    const first = renderHook(() => useSignedMediaUrl('cached-private', 'https://private-media.anstoss.invalid/chat/x'))
    await act(async () => { await Promise.resolve() })
    first.unmount()
    act(() => jest.advanceTimersByTime(3 * 60_000))
    const second = renderHook(() => useSignedMediaUrl('cached-private', 'https://private-media.anstoss.invalid/chat/x'))
    expect(second.result.current).toBeNull()
    await act(async () => { await Promise.resolve() })
    expect(second.result.current).toBe('https://signed/new')
    second.unmount()
  })

  it('does not repeatedly retry an expired cached attachment after access is revoked', async () => {
    jest.useFakeTimers()
    mockApi.mockResolvedValueOnce({ url: 'https://signed/allowed' }).mockRejectedValue({ status: 403 })
    const { result, unmount } = renderHook(() => useSignedMediaUrl('revoked-cache', 'https://private-media.anstoss.invalid/chat/x'))
    await act(async () => { await Promise.resolve() })
    expect(result.current).toBe('https://signed/allowed')
    await act(async () => { jest.advanceTimersByTime(4 * 60_000); await Promise.resolve() })
    expect(result.current).toBeNull()
    expect(mockApi).toHaveBeenCalledTimes(2)
    await act(async () => { jest.advanceTimersByTime(60_000); await Promise.resolve() })
    expect(mockApi).toHaveBeenCalledTimes(2)
    unmount()
  })

  it('does not ask the server for messages without an attachment', () => {
    const { result } = renderHook(() => useSignedMediaUrl('msg-text', null))
    expect(result.current).toBeNull()
    expect(mockApi).not.toHaveBeenCalled()
  })

  it('retries transient signing failures but not a permanent missing attachment', async () => {
    jest.useFakeTimers()
    mockApi.mockRejectedValueOnce({ status: 503 }).mockResolvedValueOnce({ url: 'https://signed/recovered' })
    const transient = renderHook(() => useSignedMediaUrl('transient', 'https://cdn/a'))
    await act(async () => { await Promise.resolve() })
    await act(async () => { jest.advanceTimersByTime(30_000); await Promise.resolve() })
    expect(transient.result.current).toBe('https://signed/recovered')
    transient.unmount()
    mockApi.mockReset()
    mockApi.mockRejectedValue({ status: 404 })
    const missing = renderHook(() => useSignedMediaUrl('missing', 'https://cdn/a'))
    await act(async () => { await Promise.resolve() })
    await act(async () => { jest.advanceTimersByTime(5 * 60_000); await Promise.resolve() })
    expect(mockApi).toHaveBeenCalledTimes(1)
    missing.unmount()
  })

  it('skips optimistic rows', () => {
    renderHook(() => useSignedMediaUrl('pending:cm_1', 'https://cdn/x.jpg'))
    expect(mockApi).not.toHaveBeenCalled()
  })

  it('never uses a stored remote URL when signing returns null', async () => {
    mockApi.mockResolvedValue({ url: null })
    const first = renderHook(() => useSignedMediaUrl('msg-img', 'https://cdn/a.jpg'))
    await waitFor(() => expect(mockApi).toHaveBeenCalledTimes(1))
    expect(first.result.current).toBeNull()
    first.unmount()

    const second = renderHook(() => useSignedMediaUrl('msg-img', 'https://cdn/a.jpg'))
    expect(second.result.current).toBeNull()
    await waitFor(() => expect(mockApi).toHaveBeenCalledTimes(2))
  })

  it('discards an in-flight signed URL when the account changes', async () => {
    let finish!: (value: { url: string }) => void
    mockApi.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
      .mockResolvedValueOnce({ url: null })
    const hook = renderHook(() => useSignedMediaUrl('msg-switch', 'https://cdn/a.jpg'))
    mockActor = 'actor-b'
    hook.rerender({})
    await act(async () => { finish({ url: 'https://signed/account-a' }); await Promise.resolve() })
    expect(hook.result.current).toBeNull()
    expect(mockApi).toHaveBeenLastCalledWith(expect.any(String), { headers: { 'x-expected-actor-id': 'actor-b' } })
  })

  it('uses the signed URL when the server returns one', async () => {
    mockApi.mockResolvedValueOnce({ url: 'https://signed/b.jpg' })
    const { result } = renderHook(() => useSignedMediaUrl('msg-b', 'https://cdn/b.jpg'))
    await waitFor(() => expect(result.current).toBe('https://signed/b.jpg'))
  })
})
