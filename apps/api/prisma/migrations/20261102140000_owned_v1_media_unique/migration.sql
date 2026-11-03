-- Historical media may legitimately have duplicate references. The new
-- server-issued owned-v1 format is single-message only, and old presigners
-- could not mint this prefix. Keep legacy rows unchanged.
-- Non-unique lookup indexes also cover historical URLs: parameterized equality
-- queries cannot reliably use the narrower regex-based partial unique index.
-- Fail the deployment rather than wait indefinitely for writers or hold a
-- write-blocking lock for an unbounded index build. Large installations need
-- a reviewed concurrent-index migration strategy before deploying this file.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
CREATE INDEX "Message_attachmentUrl_lookup" ON "Message" ("attachmentUrl") WHERE "attachmentUrl" IS NOT NULL;
CREATE INDEX "DirectMessage_attachmentUrl_lookup" ON "DirectMessage" ("attachmentUrl") WHERE "attachmentUrl" IS NOT NULL;

CREATE UNIQUE INDEX "Message_owned_v1_attachment_unique"
  ON "Message" ("attachmentUrl")
  WHERE "attachmentUrl" ~ '^https://private-media[.]anstoss[.]invalid/chat/[^/]+/[^/]+/(image|video|file|voice)/private-v1-u[0-9a-f]{64}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[A-Za-z0-9._-]+$';

CREATE UNIQUE INDEX "DirectMessage_owned_v1_attachment_unique"
  ON "DirectMessage" ("attachmentUrl")
  WHERE "attachmentUrl" ~ '^https://private-media[.]anstoss[.]invalid/dm/[^/]+/[^/]+/(image|video|file|voice)/private-v1-u[0-9a-f]{64}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[A-Za-z0-9._-]+$';

COMMIT;
