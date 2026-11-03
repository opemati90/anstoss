/**
 * Explicit opt-in for preserved future youth/health subsystem regressions.
 * Production capabilities remain disabled in the shared source file.
 * NEVER import this from adult-launch or release-acceptance test suites.
 */
jest.mock('../../../packages/shared/src/constants/launch-features', () => ({
  LAUNCH_FEATURES: { minimumAccountAge: 18, youthParticipation: true, healthReporting: true },
}))

export {}
