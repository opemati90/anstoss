-- Per-team squad target so coaches see the right "X more players needed"
-- prompt for senior teams (16-22), youth (15), futsal (10), etc.
ALTER TABLE "Team" ADD COLUMN "squadTarget" INTEGER NOT NULL DEFAULT 13;
