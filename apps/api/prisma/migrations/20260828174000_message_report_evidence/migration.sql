ALTER TABLE "MessageReport"
  ADD COLUMN "evidenceContent" TEXT,
  ADD COLUMN "evidenceAttachmentUrl" TEXT,
  ADD COLUMN "evidenceAttachmentMeta" JSONB;
