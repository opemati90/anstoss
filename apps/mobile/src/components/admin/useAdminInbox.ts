import { useCallback, useEffect, useRef, useState } from 'react'
import type { AdminInbox } from '@anstoss/shared'
import { api } from '../../api/client'

export type AdminInboxState = {
  inbox: AdminInbox | null
  status: 'loading' | 'ready' | 'error'
  refreshing: boolean
  reload: () => Promise<void>
  refresh: () => Promise<void>
}

/**
 * GET /clubs/:clubId/admin-inbox — the single source for the admin's open
 * tasks and the club headline counts (members, teams). Never leaves a
 * skeleton stuck: every request settles to `ready` or `error`.
 */
export function useAdminInbox(clubId: string | null | undefined): AdminInboxState {
  const [inbox, setInbox] = useState<AdminInbox | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [refreshing, setRefreshing] = useState(false)
  const requestRef = useRef(0)

  const reload = useCallback(async () => {
    if (!clubId) {
      setInbox(null)
      setStatus('error')
      return
    }
    const requestId = ++requestRef.current
    try {
      const data = await api<AdminInbox>(`/clubs/${clubId}/admin-inbox`)
      if (requestId !== requestRef.current) return
      if (!data || typeof data !== 'object' || !('totalOpen' in data)) {
        setStatus('error')
        return
      }
      setInbox(data)
      setStatus('ready')
    } catch {
      if (requestId !== requestRef.current) return
      setStatus((current) => (current === 'ready' ? 'ready' : 'error'))
    }
  }, [clubId])

  useEffect(() => {
    setStatus('loading')
    setInbox(null)
    void reload()
  }, [reload])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await reload()
    } finally {
      setRefreshing(false)
    }
  }, [reload])

  return { inbox, status, refreshing, reload, refresh }
}
