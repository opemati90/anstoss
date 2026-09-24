import { renderHook, waitFor } from '@testing-library/react-native'
import { __resetSignedMediaUrlCache, useSignedMediaUrl } from './useSignedMediaUrl'

const mockApi = jest.fn()
jest.mock('../api/client', () => ({ api: (...args: unknown[]) => mockApi(...args) }))

describe('useSignedMediaUrl', () => {
  beforeEach(() => {
    mockApi.mockReset()
    __resetSignedMediaUrlCache()
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
