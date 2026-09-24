import { useEffect, useState } from 'react'
import { api } from '../api/client'

/**
 * Fresh signed-GET URL for a chat attachment, channel or DM. The stored
 * attachmentUrl is never the canonical read path: the API re-verifies the
 * reader (channel read access, or DM participant with current club
 * membership) and mints a 1h URL. Cached per endpoint for 50 minutes.
 * Falls back to the stored URL when the endpoint returns null (R2 not
 * configured in dev); a 403 resolves to null so revoked access never shows
 * the old object.
 */
type CacheEntry = { url: string | null; expiresAt: number }
const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<string | null | 'forbidden'>>()
const CACHE_TTL_MS = 50 * 60 * 1000

export function __resetSignedChatMediaUrlCache() {
  cache.clear()
  inflight.clear()
}

/** Endpoint for a message's signed URL. DMs pass their conversation. */
export function chatMediaEndpoint(
  messageId: string,
  dm?: { clubId: string; conversationId: string } | null,
): string {
  return dm
    ? `/clubs/${dm.clubId}/conversations/${dm.conversationId}/messages/${messageId}/media-url`
    : `/messages/${messageId}/media-url`
}

function resolve(endpoint: string): Promise<string | null | 'forbidden'> {
  const existing = inflight.get(endpoint)
  if (existing) return existing
  const request = api<{ url: string | null }>(endpoint)
    .then((res) => res?.url ?? null)
    .catch((err: { status?: number }) => (err?.status === 403 ? ('forbidden' as const) : null))
    .then((url) => {
      if (url !== 'forbidden') cache.set(endpoint, { url, expiresAt: Date.now() + CACHE_TTL_MS })
      inflight.delete(endpoint)
      return url
    })
  inflight.set(endpoint, request)
  return request
}

export function useSignedChatMediaUrl(
  messageId: string | undefined,
  fallbackUrl: string | null | undefined,
  dm?: { clubId: string; conversationId: string } | null,
): string | null {
  const endpoint = messageId ? chatMediaEndpoint(messageId, dm) : null
  const [resolved, setResolved] = useState<string | null>(() => {
    if (endpoint) {
      const cached = cache.get(endpoint)
      if (cached && cached.expiresAt > Date.now()) return cached.url ?? fallbackUrl ?? null
    }
    return fallbackUrl ?? null
  })

  useEffect(() => {
    const local =
      !messageId || messageId.startsWith('pending:') || messageId.startsWith('e2e-')
    if (!endpoint || !fallbackUrl || local) {
      setResolved(fallbackUrl ?? null)
      return
    }
    const cached = cache.get(endpoint)
    if (cached && cached.expiresAt > Date.now()) {
      setResolved(cached.url ?? fallbackUrl)
      return
    }
    let cancelled = false
    void resolve(endpoint).then((url) => {
      if (cancelled) return
      setResolved(url === 'forbidden' ? null : (url ?? fallbackUrl))
    })
    return () => {
      cancelled = true
    }
  }, [endpoint, fallbackUrl, messageId])

  return resolved
}
