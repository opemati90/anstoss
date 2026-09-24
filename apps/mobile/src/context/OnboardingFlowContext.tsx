import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { TeamRole } from '@anstoss/shared'
import { useAuth } from './AuthContext'
import { ONBOARDING_FLOW_STORAGE_KEY } from '../onboarding/storageKeys'

// Re-exported for callers that imported the key from here before it moved to
// the leaf module (the move broke the AuthContext <-> flow require cycle).
export { ONBOARDING_FLOW_STORAGE_KEY }

/**
 * Locally persisted onboarding draft. Only the club-setup form is long enough
 * to be worth restoring after a cold start; every other step is one question
 * and reads its truth from the server (/me).
 */
export type OnboardingFlowState = {
  /** Backend user id that owns this draft. Drafts owned by someone else are
   * dropped so a shared device never shows the previous user's details. */
  ownerUserId?: string
  /** Club setup (admin): directory entry the club was picked from. */
  directoryEntryId?: string
  clubName?: string
  teamName?: string
  teamGroupType?: 'SENIOR' | 'YOUTH'
  officialTeamUrl?: string
  clubPrimaryColor?: string
  adminTeamRoles?: TeamRole[]
  /** Path of the last onboarding step, for cold-start resume. */
  lastStep?: string
}

type OnboardingFlowContextValue = {
  state: OnboardingFlowState
  /** True until AsyncStorage has been read on first mount. */
  hydrating: boolean
  update: (patch: Partial<OnboardingFlowState>) => void
  /** Record the current screen so a cold start can resume here. */
  markStep: (path: string) => void
  reset: () => void
}

const Ctx = createContext<OnboardingFlowContextValue | null>(null)

export function OnboardingFlowProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const ownerUserId = user?.id ?? null
  const [state, setState] = useState<OnboardingFlowState>({})
  const [hydrating, setHydrating] = useState(true)
  const persistVersion = useRef(0)

  useEffect(() => {
    let cancelled = false
    AsyncStorage.getItem(ONBOARDING_FLOW_STORAGE_KEY)
      .then((raw) => {
        if (cancelled || !raw) return
        try {
          const parsed = JSON.parse(raw) as OnboardingFlowState
          if (parsed && typeof parsed === 'object') setState(parsed)
        } catch {
          // Malformed draft: ignore it.
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setHydrating(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // A draft owned by another account never survives a user switch.
  useEffect(() => {
    if (!ownerUserId) return
    setState((current) => {
      if (Object.keys(current).length === 0) return current
      if (current.ownerUserId === ownerUserId) return current
      return {}
    })
  }, [ownerUserId])

  // Versioned microtask writes stop an older queued write from resurrecting
  // state after reset().
  useEffect(() => {
    if (hydrating) return
    const snapshot = state
    const version = ++persistVersion.current
    queueMicrotask(() => {
      if (version !== persistVersion.current) return
      if (Object.keys(snapshot).length === 0) {
        AsyncStorage.removeItem(ONBOARDING_FLOW_STORAGE_KEY).catch(() => {})
        return
      }
      AsyncStorage.setItem(ONBOARDING_FLOW_STORAGE_KEY, JSON.stringify(snapshot)).catch(() => {})
    })
  }, [state, hydrating])

  const update = useCallback(
    (patch: Partial<OnboardingFlowState>) => {
      setState((s) => ({ ...s, ...(ownerUserId ? { ownerUserId } : {}), ...patch }))
    },
    [ownerUserId],
  )

  const markStep = useCallback(
    (path: string) => {
      setState((s) => {
        if (s.lastStep === path && (!ownerUserId || s.ownerUserId === ownerUserId)) return s
        return { ...s, ...(ownerUserId ? { ownerUserId } : {}), lastStep: path }
      })
    },
    [ownerUserId],
  )

  const reset = useCallback(() => {
    persistVersion.current += 1
    setState({})
    AsyncStorage.removeItem(ONBOARDING_FLOW_STORAGE_KEY).catch(() => {})
  }, [])

  const value = useMemo(
    () => ({ state, hydrating, update, markStep, reset }),
    [state, hydrating, update, markStep, reset],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useOnboardingFlow() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useOnboardingFlow must be used inside OnboardingFlowProvider')
  return v
}
