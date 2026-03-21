import AsyncStorage from '@react-native-async-storage/async-storage'
import { CACHE } from '@anstoss/shared'

/**
 * AsyncStorage LRU cache with stale-while-revalidate pattern.
 *
 * - Render from cache immediately, fetch fresh data behind it
 * - LRU eviction when total cache exceeds 4MB
 * - Each entry stores value + timestamp + approximate byte size
 */

interface CacheEntry<T> {
  value: T
  timestamp: number
  bytes: number
}

const CACHE_PREFIX = 'anstoss:cache:'
const INDEX_KEY = 'anstoss:cache:__index'

interface CacheIndex {
  entries: Record<string, { timestamp: number; bytes: number }>
  totalBytes: number
}

async function getIndex(): Promise<CacheIndex> {
  const raw = await AsyncStorage.getItem(INDEX_KEY)
  if (raw) {
    return JSON.parse(raw)
  }
  return { entries: {}, totalBytes: 0 }
}

async function saveIndex(index: CacheIndex): Promise<void> {
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index))
}

/**
 * Get a cached value. Returns null if not found.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(CACHE_PREFIX + key)
  if (!raw) return null

  const entry: CacheEntry<T> = JSON.parse(raw)

  // Update access timestamp in index for LRU
  const index = await getIndex()
  if (index.entries[key]) {
    index.entries[key].timestamp = Date.now()
    await saveIndex(index)
  }

  return entry.value
}

/**
 * Set a cached value. Triggers LRU eviction if over size limit.
 */
export async function cacheSet<T>(key: string, value: T): Promise<void> {
  const serialized = JSON.stringify(value)
  const bytes = new Blob([serialized]).size

  const entry: CacheEntry<T> = {
    value,
    timestamp: Date.now(),
    bytes,
  }

  await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry))

  // Update index
  const index = await getIndex()
  const oldBytes = index.entries[key]?.bytes || 0
  index.entries[key] = { timestamp: Date.now(), bytes }
  index.totalBytes = index.totalBytes - oldBytes + bytes

  // LRU eviction if over limit
  while (index.totalBytes > CACHE.MAX_SIZE_BYTES) {
    const oldest = Object.entries(index.entries).sort(
      ([, a], [, b]) => a.timestamp - b.timestamp,
    )[0]

    if (!oldest) break

    const [evictKey, evictMeta] = oldest
    await AsyncStorage.removeItem(CACHE_PREFIX + evictKey)
    index.totalBytes -= evictMeta.bytes
    delete index.entries[evictKey]
  }

  await saveIndex(index)
}

/**
 * Stale-while-revalidate: return cached value immediately,
 * fetch fresh data in background.
 */
export async function staleWhileRevalidate<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cached = await cacheGet<T>(key)

  // Always revalidate in background
  const freshPromise = fetcher().then(async (fresh) => {
    await cacheSet(key, fresh)
    return fresh
  })

  if (cached !== null) {
    // Return stale, revalidate behind
    freshPromise.catch(() => {
      // Swallow — stale data is better than no data
    })
    return cached
  }

  // No cache — must wait for fresh
  return freshPromise
}
