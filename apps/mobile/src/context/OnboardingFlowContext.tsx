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
import { useAuth as useClerkAuth } from '@clerk/clerk-expo'
import type { RegistrationRole } from '@anstoss/shared'

export const ONBOARDING_FLOW_STORAGE_KEY = '@anstoss/onboarding-state-v1'

export type OnboardingFlowState = {
  /** Clerk user id that owns this locally persisted draft. State without an
   * owner is ignored for signed-in resume so shared devices cannot leak a
   * previous user's abandoned onboarding details. */
  ownerClerkId?: string
  phone?: string
  /** Email address chosen during signup if the user picked email instead
   * of phone OTP. Only one of phone/email is set per session. */
  email?: string
  firstName?: string
  dateOfBirth?: string
  role?: RegistrationRole
  teamId?: string
  clubId?: string
  clubName?: string
  /** Primary brand color picked during club setup. Used by clubs/setup. */
  clubPrimaryColor?: string
  /** Local file URI of the picked logo before upload. */
  clubLogoUri?: string | null
  /** Remote URL after upload (set post-finalize). */
  clubBadgeUrl?: string | null
  /** Team name collected during club setup. Persisted until /clubs/setup. */
  teamName?: string
  /** Roster names captured during onboarding, posted after finalize. */
  rosterNames?: string[]
  /** True once the user accepted Privacy + Terms on welcome. Required to
   * leave the welcome step. */
  policyAccepted?: boolean
  rosterSlotId?: string
  /** Raw join code the user entered on the team-code screen. Persisted
   * so done.tsx can call /onboarding/join-team after the Clerk session
   * is finalized — without this, COACH/PARENT/PLAYER flows (and PLAYER
   * paths that skip roster-claim) finish onboarding with no Membership
   * row, so home/agenda/chat 401. */
  teamJoinCode?: string
  /** When the admin picked their club from fussball.de autocomplete,
   * we keep the externalClubId so the post-finalize hook can fetch
   * teams + auto-link the first team without making the admin paste a
   * URL. Empty string / undefined = manual flow, no link. */
  fussballExternalClubId?: string
  fussballClubLogoUrl?: string
  fussballClubCity?: string
  /** Path of the last step the user was on. Used to resume after a
   * cold-start. Set explicitly via `markStep`; never written
   * automatically (keeps the state shape deterministic). */
  lastStep?: string
}

type OnboardingFlowContextValue = {
  state: OnboardingFlowState
  /** True until AsyncStorage has been read on first mount. Consumers
   * should hold off on routing decisions while this is true. */
  hydrating: boolean
  update: (patch: Partial<OnboardingFlowState>) => void
  /** Record the path of the current screen so we can resume here on
   * cold-start. Call this from each step's mount effect. */
  markStep: (path: string) => void
  reset: () => void
}

const Ctx = createContext<OnboardingFlowContextValue | null>(null)

export function OnboardingFlowProvider({ children }: { children: ReactNode }) {
  const { userId: clerkUserId } = useClerkAuth()
  const [state, setState] = useState<OnboardingFlowState>({})
  const [hydrating, setHydrating] = useState(true)
  const persistVersion = useRef(0)

  // Hydrate once on mount.
  useEffect(() => {
    let cancelled = false
    AsyncStorage.getItem(ONBOARDING_FLOW_STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as OnboardingFlowState
            // Drop expired or malformed shapes — ignore parse errors.
            if (parsed && typeof parsed === 'object') {
              setState(parsed)
            }
          } catch {
            // tolerated
          }
        }
      })
      .catch(() => {
        // tolerated — first launch may have nothing
      })
      .finally(() => {
        if (!cancelled) setHydrating(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!clerkUserId) return
    setState((current) => {
      if (Object.keys(current).length === 0) return current
      if (current.ownerClerkId === clerkUserId) return current
      return {}
    })
  }, [clerkUserId])

  // Persist on every change. Versioned microtask writes prevent an older
  // queued write from resurrecting stale state after reset().
  useEffect(() => {
    if (hydrating) return
    const snapshot = state
    const version = ++persistVersion.current
    queueMicrotask(() => {
      if (version !== persistVersion.current) return
      if (Object.keys(snapshot).length === 0) {
        AsyncStorage.removeItem(ONBOARDING_FLOW_STORAGE_KEY).catch(() => {
          // tolerated
        })
        return
      }
      AsyncStorage.setItem(ONBOARDING_FLOW_STORAGE_KEY, JSON.stringify(snapshot)).catch(() => {
        // tolerated
      })
    })
  }, [state, hydrating])

  const update = useCallback((patch: Partial<OnboardingFlowState>) => {
    setState((s) => ({
      ...s,
      ...(clerkUserId ? { ownerClerkId: clerkUserId } : {}),
      ...patch,
    }))
  }, [clerkUserId])

  const markStep = useCallback((path: string) => {
    setState((s) => {
      const ownerPatch = clerkUserId ? { ownerClerkId: clerkUserId } : {}
      if (s.lastStep === path && (!clerkUserId || s.ownerClerkId === clerkUserId)) {
        return s
      }
      return { ...s, ...ownerPatch, lastStep: path }
    })
  }, [clerkUserId])

  const reset = useCallback(() => {
    persistVersion.current += 1
    setState({})
    AsyncStorage.removeItem(ONBOARDING_FLOW_STORAGE_KEY).catch(() => {
      // tolerated
    })
  }, [])

  const value = useMemo(
    () => ({ state, hydrating, update, markStep, reset }),
    [state, hydrating, update, markStep, reset],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useOnboardingFlow() {
  const v = useContext(Ctx)
  if (!v)
    throw new Error('useOnboardingFlow must be used inside OnboardingFlowProvider')
  return v
}
