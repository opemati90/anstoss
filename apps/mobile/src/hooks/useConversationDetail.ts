import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatChannelDetail, ChatConversationDetail, InboxItem } from '@anstoss/shared'
import { fetchChannelDetail, fetchConversationDetail } from '../api/chat'
import { ApiError } from '../api/client'
import { useAuth } from '../context/AuthContext'
import type { ConversationKind } from '../components/chat/inboxModel'
import { useInboxSnapshot } from './useInbox'
import { subscribeAccessChanges } from '../auth/accessChanges'

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
  const { activeClub, user, token } = useAuth()
  const clubId = activeClub?.club.id ?? null
  const inbox = useInboxSnapshot()
  const seed = inbox.items.find((item) => item.id === id) ?? null
  const key = JSON.stringify([clubId, id, kind, user?.id, token])
  const sequence = useRef(0)
  const scopeRef = useRef({ key })
  const maskSeed = useRef(false)
  if (scopeRef.current.key !== key) {
    scopeRef.current = { key }
    sequence.current += 1
    maskSeed.current = true
  }
  const scope = scopeRef.current
  const [valueScope, setValueScope] = useState(scope)
  const [status, setStatus] = useState<ConversationDetailState['status']>('loading')
  const [channel, setChannel] = useState<ChatChannelDetail | null>(null)
  const [dm, setDm] = useState<ChatConversationDetail | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => subscribeAccessChanges(() => {
    // Invalidate synchronously: an older promise can settle before React runs
    // the next effect cleanup after this access-change notification.
    sequence.current += 1
    maskSeed.current = true
    setChannel(null)
    setDm(null)
    setStatus('loading')
    setNonce(n => n + 1)
  }), [])

  useEffect(() => {
    const requestSequence = ++sequence.current
    if (!clubId || !id || !user?.id || !token) {
      setChannel(null)
      setDm(null)
      setStatus('error')
      return
    }
    let cancelled = false
    const current = () => !cancelled && scopeRef.current === scope && sequence.current === requestSequence
    if (maskSeed.current) { setChannel(null); setDm(null) }
    setValueScope(scope)
    setStatus((prev) => (!maskSeed.current && prev === 'ready' ? prev : 'loading'))
    const request =
      kind === 'dm'
        ? fetchConversationDetail(clubId, id).then((data) => {
            if (current()) setDm(data)
          })
        : fetchChannelDetail(clubId, id).then((data) => {
            if (current()) setChannel(data)
          })
    request
      .then(() => {
        if (current()) { maskSeed.current = false; setStatus('ready') }
      })
      .catch((err) => {
        if (!current()) return
        if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
          maskSeed.current = true
          setChannel(null)
          setDm(null)
        }
        setStatus(err instanceof ApiError && (err.status === 403 || err.status === 404) ? 'forbidden' : 'error')
      })
    return () => {
      cancelled = true
    }
  }, [clubId, id, kind, nonce, user?.id, token, scope])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  const patchSequence = sequence.current
  const patch = useCallback(
    (next: Partial<ChatChannelDetail & ChatConversationDetail>) => {
      if (scopeRef.current !== scope || maskSeed.current || patchSequence !== sequence.current) return
      if (kind === 'dm') setDm((prev) => (prev ? { ...prev, ...next } : prev))
      else setChannel((prev) => (prev ? { ...prev, ...next } : prev))
    },
    [kind, scope, patchSequence],
  )

  const visible = valueScope === scope && !!user?.id && !!token
  return { status: visible ? status : 'loading', channel: visible ? channel : null,
    dm: visible ? dm : null, seed: visible && !maskSeed.current ? seed : null, reload, patch }
}
