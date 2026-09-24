/**
 * UGC report reasons (Apple 1.2 / Google Play UGC).
 *
 * SAFEGUARDING (child safety: grooming, sexual content involving minors,
 * threats to a child) never goes to the club queue: it lands straight in the
 * platform queue and alerts the platform team immediately.
 */
export const REPORT_REASONS = ['SPAM', 'ABUSE', 'INAPPROPRIATE', 'SAFEGUARDING', 'OTHER'] as const
export type ReportReason = (typeof REPORT_REASONS)[number]

/** Reasons that bypass club moderators. */
export const PLATFORM_ONLY_REPORT_REASONS: readonly ReportReason[] = ['SAFEGUARDING']

/** Club moderators' response target, in hours (docs/compliance/UGC_MODERATION.md). */
export const MODERATION_RESPONSE_HOURS = 24
