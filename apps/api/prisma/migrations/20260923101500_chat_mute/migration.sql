-- Chat revamp: per-user mute for channels and direct conversations.
ALTER TABLE "ChannelMember" ADD COLUMN "muted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ChannelMember" ADD COLUMN "mutedUntil" TIMESTAMP(3);

ALTER TABLE "ConversationParticipant" ADD COLUMN "muted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ConversationParticipant" ADD COLUMN "mutedUntil" TIMESTAMP(3);
