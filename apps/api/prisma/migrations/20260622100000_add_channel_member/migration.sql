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
