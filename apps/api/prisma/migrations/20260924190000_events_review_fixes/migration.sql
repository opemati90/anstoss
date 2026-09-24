-- Events review fixes (2026-09-24).

-- M6 / L7: derived titles are rendered in the reader's language. The stored
-- title keeps a language-neutral fallback for older readers.
ALTER TABLE "Event" ADD COLUMN "autoTitle" BOOLEAN NOT NULL DEFAULT false;

-- H2: what the last fussball.de sync wrote, so the next sync can tell a
-- coach's edit (kept) from its own earlier value (refreshed).
ALTER TABLE "Event" ADD COLUMN "importedFields" JSONB;

-- H1: a nominated player who answered Absage or left the team.
ALTER TABLE "Rsvp" ADD COLUMN "squadDroppedAt" TIMESTAMP(3);

-- M6: "vs. X" / "@ X" match titles become the opponent plus a derived title.
UPDATE "Event"
SET "title" = btrim("opponent"), "autoTitle" = true
WHERE "type" = 'MATCH'
  AND "opponent" IS NOT NULL
  AND btrim("opponent") <> ''
  AND ("title" = 'vs. ' || "opponent" OR "title" = '@ ' || "opponent" OR "title" = "opponent");

-- L7: the automatic Training title was stored in the creator's language.
UPDATE "Event"
SET "title" = 'Training', "autoTitle" = true
WHERE "type" = 'TRAINING'
  AND "title" IN ('Training', 'Entraînement', 'Allenamento', 'Treino', 'Antrenman');

-- H2: until now every sync overwrote these fields, so the current values of
-- imported matches are the last import's values.
UPDATE "Event"
SET "importedFields" = jsonb_build_object(
  'location', "location",
  'notes', "notes",
  'meetingPoint', "meetingPoint",
  'meetingAt', CASE
    WHEN "meetingAt" IS NULL THEN NULL
    ELSE to_char("meetingAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  END
)
WHERE "externalMatchKey" IS NOT NULL OR "fixtureId" IS NOT NULL;
