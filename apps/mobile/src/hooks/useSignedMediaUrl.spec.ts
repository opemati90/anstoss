import { act, renderHook, waitFor } from '@testing-library/react-native'
import { __resetSignedMediaUrlCache, useSignedMediaUrl } from './useSignedMediaUrl'

const mockApi = jest.fn()
jest.mock('../api/client', () => ({ api: (...args: unknown[]) => mockApi(...args) }))

describe('useSignedMediaUrl', () => {
  beforeEach(() => {
    mockApi.mockReset()
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

  it('refreshes a remounted cached URL at its original expiry, not four minutes after remount', async () => {
    jest.useFakeTimers()
    mockApi.mockResolvedValueOnce({ url: 'https://signed/first' }).mockResolvedValueOnce({ url: 'https://signed/new' })
    const first = renderHook(() => useSignedMediaUrl('cached-private', 'https://private-media.anstoss.invalid/chat/x'))
    await act(async () => { await Promise.resolve() })
    first.unmount()
    act(() => jest.advanceTimersByTime(3 * 60_000))
    const second = renderHook(() => useSignedMediaUrl('cached-private', 'https://private-media.anstoss.invalid/chat/x'))
    expect(second.result.current).toBe('https://signed/first')
    await act(async () => { jest.advanceTimersByTime(60_000); await Promise.resolve() })
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

  it('skips optimistic rows', () => {
    renderHook(() => useSignedMediaUrl('pending:cm_1', 'https://cdn/x.jpg'))
    expect(mockApi).not.toHaveBeenCalled()
  })

  it('resolves once and serves repeat mounts from cache, including null answers', async () => {
    mockApi.mockResolvedValueOnce({ url: null })
    const first = renderHook(() => useSignedMediaUrl('msg-img', 'https://cdn/a.jpg'))
    await waitFor(() => expect(mockApi).toHaveBeenCalledTimes(1))
    expect(first.result.current).toBe('https://cdn/a.jpg')
    first.unmount()

    const second = renderHook(() => useSignedMediaUrl('msg-img', 'https://cdn/a.jpg'))
    expect(second.result.current).toBe('https://cdn/a.jpg')
    expect(mockApi).toHaveBeenCalledTimes(1)
  })

  it('uses the signed URL when the server returns one', async () => {
    mockApi.mockResolvedValueOnce({ url: 'https://signed/b.jpg' })
    const { result } = renderHook(() => useSignedMediaUrl('msg-b', 'https://cdn/b.jpg'))
    await waitFor(() => expect(result.current).toBe('https://signed/b.jpg'))
  })
})
