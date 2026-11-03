-- An acknowledged abort prevents finalization but is not proof that all
-- in-flight part storage has been purged. Keep this distinct from REMOVED.
ALTER TYPE "PrivateMediaUploadState" ADD VALUE 'ABORTED';
