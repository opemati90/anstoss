-- Cross-club live-window index for the fussball live poller.
-- findLiveWindowLinks() filters by (status, kickoffAt) with no clubId, so the
-- existing club-prefixed indexes don't help and the query would table-scan as
-- fixture history grows.
CREATE INDEX "ImportedFixture_status_kickoffAt_idx" ON "ImportedFixture"("status", "kickoffAt");
