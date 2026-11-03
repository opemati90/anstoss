/**
 * Public-release scope approved by the operator on 28 October 2026.
 * These are source-controlled release boundaries, NOT runtime switches.
 * Youth/guardian and health workflows require a separately reviewed release.
 * Preserve historical data and privacy-rights routes when gating features.
 */
export const LAUNCH_FEATURES = {
  minimumAccountAge: 18,
  youthParticipation: false,
  healthReporting: false,
} as const
