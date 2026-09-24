-- Onboarding review fixes (H5): a parent handoff that started from an invite
-- remembers the invite's team, so the guardian's team code is optional.
ALTER TABLE "ParentHandoff" ADD COLUMN "teamId" TEXT;
