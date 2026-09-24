-- Wechselbörse adversarial-review fixes (2026-09-24).

-- L6: a trial thread / Gesuch survives the deletion of the staff member who
-- opened it (sender / creator become NULL instead of cascading the thread away).
ALTER TABLE "TrialInvite" ALTER COLUMN "sentByUserId" DROP NOT NULL;
ALTER TABLE "TrialInvite" DROP CONSTRAINT "TrialInvite_sentByUserId_fkey";
ALTER TABLE "TrialInvite" ADD CONSTRAINT "TrialInvite_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlayerSearch" ALTER COLUMN "createdByUserId" DROP NOT NULL;
ALTER TABLE "PlayerSearch" DROP CONSTRAINT "PlayerSearch_createdByUserId_fkey";
ALTER TABLE "PlayerSearch" ADD CONSTRAINT "PlayerSearch_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- L3: legacy ACCEPTED trials without sessions are closed, and the TRIAL team
-- access they granted is revoked.
WITH legacy AS (
  UPDATE "TrialInvite"
  SET "status" = 'EXPIRED', "updatedAt" = NOW()
  WHERE "status" = 'ACCEPTED' AND cardinality("sessionEventIds") = 0
  RETURNING "teamId", "freeAgentProfileId"
)
UPDATE "TeamAccess" ta
SET "status" = 'REVOKED', "updatedAt" = NOW()
FROM legacy l
JOIN "FreeAgentProfile" fp ON fp."id" = l."freeAgentProfileId"
WHERE ta."teamId" = l."teamId"
  AND ta."userId" = fp."userId"
  AND ta."role" = 'PLAYER'
  AND ta."phase" = 'TRIAL'
  AND ta."status" = 'ACTIVE';

-- H2 (lead decision): no free-agent profile under 16. Existing ones are
-- delisted and made private; their open trials are withdrawn and the TRIAL
-- access revoked.
WITH under16 AS (
  UPDATE "FreeAgentProfile" fp
  SET "isOnTransferList" = false, "visibility" = 'PRIVATE', "updatedAt" = NOW()
  FROM "User" u
  WHERE u."id" = fp."userId"
    AND u."dateOfBirth" IS NOT NULL
    AND u."dateOfBirth" > (NOW() - INTERVAL '16 years')
  RETURNING fp."id", fp."userId"
),
closed AS (
  UPDATE "TrialInvite" ti
  SET "status" = 'WITHDRAWN', "respondedAt" = NOW(), "updatedAt" = NOW()
  FROM under16
  WHERE ti."freeAgentProfileId" = under16."id"
    AND ti."status" IN ('REQUESTED', 'PENDING', 'ACCEPTED', 'OFFERED')
  RETURNING ti."teamId", under16."userId"
)
UPDATE "TeamAccess" ta
SET "status" = 'REVOKED', "updatedAt" = NOW()
FROM closed
WHERE ta."teamId" = closed."teamId"
  AND ta."userId" = closed."userId"
  AND ta."role" = 'PLAYER'
  AND ta."phase" = 'TRIAL'
  AND ta."status" = 'ACTIVE';

-- H2: 16–17-year-olds are visible to clubs only.
UPDATE "FreeAgentProfile" fp
SET "visibility" = 'CLUB_ONLY', "updatedAt" = NOW()
FROM "User" u
WHERE u."id" = fp."userId"
  AND fp."visibility" = 'PUBLIC'
  AND u."dateOfBirth" IS NOT NULL
  AND u."dateOfBirth" > (NOW() - INTERVAL '18 years');

-- M4: players who joined through the Wechselbörse, or no longer hold the
-- free-agent role, are off the transfer list.
UPDATE "FreeAgentProfile" fp
SET "isOnTransferList" = false, "updatedAt" = NOW()
WHERE fp."isOnTransferList" = true
  AND (
    EXISTS (
      SELECT 1 FROM "TrialInvite" ti
      WHERE ti."freeAgentProfileId" = fp."id" AND ti."status" = 'JOINED'
    )
    OR EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."id" = fp."userId" AND u."registrationRole" IS DISTINCT FROM 'FREE_AGENT'
    )
  );

-- B2: a pending Aufnahmeantrag whose offer is no longer OFFERED is closed.
UPDATE "JoinRequest" jr
SET "status" = 'REJECTED', "reviewedAt" = NOW()
FROM "TrialInvite" ti
WHERE jr."trialInviteId" = ti."id"
  AND jr."status" = 'PENDING'
  AND ti."status" <> 'OFFERED';

-- M2: withdrawn/rejected applications older than 30 days lose their
-- contact data (the hourly sweep keeps this up to date from now on).
UPDATE "JoinRequest"
SET "street" = NULL, "postalCode" = NULL, "city" = NULL, "phone" = NULL,
    "nationality" = NULL, "lastMatchDate" = NULL
WHERE "status" IN ('REJECTED', 'WITHDRAWN')
  AND "reviewedAt" < (NOW() - INTERVAL '30 days');
