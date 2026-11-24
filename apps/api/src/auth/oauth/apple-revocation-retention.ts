import { PrismaService } from '../../prisma/prisma.service'
import { APPLE_REVOCATION_MARKER } from './apple-session'

/** A marker must outlive every refreshable bound session. It is only removable
 * once its identity is gone (old JWTs then fail the identity-id check), and the
 * event is older than every accepted provider proof/pending challenge. */
export async function pruneUnusedAppleRevocations(prisma: PrismaService, now: Date) {
  const cutoff = new Date(now.getTime() - 30 * 86_400_000)
  // Exclude active identities in SQL, so a page of old-but-required markers
  // cannot indefinitely starve unrelated, removable rows from cleanup.
  const candidates = await prisma.$queryRaw<Array<{ id: string; subjectHash: string }>>`
    SELECT marker."id", marker."subjectHash"
    FROM "AuthIdentityTombstone" marker
    WHERE marker."provider" = ${APPLE_REVOCATION_MARKER}
      AND marker."createdAt" <= ${cutoff}
      AND NOT EXISTS (
        SELECT 1 FROM "SocialIdentity" identity
        WHERE identity."provider" = 'apple' AND identity."subjectHash" = marker."subjectHash"
      )
    ORDER BY marker."createdAt", marker."id"
    LIMIT 100`
  let removed = 0
  for (const candidate of candidates) {
    removed += await prisma.$transaction(async (tx) => {
      // Serialize deletion with login/linking AND notification upserts. Recheck
      // both identity presence and marker age after acquiring that lock.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'apple'}), hashtext(${candidate.subjectHash}))::text`
      const identity = await tx.socialIdentity.findUnique({
        where: {
          provider_subjectHash: { provider: 'apple', subjectHash: candidate.subjectHash },
        },
        select: { id: true },
      })
      if (identity) return 0
      const result = await tx.authIdentityTombstone.deleteMany({
        where: {
          id: candidate.id,
          provider: APPLE_REVOCATION_MARKER,
          createdAt: { lte: cutoff },
        },
      })
      return result.count
    })
  }
  return removed
}
