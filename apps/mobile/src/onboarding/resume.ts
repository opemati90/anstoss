import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useState } from 'react'
import { RegistrationRole } from '@anstoss/shared'
import {
  ONBOARDING_FLOW_STORAGE_KEY,
  type OnboardingFlowState,
} from '../context/OnboardingFlowContext'

const RESUMABLE_AUTH_STEPS = new Set([
  '/(auth)/about',
  '/(auth)/role',
  '/(auth)/team-code',
  '/(auth)/club-search',
  '/(auth)/club-create',
  '/(auth)/club-identity',
  '/(auth)/roster-build',
  '/(auth)/roster-claim',
  '/(auth)/parent-handoff',
  '/(auth)/done',
])

function parseState(raw: string | null): OnboardingFlowState | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object'
      ? (parsed as OnboardingFlowState)
      : null
  } catch {
    return null
  }
}

export function resolveOnboardingResumeTarget(
  state: OnboardingFlowState | null,
  ownerUserId: string | null | undefined,
): string | null {
  if (!state) return null
  if (Object.keys(state).length === 0) return null
  if (!ownerUserId || state.ownerUserId !== ownerUserId) return null
  if (state.lastStep && RESUMABLE_AUTH_STEPS.has(state.lastStep)) {
    return state.lastStep
  }
  if (state.role === RegistrationRole.PARENT) {
    return '/(auth)/parent-handoff'
  }
  if (
    state.role === RegistrationRole.PLAYER ||
    state.role === RegistrationRole.COACH
  ) {
    return '/(auth)/team-code'
  }
  if (state.role === RegistrationRole.CLUB_ADMIN) {
    return '/(auth)/club-create'
  }
  if (state.dateOfBirth || state.firstName) {
    return '/(auth)/role'
  }
  return '/(auth)/about'
}

export function shouldDiscardOnboardingResumeState(
  state: OnboardingFlowState | null,
  ownerUserId: string | null | undefined,
): boolean {
  if (!state) return false
  if (Object.keys(state).length === 0) return false
  return !!ownerUserId && state.ownerUserId !== ownerUserId
}

/**
 * Returns undefined while loading, then a whitelisted resume route or null.
 */
export function useOnboardingResumeTarget(
  enabled: boolean,
  ownerUserId?: string | null,
): string | null | undefined {
  const [target, setTarget] = useState<string | null | undefined>(
    enabled ? undefined : null,
  )

  useEffect(() => {
    let alive = true
    if (!enabled) {
      setTarget(null)
      return () => {
        alive = false
      }
    }

    setTarget(undefined)
    void AsyncStorage.getItem(ONBOARDING_FLOW_STORAGE_KEY)
      .then((raw) => {
        if (alive) {
          const parsed = parseState(raw)
          if (shouldDiscardOnboardingResumeState(parsed, ownerUserId)) {
            void AsyncStorage.removeItem(ONBOARDING_FLOW_STORAGE_KEY).catch(() => {
              // tolerated
            })
          }
          setTarget(resolveOnboardingResumeTarget(parsed, ownerUserId))
        }
      })
      .catch(() => {
        if (alive) setTarget('/(auth)/about')
      })
    return () => {
      alive = false
    }
  }, [enabled, ownerUserId])

  return target
}
