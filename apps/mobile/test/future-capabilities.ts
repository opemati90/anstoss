/** Preserved future youth/health regressions, NOT adult-launch acceptance. */
jest.mock('../../../packages/shared/src/constants/launch-features', () => ({
  LAUNCH_FEATURES: { minimumAccountAge: 18, youthParticipation: true, healthReporting: true },
}))
export {}
