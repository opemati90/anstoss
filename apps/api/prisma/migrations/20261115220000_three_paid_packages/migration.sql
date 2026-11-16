-- Retire old PRO offers for new purchases only. Existing grants retain their
-- immutable definition IDs, limits, prices and subscription lifecycle.
-- This migration creates no Stripe/App Store products and makes no charges.
UPDATE "PlanDefinition" SET "publishedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
WHERE "tier" = 'PRO' AND "publishedAt" IS NOT NULL;

INSERT INTO "PlanDefinition" (
  "id", "tier", "interval", "version", "priceCents", "currency",
  "teamLimit", "playerLimit", "features", "publishedAt", "createdAt", "updatedAt"
)
SELECT 'plan_three_' || package || '_' || lower(period::text) || '_20261115', 'PRO', period,
  COALESCE((SELECT max("version") FROM "PlanDefinition" WHERE "tier" = 'PRO' AND "interval" = period), 0) + ordinal,
  CASE WHEN period = 'MONTHLY' THEN monthly ELSE yearly END, 'eur', teams, players,
  ARRAY['clubColors', 'liveTicker', 'lineupSharing', 'autoReminders', 'fixtureImport', 'duesTracking'],
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('team', 1, 1299, 12900, 1, 30),
  ('club3', 2, 2999, 29900, 3, 90),
  ('unlimited', 3, 3999, 39900, 2147483647, 2147483647)
) AS packages(package, ordinal, monthly, yearly, teams, players)
CROSS JOIN (VALUES ('MONTHLY'::"PlanInterval"), ('TWELVE_MONTHS'::"PlanInterval")) AS intervals(period);
