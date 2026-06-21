-- Add a first-class provider for licensed/partner fixture feeds.
ALTER TYPE "ExternalDataProvider" ADD VALUE IF NOT EXISTS 'LICENSED_FEED';
