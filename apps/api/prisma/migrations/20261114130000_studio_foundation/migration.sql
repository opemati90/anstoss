ALTER TYPE "ClubOperationalRole" ADD VALUE IF NOT EXISTS 'MEDIA_MANAGER';

CREATE TABLE "StudioBrandKit" (
    "clubId" TEXT NOT NULL,
    "fontPairing" TEXT NOT NULL DEFAULT 'CONDENSED',
    "handle" TEXT,
    "hashtags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "sponsors" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StudioBrandKit_pkey" PRIMARY KEY ("clubId"),
    CONSTRAINT "StudioBrandKit_fontPairing_check" CHECK ("fontPairing" IN ('CONDENSED', 'CLASSIC', 'MODERN')),
    CONSTRAINT "StudioBrandKit_sponsors_array_check" CHECK ("sponsors" IS NULL OR jsonb_typeof("sponsors") = 'array'),
    CONSTRAINT "StudioBrandKit_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
