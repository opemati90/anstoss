import { useEffect, useState } from 'react'
import { api } from '../api/client'

/**
 * Resolve a fresh signed-GET URL for a chat-media message. The URL
 * stored on Message.attachmentUrl can be public (depending on bucket
 * policy), so we re-mint a 1h URL and let the API re-verify
 * channel-visibility before issuing it. Falls back to the stored URL when
 * the endpoint returns null (R2 not configured, key doesn't match,
 * channel revoked).
 *
 * Only messages that actually carry an attachment ask the server: a text
 * bubble has nothing to sign, and asking for every bubble used to fire one
 * request per message on each mount. Results (including "no signed URL")
 * are cached in memory per messageId; entries expire 50 minutes after mint
 * to stay below the 1h signing window.
 */
type CacheEntry = { url: string | null; expiresAt: number }
const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<string | null>>()
const CACHE_TTL_MS = 50 * 60 * 1000

/** Test hook: forget every cached/in-flight resolution. */
export function __resetSignedMediaUrlCache() {
  cache.clear()
  inflight.clear()
}

function shouldResolve(messageId: string | undefined, fallbackUrl: string | null | undefined) {
  if (!messageId || !fallbackUrl) return false
  // Optimistic local rows have no server row to sign yet.
  if (messageId.startsWith('pending:') || messageId.startsWith('e2e-')) return false
  return true
}

function resolveSigned(messageId: string): Promise<string | null> {
  const existing = inflight.get(messageId)
  if (existing) return existing
  const request = api<{ url: string | null }>(`/messages/${messageId}/media-url`)
    .then((res) => res?.url ?? null)
    .catch(() => null)
    .then((url) => {
      cache.set(messageId, { url, expiresAt: Date.now() + CACHE_TTL_MS })
      inflight.delete(messageId)
      return url
    })
  inflight.set(messageId, request)
  return request
}

export function useSignedMediaUrl(
  messageId: string | undefined,
  fallbackUrl: string | null | undefined,
): string | null {
  const [resolved, setResolved] = useState<string | null>(() => {
    if (messageId) {
      const cached = cache.get(messageId)
      if (cached && cached.expiresAt > Date.now()) return cached.url ?? fallbackUrl ?? null
    }
    return fallbackUrl ?? null
  })

  useEffect(() => {
    if (!shouldResolve(messageId, fallbackUrl)) {
      setResolved(fallbackUrl ?? null)
      return
    }
    const id = messageId as string
    const cached = cache.get(id)
    if (cached && cached.expiresAt > Date.now()) {
      setResolved(cached.url ?? fallbackUrl ?? null)
      return
    }
    let cancelled = false
    setResolved(fallbackUrl ?? null)
    void resolveSigned(id).then((url) => {
      if (!cancelled) setResolved(url ?? fallbackUrl ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [messageId, fallbackUrl])

  return resolved
}
