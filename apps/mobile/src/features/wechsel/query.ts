import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useFocusEffect } from 'expo-router'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'

/**
 * Small stale-while-revalidate query layer for the Wechselbörse screens.
 *
 * The app has no React Query dependency; this mirrors the parts we need:
 * a shared cache, cached data shown instantly while a refetch runs, refetch
 * on screen focus, and prefix invalidation after a mutation so every screen
 * that shows the same record updates together.
 *
 * M6 (review 2026-09-24): entries are keyed by user + active club + path and
 * the whole cache is dropped when the signed-in user or the active club
 * changes, so one account never sees another's trials. Invalidation drops
 * in-flight requests (their late answers are ignored) and refetches.
 */

type Entry = {
  data?: unknown
  /** True once a response arrived (an empty body counts: it becomes null). */
  loaded?: boolean
  error?: unknown
  fetchedAt: number
  inflight?: Promise<unknown> | null
  /** Id of the request whose answer this entry accepts. */
  requestId?: number
}

const STALE_MS = 15_000
const cache = new Map<string, Entry>()
const listeners = new Set<() => void>()
let version = 0
let requestSeq = 0
/** `${userId}:${clubId}` the cache currently belongs to. */
let scope = 'anon:none'

function emit() {
  version += 1
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const keyFor = (path: string) => `${scope}|${path}`
const pathOf = (key: string) => key.slice(key.indexOf('|') + 1)

/**
 * Switch the cache to another user/club. Everything cached for the previous
 * one is dropped, including answers still in flight.
 */
export function setApiCacheScope(
  userId: string | null | undefined,
  clubId: string | null | undefined,
  notify = true,
) {
  const next = `${userId ?? 'anon'}:${clubId ?? 'none'}`
  if (next === scope) return
  scope = next
  cache.clear()
  if (notify) emit()
}

async function fetchPath(path: string, force = false): Promise<unknown> {
  const key = keyFor(path)
  const existing = cache.get(key)
  if (!force && existing?.inflight) return existing.inflight
  const requestId = ++requestSeq
  const accepts = () => cache.get(key)?.requestId === requestId
  const inflight = api<unknown>(path)
    .then((data) => {
      if (accepts()) {
        cache.set(key, {
          data: data === undefined ? null : data,
          loaded: true,
          error: undefined,
          fetchedAt: Date.now(),
          inflight: null,
          requestId,
        })
        emit()
      }
      return data
    })
    .catch((error: unknown) => {
      if (accepts()) {
        const prev = cache.get(key)
        cache.set(key, {
          data: prev?.data,
          loaded: prev?.loaded,
          error,
          fetchedAt: Date.now(),
          inflight: null,
          requestId,
        })
        emit()
      }
      throw error
    })
  cache.set(key, {
    data: existing?.data,
    loaded: existing?.loaded,
    error: existing?.error,
    fetchedAt: existing?.fetchedAt ?? 0,
    inflight,
    requestId,
  })
  emit()
  return inflight
}

/**
 * Refetch every cached path (of the current user/club) that starts with one
 * of the prefixes. A request already in flight is superseded: it may have
 * been sent before the mutation and would bring back stale data.
 */
export function invalidateApi(...prefixes: string[]) {
  const keys = Array.from(cache.keys()).filter(
    (key) => key.startsWith(`${scope}|`) && prefixes.some((prefix) => pathOf(key).startsWith(prefix)),
  )
  for (const key of keys) {
    const entry = cache.get(key)
    if (entry) entry.fetchedAt = 0
    void fetchPath(pathOf(key), true).catch(() => undefined)
  }
}

/** Test/e2e helper: forget everything (e.g. after switching persona). */
export function resetApiCache() {
  cache.clear()
  scope = 'anon:none'
  emit()
}

export type ApiQuery<T> = {
  data: T | undefined
  error: unknown
  /** First load with nothing cached yet. Never stuck: errors end it. */
  isLoading: boolean
  isRefetching: boolean
  refetch: () => Promise<void>
}

/** Keeps the cache scope in line with the signed-in user and active club. */
function useCacheScope() {
  let userId: string | null = null
  let clubId: string | null = null
  try {
    const auth = useAuth()
    userId = auth.user?.id ?? null
    clubId = auth.activeClub?.club.id ?? null
  } catch {
    // Outside the AuthProvider (isolated screen tests): anonymous scope.
  }
  // Switch before reading so the first render never shows another user's data.
  // No emit during render: every reader re-renders with the auth change anyway.
  setApiCacheScope(userId, clubId, false)
  return `${userId ?? 'anon'}:${clubId ?? 'none'}`
}

export function useApiQuery<T>(path: string | null): ApiQuery<T> {
  const currentScope = useCacheScope()
  useSyncExternalStore(subscribe, () => version, () => version)
  const entry = path ? cache.get(keyFor(path)) : undefined
  const pathRef = useRef(path)
  pathRef.current = path

  const load = useCallback(async (force: boolean) => {
    const current = pathRef.current
    if (!current) return
    const cached = cache.get(keyFor(current))
    if (!force && cached && !cached.error && Date.now() - cached.fetchedAt < STALE_MS) return
    await fetchPath(current, force).catch(() => undefined)
  }, [])

  useEffect(() => {
    void load(false)
  }, [path, currentScope, load])

  useFocusEffect(
    useCallback(() => {
      void load(false)
    }, [load]),
  )

  const refetch = useCallback(() => load(true), [load])

  const hasData = Boolean(entry?.loaded)
  return {
    data: entry?.data as T | undefined,
    error: entry?.error,
    isLoading: Boolean(path) && !hasData && !entry?.error,
    isRefetching: Boolean(entry?.inflight) && hasData,
    refetch,
  }
}

/**
 * Runs a write, then invalidates the given path prefixes. Exposes the
 * pending state so buttons can show progress and block double taps.
 */
export function useApiMutation<TVars, TResult = unknown>(
  run: (vars: TVars) => Promise<TResult>,
  invalidate: string[] | ((vars: TVars) => string[]),
) {
  useCacheScope()
  const [pending, setPending] = useState(false)
  const pendingRef = useRef(false)
  const mutate = useCallback(
    async (vars: TVars): Promise<TResult> => {
      if (pendingRef.current) throw new Error('mutation already running')
      pendingRef.current = true
      setPending(true)
      try {
        const result = await run(vars)
        const prefixes = typeof invalidate === 'function' ? invalidate(vars) : invalidate
        invalidateApi(...prefixes)
        return result
      } finally {
        pendingRef.current = false
        setPending(false)
      }
    },
    [run, invalidate],
  )
  return { mutate, pending }
}
