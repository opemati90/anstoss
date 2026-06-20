/**
 * Single source of truth for the onboarding progress indicator.
 *
 * The full bar sequence is the club-admin path (the only branch where every
 * step shows a progress bar):
 *   1 phone → 2 about → 3 role → 4 club-create → 5 club-identity
 *
 * Other role branches (team-code, free-agent-profile) reuse steps 1–3 and
 * then finish on screens without a bar, so the numbers a user sees always
 * advance monotonically and never contradict each other across screens.
 *
 * Before this existed, every screen hard-coded its own {current,total}
 * (1/4, 3/5, 4/6, 4/5, 5/6, 6/6) and the indicator visibly lied.
 */
export const ONBOARDING_TOTAL = 5

export const ONBOARDING_STEP = {
  phone: 1,
  about: 2,
  role: 3,
  clubCreate: 4,
  clubIdentity: 5,
} as const

export type OnboardingStepKey = keyof typeof ONBOARDING_STEP

/** Convenience for callers that pass the whole `step` prop to WizardStep. */
export function onboardingStep(key: OnboardingStepKey): {
  current: number
  total: number
} {
  return { current: ONBOARDING_STEP[key], total: ONBOARDING_TOTAL }
}
