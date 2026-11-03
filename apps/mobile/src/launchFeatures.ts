// Sensitive compliance records (medical, vaccination and background checks)
// are unavailable in the first public release pending Article 9/10 review.
// Keep this aligned with the API's COMPLIANCE_FEATURE_ENABLED kill switch.
export const COMPLIANCE_FEATURE_ENABLED = false

// Optional modules remain in the codebase but do not compete with core club
// operations in the first release. These are presentation gates, not API
// authorization or data-deletion controls.
export const OPTIONAL_CLUB_FEATURES = {
  marketplace: false,
  statistics: false,
  sponsorship: false,
} as const
