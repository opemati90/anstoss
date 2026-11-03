-- Provider acceptance can be unknown after a lost response. Keep a distinct,
-- non-retryable state so scheduled sweeps do not duplicate a possibly sent nudge.
ALTER TYPE "ContributionReminderStatus" ADD VALUE IF NOT EXISTS 'UNCONFIRMED';
