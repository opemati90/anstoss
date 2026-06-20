-- CreateEnum
CREATE TYPE "ClubDirectorySource" AS ENUM ('DFBNET', 'FUSSBALL_DE', 'CSV_IMPORT', 'MANUAL');

-- AlterTable
ALTER TABLE "Club" ADD COLUMN "searchText" TEXT;

-- Backfill a lightweight normalized search field for existing clubs.
UPDATE "Club"
SET "searchText" = lower(
  trim(
    regexp_replace(
      concat_ws(
        ' ',
        replace(
          replace(
            replace(
              replace(
                replace(
                  replace(
                    replace(concat_ws(' ', "name", "city"), 'Ä', 'Ae'),
                    'Ö',
                    'Oe'
                  ),
                  'Ü',
                  'Ue'
                ),
                'ä',
                'ae'
              ),
              'ö',
              'oe'
            ),
            'ü',
            'ue'
          ),
          'ß',
          'ss'
        ),
        translate(
          replace(concat_ws(' ', "name", "city"), 'ß', 'ss'),
          'ÄÖÜäöü',
          'AOUaou'
        )
      ),
      '[^a-zA-Z0-9]+',
      ' ',
      'g'
    )
  )
);

-- CreateTable
CREATE TABLE "ClubDirectoryEntry" (
    "id" TEXT NOT NULL,
    "source" "ClubDirectorySource" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "association" TEXT,
    "badgeUrl" TEXT,
    "websiteUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#1A1A18',
    "activeClubId" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubDirectoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Club_searchText_idx" ON "Club"("searchText");

-- CreateIndex
CREATE UNIQUE INDEX "ClubDirectoryEntry_slug_key" ON "ClubDirectoryEntry"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ClubDirectoryEntry_activeClubId_key" ON "ClubDirectoryEntry"("activeClubId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubDirectoryEntry_source_sourceId_key" ON "ClubDirectoryEntry"("source", "sourceId");

-- CreateIndex
CREATE INDEX "ClubDirectoryEntry_normalizedName_idx" ON "ClubDirectoryEntry"("normalizedName");

-- CreateIndex
CREATE INDEX "ClubDirectoryEntry_city_idx" ON "ClubDirectoryEntry"("city");

-- CreateIndex
CREATE INDEX "ClubDirectoryEntry_state_idx" ON "ClubDirectoryEntry"("state");

-- CreateIndex
CREATE INDEX "ClubDirectoryEntry_association_idx" ON "ClubDirectoryEntry"("association");

-- CreateIndex
CREATE INDEX "ClubDirectoryEntry_activeClubId_idx" ON "ClubDirectoryEntry"("activeClubId");

-- AddForeignKey
ALTER TABLE "ClubDirectoryEntry" ADD CONSTRAINT "ClubDirectoryEntry_activeClubId_fkey" FOREIGN KEY ("activeClubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;
