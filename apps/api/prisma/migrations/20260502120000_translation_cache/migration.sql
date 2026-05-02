-- Chat translation cache for LibreTranslate-backed always-on translation.

ALTER TABLE "User" ADD COLUMN "preferredLanguage" TEXT;

ALTER TABLE "Message" ADD COLUMN "sourceLanguage" TEXT;
ALTER TABLE "DirectMessage" ADD COLUMN "sourceLanguage" TEXT;

CREATE TABLE "MessageTranslation" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "targetLanguage" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageTranslation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MessageTranslation_messageId_targetLanguage_key" ON "MessageTranslation"("messageId", "targetLanguage");
CREATE INDEX "MessageTranslation_messageId_idx" ON "MessageTranslation"("messageId");

ALTER TABLE "MessageTranslation" ADD CONSTRAINT "MessageTranslation_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DirectMessageTranslation" (
  "id" TEXT NOT NULL,
  "directMessageId" TEXT NOT NULL,
  "targetLanguage" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DirectMessageTranslation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DirectMessageTranslation_directMessageId_targetLanguage_key" ON "DirectMessageTranslation"("directMessageId", "targetLanguage");
CREATE INDEX "DirectMessageTranslation_directMessageId_idx" ON "DirectMessageTranslation"("directMessageId");

ALTER TABLE "DirectMessageTranslation" ADD CONSTRAINT "DirectMessageTranslation_directMessageId_fkey"
  FOREIGN KEY ("directMessageId") REFERENCES "DirectMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
