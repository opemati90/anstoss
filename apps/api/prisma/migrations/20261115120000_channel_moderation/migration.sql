-- Chat restrictions do not alter club Membership or TeamAccess.
ALTER TABLE "ChannelMember"
  ADD COLUMN "postingSuspended" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "removed" BOOLEAN NOT NULL DEFAULT false;
