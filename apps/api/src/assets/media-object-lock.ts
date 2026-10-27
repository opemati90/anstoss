import type { Prisma } from '@prisma/client'

/** Shared by attachment persistence and erasure. Acquire after user/access
 * locks; hold through validation + persistence or reference checks + removal. */
export async function lockMediaObject(
  tx: Pick<Prisma.TransactionClient, '$executeRaw'>,
  objectKey: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`media-object:${objectKey}`}))`
}
