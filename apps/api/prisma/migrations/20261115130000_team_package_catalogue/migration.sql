-- New immutable definitions; existing grants/subscriptions retain their old limits and prices.
-- No Stripe products or charges are created by this migration.
INSERT INTO "PlanDefinition" (
  "id", "tier", "interval", "version", "priceCents", "currency",
  "teamLimit", "playerLimit", "features", "publishedAt", "createdAt", "updatedAt"
)
SELECT 'plan_package_' || package || '_' || lower(period::text) || '_20261115', 'PRO', period,
  COALESCE((SELECT max("version") FROM "PlanDefinition" WHERE "tier" = 'PRO' AND "interval" = period), 0) + ordinal,
  CASE WHEN period = 'MONTHLY' THEN monthly ELSE monthly * 10 END, 'eur', teams, players,
  ARRAY['clubColors', 'liveTicker', 'lineupSharing', 'autoReminders', 'fixtureImport', 'duesTracking'],
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('team', 1, 1299, 1, 30),
  ('club3', 2, 2499, 3, 90),
  ('club6', 3, 3999, 6, 180),
  ('unlimited', 4, 4999, 2147483647, 2147483647)
) AS packages(package, ordinal, monthly, teams, players)
CROSS JOIN (VALUES ('MONTHLY'::"PlanInterval"), ('TWELVE_MONTHS'::"PlanInterval")) AS intervals(period);
