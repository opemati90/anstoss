ALTER TABLE "ExternalTeamLink"
  ADD COLUMN "widgetId" TEXT,
  ADD COLUMN "widgetType" TEXT;

ALTER TABLE "ExternalTeamLink"
  ADD CONSTRAINT "ExternalTeamLink_widget_pair_check"
  CHECK (("widgetId" IS NULL) = ("widgetType" IS NULL));
