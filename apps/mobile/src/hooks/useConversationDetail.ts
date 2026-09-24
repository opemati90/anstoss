import { useCallback, useEffect, useState } from 'react'
import type { ChatChannelDetail, ChatConversationDetail, InboxItem } from '@anstoss/shared'
import { fetchChannelDetail, fetchConversationDetail } from '../api/chat'
import { ApiError } from '../api/client'
import { useAuth } from '../context/AuthContext'
import type { ConversationKind } from '../components/chat/inboxModel'
import { useInboxSnapshot } from './useInbox'

export type ConversationDetailState = {
  status: 'loading' | 'ready' | 'error' | 'forbidden'
  channel: ChatChannelDetail | null
  dm: ChatConversationDetail | null
  /** The inbox row, available instantly when arriving from the inbox. */
  seed: InboxItem | null
  reload: () => void
  /** Local patch after a mute toggle etc. */
  patch: (next: Partial<ChatChannelDetail & ChatConversationDetail>) => void
}

/** Channel or DM metadata for the conversation header and info screen. */
export function useConversationDetail(kind: ConversationKind, id: string): ConversationDetailState {
  const { activeClub } = useAuth()
  const clubId = activeClub?.club.id ?? null
  const inbox = useInboxSnapshot()
  const seed = inbox.items.find((item) => item.id === id) ?? null
  const [status, setStatus] = useState<ConversationDetailState['status']>('loading')
  const [channel, setChannel] = useState<ChatChannelDetail | null>(null)
  const [dm, setDm] = useState<ChatConversationDetail | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!clubId || !id) {
      setStatus('error')
      return
    }
    let cancelled = false
    setStatus((prev) => (prev === 'ready' ? prev : 'loading'))
    const request =
      kind === 'dm'
        ? fetchConversationDetail(clubId, id).then((data) => {
            if (!cancelled) setDm(data)
          })
        : fetchChannelDetail(clubId, id).then((data) => {
            if (!cancelled) setChannel(data)
          })
    request
      .then(() => {
        if (!cancelled) setStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setStatus(err instanceof ApiError && (err.status === 403 || err.status === 404) ? 'forbidden' : 'error')
      })
    return () => {
      cancelled = true
    }
  }, [clubId, id, kind, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  const patch = useCallback(
    (next: Partial<ChatChannelDetail & ChatConversationDetail>) => {
      if (kind === 'dm') setDm((prev) => (prev ? { ...prev, ...next } : prev))
      else setChannel((prev) => (prev ? { ...prev, ...next } : prev))
    },
    [kind],
  )

  return { status, channel, dm, seed, reload, patch }
}
