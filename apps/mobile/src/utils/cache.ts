import AsyncStorage from '@react-native-async-storage/async-storage'
import { CACHE } from '@anstoss/shared'

/**
 * AsyncStorage LRU cache with stale-while-revalidate pattern.
 *
 * - L1: in-memory Map for instant reads on team switch (<1ms)
 * - L2: AsyncStorage for persistence across app restarts
 * - LRU eviction when total cache exceeds 4MB
 */

/** L1 in-memory cache — avoids async AsyncStorage reads on team switch */
const memoryCache = new Map<string, { value: unknown; timestamp: number }>()
const L1_MAX_ENTRIES = 50

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
 * Get a cached value. Checks L1 memory first, falls back to L2 AsyncStorage.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  // L1: instant in-memory read
  const mem = memoryCache.get(key)
  if (mem) {
    mem.timestamp = Date.now()
    return mem.value as T
  }

  // L2: AsyncStorage
  const raw = await AsyncStorage.getItem(CACHE_PREFIX + key)
  if (!raw) return null

  const entry: CacheEntry<T> = JSON.parse(raw)

  // Promote to L1
  memoryCacheSet(key, entry.value)

  // Update access timestamp in index for LRU
  const index = await getIndex()
  if (index.entries[key]) {
    index.entries[key].timestamp = Date.now()
    await saveIndex(index)
  }

  return entry.value
}

/** Write to L1 memory cache with LRU eviction */
function memoryCacheSet(key: string, value: unknown): void {
  memoryCache.set(key, { value, timestamp: Date.now() })

  if (memoryCache.size > L1_MAX_ENTRIES) {
    // Evict oldest entry
    let oldestKey: string | null = null
    let oldestTs = Infinity
    for (const [k, v] of memoryCache) {
      if (v.timestamp < oldestTs) {
        oldestTs = v.timestamp
        oldestKey = k
      }
    }
    if (oldestKey) memoryCache.delete(oldestKey)
  }
}

/**
 * Set a cached value. Writes to both L1 memory and L2 AsyncStorage.
 * Triggers LRU eviction on L2 if over size limit.
 */
export async function cacheSet<T>(key: string, value: T): Promise<void> {
  // L1: instant write
  memoryCacheSet(key, value)

  const serialized = JSON.stringify(value)
  const bytes = serialized.length * 2 // approximate UTF-16 byte size

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

/**
 * Pre-warm L1 cache for a set of team IDs.
 * Reads existing L2 entries into L1 so team switch is instant.
 */
export async function prefetchTeamData(
  clubId: string,
  teamIds: string[],
): Promise<void> {
  const keys = teamIds.flatMap((tid) => [
    `dashboard:${clubId}:${tid}:events`,
    `dashboard:${clubId}:${tid}:roster`,
  ])

  const pairs = await AsyncStorage.multiGet(keys.map((k) => CACHE_PREFIX + k))

  for (const [storageKey, raw] of pairs) {
    if (!raw) continue
    try {
      const entry: CacheEntry<unknown> = JSON.parse(raw)
      const cacheKey = storageKey.replace(CACHE_PREFIX, '')
      memoryCacheSet(cacheKey, entry.value)
    } catch {
      // Corrupted entry — skip
    }
  }
}

/** Clear L1 memory cache (e.g., on sign-out) */
export function clearMemoryCache(): void {
  memoryCache.clear()
}
