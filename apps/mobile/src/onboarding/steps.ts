/**
 * The onboarding paths, screen by screen, and the progress bar derived from
 * them. Every distinct titled view counts as a screen (email and code are two).
 * The paths are checked against the real router in paths.spec.ts, which walks
 * each persona through resolveSignedInRoute and the screens' own navigation
 * and asserts both the count and the caps below.
 *
 *   member     welcome → code → Wie heißt du? → Verein finden (sends)   = 4
 *   admin      welcome → code → Wie heißt du? → Verein finden → Verein  = 5
 *   adminDirect welcome (Verein anlegen) → code → Wie heißt du? → Verein = 4
 *   freeAgent  welcome → code → Wie heißt du? → Spielerprofil           = 4
 *              (from Verein finden the listing is sent inline there     = 4)
 *   guardian   welcome → code → Wie heißt du? → Zu deinem Verein → Kind  = 5
 *              (the setup-code row moved from welcome to Zu deinem Verein)
 *   invite     Einladung + E-Mail → code → Beitreten                     = 3
 *
 * The admin screen is only added once the user chooses to set up a club, so
 * the first four screens read "x of 4" for everyone until the path forks.
 */
export type OnboardingScreenKey =
  | 'welcome'
  | 'code'
  | 'profile'
  | 'clubSearch'
  | 'clubSetup'
  | 'freeAgentProfile'
  | 'parentHandoff'
  | 'invitePreview'
  | 'inviteConfirm'

export type OnboardingPathKey =
  | 'member'
  | 'admin'
  | 'adminDirect'
  | 'freeAgent'
  | 'guardian'
  | 'invite'

export type OnboardingProgress = { current: number; total: number }

export const ONBOARDING_PATHS: Readonly<Record<OnboardingPathKey, readonly OnboardingScreenKey[]>> = {
  member: ['welcome', 'code', 'profile', 'clubSearch'],
  admin: ['welcome', 'code', 'profile', 'clubSearch', 'clubSetup'],
  adminDirect: ['welcome', 'code', 'profile', 'clubSetup'],
  freeAgent: ['welcome', 'code', 'profile', 'freeAgentProfile'],
  guardian: ['welcome', 'code', 'profile', 'clubSearch', 'parentHandoff'],
  invite: ['invitePreview', 'code', 'inviteConfirm'],
}

/** Owner's hard caps: screens up to and including the one with the final tap. */
export const ONBOARDING_SCREEN_CAPS: Readonly<Record<OnboardingPathKey, number>> = {
  member: 4,
  admin: 5,
  adminDirect: 4,
  freeAgent: 4,
  guardian: 5,
  invite: 3,
}

export function onboardingProgress(
  path: OnboardingPathKey,
  screen: OnboardingScreenKey,
): OnboardingProgress | null {
  const screens = ONBOARDING_PATHS[path]
  const index = screens.indexOf(screen)
  if (index < 0) return null
  return { current: index + 1, total: screens.length }
}

/** Which path an intent picked before sign-in puts the user on. */
export function pathForIntent(intent: string | null | undefined): OnboardingPathKey {
  if (intent === 'free-agent') return 'freeAgent'
  if (intent === 'parent-handoff') return 'guardian'
  if (intent === 'club-setup') return 'adminDirect'
  return 'member'
}
