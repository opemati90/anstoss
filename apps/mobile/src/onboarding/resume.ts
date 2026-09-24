import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useState } from 'react'
import type { OnboardingFlowState } from '../context/OnboardingFlowContext'
import { ONBOARDING_FLOW_STORAGE_KEY } from './storageKeys'

/**
 * The only onboarding screen worth resuming from a local draft is the club
 * setup form (several fields). Every other step derives its position from the
 * server (/me): name set or not, request pending or not. A draft that points
 * anywhere else, including screens that no longer exist (about, role,
 * team-code, roster-build, roster-claim, done), is discarded.
 */
export const RESUMABLE_ONBOARDING_STEPS: ReadonlySet<string> = new Set(['/(auth)/club-setup'])

function parseState(raw: string | null): OnboardingFlowState | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as OnboardingFlowState) : null
  } catch {
    return null
  }
}

export function resolveOnboardingResumeTarget(
  state: OnboardingFlowState | null,
  ownerUserId: string | null | undefined,
): string | null {
  if (!state || Object.keys(state).length === 0) return null
  if (!ownerUserId || state.ownerUserId !== ownerUserId) return null
  if (state.lastStep && RESUMABLE_ONBOARDING_STEPS.has(state.lastStep)) return state.lastStep
  return null
}

/** True when the stored draft must be deleted: foreign owner or dead step. */
export function shouldDiscardOnboardingResumeState(
  state: OnboardingFlowState | null,
  ownerUserId: string | null | undefined,
): boolean {
  if (!state || Object.keys(state).length === 0) return false
  if (ownerUserId && state.ownerUserId !== ownerUserId) return true
  return !!state.lastStep && !RESUMABLE_ONBOARDING_STEPS.has(state.lastStep)
}

/**
 * Returns undefined while loading, then a whitelisted resume route or null.
 * The answer is keyed to (enabled, owner) so the render in which the user
 * finishes loading never sees the previous render's answer.
 */
export function useOnboardingResumeTarget(
  enabled: boolean,
  ownerUserId?: string | null,
): string | null | undefined {
  const key = `${enabled ? 1 : 0}:${ownerUserId ?? ''}`
  const [loaded, setLoaded] = useState<{ key: string; target: string | null } | null>(null)

  useEffect(() => {
    let alive = true
    if (!enabled) {
      setLoaded({ key, target: null })
      return () => {
        alive = false
      }
    }
    void AsyncStorage.getItem(ONBOARDING_FLOW_STORAGE_KEY)
      .then((raw) => {
        if (!alive) return
        const parsed = parseState(raw)
        if (shouldDiscardOnboardingResumeState(parsed, ownerUserId)) {
          void AsyncStorage.removeItem(ONBOARDING_FLOW_STORAGE_KEY).catch(() => {})
          setLoaded({ key, target: null })
          return
        }
        setLoaded({ key, target: resolveOnboardingResumeTarget(parsed, ownerUserId) })
      })
      .catch(() => {
        if (alive) setLoaded({ key, target: null })
      })
    return () => {
      alive = false
    }
  }, [enabled, key, ownerUserId])

  if (!enabled) return null
  return loaded?.key === key ? loaded.target : undefined
}
