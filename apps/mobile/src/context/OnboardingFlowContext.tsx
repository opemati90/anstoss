import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { RegistrationRole } from '@anstoss/shared'

export type OnboardingFlowState = {
  phone?: string
  firstName?: string
  dateOfBirth?: string
  role?: RegistrationRole
  teamId?: string
  clubId?: string
  clubName?: string
  clubBadgeUrl?: string | null
  rosterSlotId?: string
}

type OnboardingFlowContextValue = {
  state: OnboardingFlowState
  update: (patch: Partial<OnboardingFlowState>) => void
  reset: () => void
}

const Ctx = createContext<OnboardingFlowContextValue | null>(null)

export function OnboardingFlowProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OnboardingFlowState>({})
  const update = useCallback((patch: Partial<OnboardingFlowState>) => {
    setState((s) => ({ ...s, ...patch }))
  }, [])
  const reset = useCallback(() => setState({}), [])
  const value = useMemo(() => ({ state, update, reset }), [state, update, reset])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useOnboardingFlow() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useOnboardingFlow must be used inside OnboardingFlowProvider')
  return v
}
