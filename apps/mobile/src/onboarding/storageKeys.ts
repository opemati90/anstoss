/**
 * AsyncStorage keys shared by AuthContext and the onboarding flow.
 *
 * They live in a leaf module so AuthContext and OnboardingFlowContext can both
 * import them without importing each other (the old
 * OnboardingFlowContext -> AuthContext -> OnboardingFlowContext require cycle).
 */

/** Locally persisted onboarding draft (club-setup fields, last step). */
export const ONBOARDING_FLOW_STORAGE_KEY = '@anstoss/onboarding-state-v1'

/** Per user + club role-mode preference: `${prefix}${userId}:${clubId}`. */
export const ROLE_MODE_PREF_PREFIX = 'anstoss:role-mode-pref:v2:'

/** Per club active-team preference. */
export const TEAM_PREF_PREFIX = 'anstoss:team-pref:'

/** Legacy "onboarding finished" flag per user id (kept for needsOnboarding). */
export const ONBOARDING_KEY_PREFIX = 'anstoss:onboarding-complete:'

/**
 * One-shot "you're in" notice for home, set when onboarding ends
 * (invite redeemed, join request approved, club claim submitted).
 * Value: JSON { kind, clubName }.
 */
export const ONBOARDING_WELCOME_NOTICE_PREFIX = 'anstoss:onboarding-welcome:'

export function roleModePreferenceKey(userId: string, clubId: string): string {
  return `${ROLE_MODE_PREF_PREFIX}${userId}:${clubId}`
}

/** M2: a declined join request is explained once: `${prefix}${requestId}`. */
export const JOIN_REJECTION_SEEN_PREFIX = 'anstoss:join-rejection-seen:'
