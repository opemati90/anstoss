import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  cacheGet,
  cacheSet,
  staleWhileRevalidate,
  prefetchTeamData,
  clearMemoryCache,
} from '../cache'

// AsyncStorage is auto-mocked by jest-setup

beforeEach(() => {
  clearMemoryCache()
  ;(AsyncStorage.getItem as jest.Mock).mockReset()
  ;(AsyncStorage.setItem as jest.Mock).mockReset()
  ;(AsyncStorage.removeItem as jest.Mock).mockReset()
})

describe('cacheGet', () => {
  it('returns null when key is not in L1 or L2', async () => {
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue(null)
    expect(await cacheGet('missing')).toBeNull()
  })

  it('returns value from L2 and promotes to L1', async () => {
    const entry = { value: { name: 'test' }, timestamp: 1000, bytes: 20 }
    ;(AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      if (key === 'anstoss:cache:mykey') return JSON.stringify(entry)
      return JSON.stringify({ entries: { mykey: { timestamp: 1000, bytes: 20 } }, totalBytes: 20 })
    })

    const result = await cacheGet('mykey')
    expect(result).toEqual({ name: 'test' })

    // Second call should hit L1 without AsyncStorage
    ;(AsyncStorage.getItem as jest.Mock).mockReset()
    const result2 = await cacheGet('mykey')
    expect(result2).toEqual({ name: 'test' })
    expect(AsyncStorage.getItem).not.toHaveBeenCalled()
  })
})

describe('cacheSet', () => {
  it('writes to L1 and L2', async () => {
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify({ entries: {}, totalBytes: 0 }),
    )
    ;(AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined)

    await cacheSet('key1', { data: 'hello' })

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'anstoss:cache:key1',
      expect.stringContaining('"data":"hello"'),
    )

    // L1 should have it
    const result = await cacheGet('key1')
    expect(result).toEqual({ data: 'hello' })
  })
})

describe('staleWhileRevalidate', () => {
  it('returns cached value immediately and revalidates in background', async () => {
    // Seed the L1 cache
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify({ entries: {}, totalBytes: 0 }),
    )
    ;(AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined)
    await cacheSet('swr-key', { old: true })

    const fetcher = jest.fn().mockResolvedValue({ old: false, fresh: true })

    const result = await staleWhileRevalidate('swr-key', fetcher)
    expect(result).toEqual({ old: true }) // stale returned instantly
    expect(fetcher).toHaveBeenCalled() // revalidation triggered

    // Wait for background revalidation
    await new Promise((r) => setTimeout(r, 10))

    // Now cache should have fresh value
    const fresh = await cacheGet('swr-key')
    expect(fresh).toEqual({ old: false, fresh: true })
  })

  it('waits for fetcher when cache is empty', async () => {
    clearMemoryCache()
    ;(AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      if (key.includes('__index')) {
        return JSON.stringify({ entries: {}, totalBytes: 0 })
      }
      return null
    })
    ;(AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined)

    const fetcher = jest.fn().mockResolvedValue({ fresh: true })

    const result = await staleWhileRevalidate('empty-key', fetcher)
    expect(result).toEqual({ fresh: true })
  })

  it('returns stale data when fetcher fails', async () => {
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify({ entries: {}, totalBytes: 0 }),
    )
    ;(AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined)
    await cacheSet('fail-key', { stale: true })

    const fetcher = jest.fn().mockRejectedValue(new Error('network'))

    const result = await staleWhileRevalidate('fail-key', fetcher)
    expect(result).toEqual({ stale: true })

    // Wait for background error to be swallowed
    await new Promise((r) => setTimeout(r, 10))
  })
})

describe('prefetchTeamData', () => {
  it('loads L2 entries into L1 memory', async () => {
    const entry = JSON.stringify({ value: [{ id: '1' }], timestamp: 1000, bytes: 30 })
    ;(AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      if (key === 'anstoss:cache:dashboard:club1:team1:events') {
        return Promise.resolve(entry)
      }
      if (key === 'anstoss:cache:dashboard:club1:team1:roster') {
        return Promise.resolve(null)
      }
      return Promise.resolve(null)
    })

    await prefetchTeamData('club1', ['team1'])

    // Events should now be in L1
    const result = await cacheGet('dashboard:club1:team1:events')
    expect(result).toEqual([{ id: '1' }])
  })
})

describe('clearMemoryCache', () => {
  it('clears all L1 entries', async () => {
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify({ entries: {}, totalBytes: 0 }),
    )
    ;(AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined)
    await cacheSet('clear-key', 'value')

    clearMemoryCache()

    // L1 is empty, must go to L2
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue(null)
    const result = await cacheGet('clear-key')
    expect(result).toBeNull()
  })
})
