-- Coach-built lineup persisted on the per-fixture overlay (fussball.de has no
-- structured amateur lineups, so lineups are coach-driven).
ALTER TABLE "FixtureOverlay" ADD COLUMN "lineupFormation" TEXT;
ALTER TABLE "FixtureOverlay" ADD COLUMN "lineup" JSONB;
