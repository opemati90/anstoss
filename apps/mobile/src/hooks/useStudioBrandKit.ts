import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  studioBrandKitSchema,
  updateStudioBrandKitSchema,
  type StudioBrandKit,
  type UpdateStudioBrandKitInput,
} from '@anstoss/shared'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { canManageStudioBrandKit, canUseStudio } from '../studio/access'

class StudioBrandKitResponseError extends Error {
  constructor() {
    super('Studio brand kit does not match the request')
    this.name = 'StudioBrandKitResponseError'
  }
}

function confirmedKit(raw: unknown, clubId: string): StudioBrandKit {
  const kit = studioBrandKitSchema.parse(raw)
  if (kit.clubId !== clubId) throw new StudioBrandKitResponseError()
  return kit
}

function confirmsPatch(kit: StudioBrandKit, patch: UpdateStudioBrandKitInput): boolean {
  return Object.entries(patch).every(([key, value]) => {
    const stored =
      key === 'sponsors'
        ? kit.sponsors.map(({ id, name }) => ({ id, name }))
        : kit[key as keyof UpdateStudioBrandKitInput]
    return JSON.stringify(stored) === JSON.stringify(value)
  })
}

/**
 * Only server-confirmed settings are exposed. The in-memory SWR snapshot belongs
 * to one mounted authenticated scope, never a module-wide club-only cache.
 * Callers must require `ready` before export and check the boolean save result.
 */
export function useStudioBrandKit() {
  const { user, token, activeClub, activeTeamId, activeTeamAccess } = useAuth()
  const clubId = activeClub?.club.id ?? null
  const teamId = activeTeamId ?? activeTeamAccess?.team.id ?? null
  const teamAccess =
    activeTeamAccess?.status === 'ACTIVE' &&
    activeTeamAccess.team.clubId === clubId &&
    activeTeamAccess.team.id === teamId
      ? activeTeamAccess
      : null
  const allowed = Boolean(user && token && clubId && canUseStudio(activeClub, teamAccess))
  const canManage = allowed && canManageStudioBrandKit(activeClub)
  const permissions = JSON.stringify([
    activeClub?.role,
    activeClub?.operationalRoles,
    activeClub?.permissions,
    teamAccess,
  ])
  const scope = useMemo(
    () => ({ clubId, teamId, userId: user?.id, token, allowed, canManage, permissions }),
    [clubId, teamId, user?.id, token, allowed, canManage, permissions],
  )
  type Snapshot = {
    scope: typeof scope
    kit: StudioBrandKit | null
    loading: boolean
    saving: boolean
    error: boolean
    ready: boolean
  }
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const latest = useRef(snapshot)
  latest.current = snapshot
  const currentScope = useRef(scope)
  currentScope.current = scope
  const mounted = useRef(false)
  const sequence = useRef(0)
  const pendingSave = useRef<typeof scope | null>(null)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      sequence.current += 1
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!mounted.current || currentScope.current !== scope || pendingSave.current === scope) return
    const ticket = ++sequence.current
    if (!scope.allowed || !scope.clubId) {
      setSnapshot(null)
      return
    }
    const isCurrent = () =>
      mounted.current && currentScope.current === scope && ticket === sequence.current
    const previous = latest.current?.scope === scope ? latest.current.kit : null
    setSnapshot({ scope, kit: previous, loading: true, saving: false, error: false, ready: false })
    try {
      const kit = confirmedKit(
        await api<unknown>(`/clubs/${encodeURIComponent(scope.clubId)}/studio/brand-kit`),
        scope.clubId,
      )
      if (isCurrent())
        setSnapshot({ scope, kit, loading: false, saving: false, error: false, ready: true })
    } catch {
      // In particular, never retain usable settings after server-side revocation.
      if (isCurrent())
        setSnapshot({ scope, kit: null, loading: false, saving: false, error: true, ready: false })
    }
  }, [scope])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const save = useCallback(
    async (raw: UpdateStudioBrandKitInput): Promise<boolean> => {
      const previous = latest.current
      if (
        !mounted.current ||
        currentScope.current !== scope ||
        !scope.canManage ||
        !scope.clubId ||
        pendingSave.current === scope ||
        previous?.scope !== scope ||
        !previous.ready
      )
        return false
      const parsed = updateStudioBrandKitSchema.safeParse(raw)
      if (!parsed.success || Object.keys(parsed.data).length === 0) return false
      pendingSave.current = scope
      const ticket = ++sequence.current
      const isCurrent = () =>
        mounted.current && currentScope.current === scope && ticket === sequence.current
      setSnapshot({ ...previous, saving: true, ready: false, error: false })
      try {
        const kit = confirmedKit(
          await api<unknown>(`/clubs/${encodeURIComponent(scope.clubId)}/studio/brand-kit`, {
            method: 'PUT',
            body: parsed.data,
          }),
          scope.clubId,
        )
        if (!confirmsPatch(kit, parsed.data)) throw new StudioBrandKitResponseError()
        if (!isCurrent()) return false
        setSnapshot({ scope, kit, loading: false, saving: false, error: false, ready: true })
        return true
      } catch {
        if (isCurrent())
          setSnapshot({
            scope,
            kit: null,
            loading: false,
            saving: false,
            error: true,
            ready: false,
          })
        return false
      } finally {
        if (pendingSave.current === scope) pendingSave.current = null
      }
    },
    [scope],
  )

  const visible = allowed && snapshot?.scope === scope ? snapshot : null
  return {
    kit: visible?.kit ?? null,
    loading: allowed && (!visible || visible.loading),
    saving: visible?.saving ?? false,
    ready: visible?.ready ?? false,
    error: visible?.error ?? false,
    canEdit: canManage && Boolean(visible?.ready),
    refresh,
    save,
  }
}
