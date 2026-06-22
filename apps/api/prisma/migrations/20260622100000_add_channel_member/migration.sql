-- Membership pivot for chat channels. Scopes CUSTOM group channels to an
-- explicit member set so a channel id alone no longer grants read/write access.
CREATE TABLE "ChannelMember" (
  "id" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ChannelMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChannelMember_channelId_userId_key"
  ON "ChannelMember"("channelId", "userId");

CREATE INDEX "ChannelMember_userId_idx"
  ON "ChannelMember"("userId");

CREATE INDEX "ChannelMember_channelId_idx"
  ON "ChannelMember"("channelId");

ALTER TABLE "ChannelMember"
  ADD CONSTRAINT "ChannelMember_channelId_fkey"
  FOREIGN KEY ("channelId") REFERENCES "Channel"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChannelMember"
  ADD CONSTRAINT "ChannelMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: CUSTOM channels created under the old "anyone with the slug"
-- model have no member rows. Without this they would become invisible to
-- everyone (incl. the creator) once membership scoping is enforced. Seed the
-- full eligible audience so existing groups keep their current access.
-- Idempotent: ON CONFLICT DO NOTHING + safe to re-run. gen_random_uuid() is
-- built-in on PG13+ (Railway runs PG18).

-- Team-scoped CUSTOM channels → every active team member.
INSERT INTO "ChannelMember" ("id", "channelId", "userId", "createdAt")
SELECT gen_random_uuid()::text, c."id", ta."userId", CURRENT_TIMESTAMP
FROM "Channel" c
JOIN "TeamAccess" ta
  ON ta."teamId" = c."teamId" AND ta."status" = 'ACTIVE'
WHERE c."kind" = 'CUSTOM' AND c."teamId" IS NOT NULL
ON CONFLICT ("channelId", "userId") DO NOTHING;

-- Club-scoped CUSTOM channels (no team) → every club member.
INSERT INTO "ChannelMember" ("id", "channelId", "userId", "createdAt")
SELECT gen_random_uuid()::text, c."id", m."userId", CURRENT_TIMESTAMP
FROM "Channel" c
JOIN "Membership" m ON m."clubId" = c."clubId"
WHERE c."kind" = 'CUSTOM' AND c."teamId" IS NULL
ON CONFLICT ("channelId", "userId") DO NOTHING;
