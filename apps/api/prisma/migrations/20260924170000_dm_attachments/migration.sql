-- Chat revamp: direct-message attachments (photo, video, PDF, voice, lineup
-- card), replies within the same conversation and reactions. Mirrors the
-- channel Message columns so DMs reuse the channel media pipeline.
ALTER TABLE "DirectMessage"
  ADD COLUMN "messageType" "MessageType" NOT NULL DEFAULT 'TEXT',
  ADD COLUMN "attachmentUrl" TEXT,
  ADD COLUMN "attachmentMeta" JSONB,
  ADD COLUMN "replyToId" TEXT;

ALTER TABLE "DirectMessage"
  ADD CONSTRAINT "DirectMessage_replyToId_fkey"
  FOREIGN KEY ("replyToId") REFERENCES "DirectMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "DirectMessage_replyToId_idx" ON "DirectMessage"("replyToId");

-- Reports keep a snapshot of the reported attachment (like MessageReport).
ALTER TABLE "DirectMessageReport"
  ADD COLUMN "evidenceAttachmentUrl" TEXT,
  ADD COLUMN "evidenceAttachmentMeta" JSONB;

CREATE TABLE "DirectMessageReaction" (
  "id" TEXT NOT NULL,
  "directMessageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "emoji" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DirectMessageReaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DirectMessageReaction_directMessageId_userId_emoji_key"
  ON "DirectMessageReaction"("directMessageId", "userId", "emoji");
CREATE INDEX "DirectMessageReaction_directMessageId_idx"
  ON "DirectMessageReaction"("directMessageId");

ALTER TABLE "DirectMessageReaction"
  ADD CONSTRAINT "DirectMessageReaction_directMessageId_fkey"
  FOREIGN KEY ("directMessageId") REFERENCES "DirectMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectMessageReaction"
  ADD CONSTRAINT "DirectMessageReaction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
