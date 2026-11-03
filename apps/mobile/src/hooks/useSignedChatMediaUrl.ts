import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'

/**
 * Fresh signed-GET URL for a chat attachment, channel or DM. The stored
 * attachmentUrl is never the canonical read path: the API re-verifies the
 * reader (channel read access, or DM participant with current club
 * membership) and mints a short-lived URL. Persisted remote references are
 * never used as a fallback when authorization or signing fails.
 */
const CACHE_TTL_MS = 4 * 60 * 1000

export function __resetSignedChatMediaUrlCache() { /* No shared capability cache. */ }

/** Endpoint for a message's signed URL. DMs pass their conversation. */
export function chatMediaEndpoint(
  messageId: string,
  dm?: { clubId: string; conversationId: string } | null,
): string {
  return dm
    ? `/clubs/${dm.clubId}/conversations/${dm.conversationId}/messages/${messageId}/media-url`
    : `/messages/${messageId}/media-url`
}

export function useSignedChatMediaUrl(
  messageId: string | undefined,
  fallbackUrl: string | null | undefined,
  dm?: { clubId: string; conversationId: string } | null,
): string | null {
  const { user } = useAuth()
  const actorId = user?.id
  const endpoint = messageId ? chatMediaEndpoint(messageId, dm) : null
  const local = !messageId || messageId.startsWith('pending:') || (__DEV__ && messageId.startsWith('e2e-'))
  const safeFallback = local && fallbackUrl && (/^(file|content):\/\//.test(fallbackUrl) || (__DEV__ && messageId?.startsWith('e2e-'))) ? fallbackUrl : null
  const scope = `${actorId ?? ''}:${endpoint ?? ''}:${fallbackUrl ?? ''}`
  const [resolved, setResolved] = useState<{ scope: string; url: string | null }>({ scope, url: safeFallback })

  useEffect(() => {
    if (!endpoint || !fallbackUrl || local || !actorId) {
      setResolved({ scope, url: safeFallback })
      return
    }
    let cancelled = false
    let revision = 0
    let retryCount = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      const current = ++revision
      if (timer) clearTimeout(timer)
      setResolved({ scope, url: null })
      void api<{ url: string | null }>(endpoint, { headers: { 'x-expected-actor-id': actorId } }).then((result) => {
        if (!cancelled && current === revision) {
          retryCount = 0
          setResolved({ scope, url: result?.url ?? null })
          timer = setTimeout(refresh, CACHE_TTL_MS)
        }
      }).catch((error: { status?: number }) => {
        if (!cancelled && current === revision) {
          setResolved({ scope, url: null })
          const status = error?.status
          const retryable = status == null || status === 0 || status === 408 || status === 429 || status >= 500
          if (retryable && retryCount < 3) {
            const delay = 30_000 * 2 ** retryCount++
            timer = setTimeout(refresh, delay)
          }
        }
      })
    }
    refresh()
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') { retryCount = 0; refresh() }
    })
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      subscription.remove()
    }
  }, [actorId, endpoint, fallbackUrl, local, safeFallback, scope])

  return resolved.scope === scope ? resolved.url : safeFallback
}
