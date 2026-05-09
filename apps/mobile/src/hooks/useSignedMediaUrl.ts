import { useEffect, useState } from 'react'
import { api } from '../api/client'

/**
 * Resolve a fresh signed-GET URL for a chat-media message. The URL
 * stored on Message.attachmentUrl can be public (depending on bucket
 * policy), so we re-mint a 1h URL on every render and let the API
 * re-verify channel-visibility before issuing it. Falls back to the
 * stored URL when the endpoint returns null (R2 not configured, key
 * doesn't match, channel revoked).
 *
 * Cache lives in-memory keyed by messageId so multiple bubbles for
 * the same image don't each round-trip; entries expire 50 minutes
 * after mint to stay below the 1h Stripe-style window.
 */
type CacheEntry = { url: string; expiresAt: number }
const cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 50 * 60 * 1000

export function useSignedMediaUrl(
  messageId: string | undefined,
  fallbackUrl: string | null | undefined,
): string | null {
  const [resolved, setResolved] = useState<string | null>(
    () => fallbackUrl ?? null,
  )

  useEffect(() => {
    if (!messageId) {
      setResolved(fallbackUrl ?? null)
      return
    }
    const cached = cache.get(messageId)
    if (cached && cached.expiresAt > Date.now()) {
      setResolved(cached.url)
      return
    }
    let cancelled = false
    setResolved(fallbackUrl ?? null)
    api<{ url: string | null }>(`/messages/${messageId}/media-url`)
      .then((res) => {
        if (cancelled) return
        if (res?.url) {
          cache.set(messageId, {
            url: res.url,
            expiresAt: Date.now() + CACHE_TTL_MS,
          })
          setResolved(res.url)
        }
      })
      .catch(() => {
        // Tolerated — fallback URL is already set.
      })
    return () => {
      cancelled = true
    }
  }, [messageId, fallbackUrl])

  return resolved
}
