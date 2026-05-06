import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError } from '../api/client'
import { useAuth } from '../context/AuthContext'

export type EntitlementsResponse = {
  clubId: string
  plan: 'FOUNDATION' | 'PREMIUM'
  features: string[]
}

const STALE_MS = 5 * 60 * 1000
const cache = new Map<string, { data: EntitlementsResponse; fetchedAt: number }>()

function safeUseAuth(): { activeClub: { club: { id: string } } | null } {
  try {
    return useAuth()
  } catch {
    // Tests / stories that render gated components without an
    // AuthProvider get a null club — entitlements remain in default
    // FOUNDATION state. Avoids forcing every test to wrap providers.
    return { activeClub: null }
  }
}

export function useEntitlements() {
  const { activeClub } = safeUseAuth()
  const clubId = activeClub?.club.id ?? null
  const [data, setData] = useState<EntitlementsResponse | null>(
    clubId ? cache.get(clubId)?.data ?? null : null,
  )
  const [loading, setLoading] = useState(false)
  const inflightRef = useRef<string | null>(null)

  const refresh = useCallback(async () => {
    if (!clubId) return null
    if (inflightRef.current === clubId) return null
    inflightRef.current = clubId
    setLoading(true)
    try {
      const fresh = await api<EntitlementsResponse>(
        `/clubs/${clubId}/billing/entitlements`,
      )
      cache.set(clubId, { data: fresh, fetchedAt: Date.now() })
      setData(fresh)
      return fresh
    } catch (err) {
      // 403/404 — treat as FOUNDATION so the app falls back to free-tier
      // gating instead of crashing the screen.
      if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
        const fallback: EntitlementsResponse = {
          clubId,
          plan: 'FOUNDATION',
          features: [],
        }
        cache.set(clubId, { data: fallback, fetchedAt: Date.now() })
        setData(fallback)
        return fallback
      }
      return null
    } finally {
      inflightRef.current = null
      setLoading(false)
    }
  }, [clubId])

  useEffect(() => {
    if (!clubId) {
      setData(null)
      return
    }
    const cached = cache.get(clubId)
    if (cached && Date.now() - cached.fetchedAt < STALE_MS) {
      setData(cached.data)
      return
    }
    void refresh()
  }, [clubId, refresh])

  const has = useCallback(
    (feature: string) => Boolean(data?.features.includes(feature)),
    [data],
  )
  const isPremium = data?.plan === 'PREMIUM'

  return useMemo(
    () => ({
      data,
      loading,
      isPremium,
      plan: data?.plan ?? 'FOUNDATION',
      features: data?.features ?? [],
      has,
      refresh,
    }),
    [data, loading, isPremium, has, refresh],
  )
}
