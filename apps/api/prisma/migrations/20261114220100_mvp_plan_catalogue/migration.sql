-- Immutable current definitions. No Stripe products, prices or subscriptions
-- are created; a platform admin must link a verified recurring Stripe price.
-- Existing grants keep pointing at their original definitions.
INSERT INTO "PlanDefinition" (
  "id", "tier", "interval", "version", "priceCents", "currency",
  "teamLimit", "playerLimit", "features", "publishedAt", "createdAt", "updatedAt"
)
SELECT 'plan_mvp_pro_' || lower(period::text) || '_20261114', 'PRO', period,
  COALESCE((SELECT max("version") FROM "PlanDefinition" WHERE "tier" = 'PRO' AND "interval" = period), 0) + 1,
  cents, 'eur', 5, 150,
  ARRAY['clubColors', 'liveTicker', 'lineupSharing', 'autoReminders', 'fixtureImport', 'duesTracking', 'chatTranslation', 'actingSessions'],
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES ('MONTHLY'::"PlanInterval", 1099), ('TWELVE_MONTHS'::"PlanInterval", 10990)) AS catalogue(period, cents);
