import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { createHash, randomUUID } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'

const RESERVATION_MS = 15 * 60_000
const MAX_PENDING_UPLOADS = 10

/** Cleanup remains disabled until every pre-bridge API writer has drained. */
export const privateV1CleanupEnabled = () => process.env.PRIVATE_V1_UPLOAD_RESERVATIONS === 'true'
export const PRIVATE_V1_PAUSED_UNTIL = new Date('9999-12-31T00:00:00.000Z')

/** Persist a cleanup obligation before issuing any capability to write bytes. */
export async function reservePrivateV1Upload(
  prisma: PrismaService,
  ownerId: string,
  objectKey: string,
  fingerprint: unknown,
): Promise<Date> {
  return prisma.$transaction(async (tx) => {
    // Account erasure uses this lock before collecting private media.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerId}))`
    const owner = await tx.user.findUnique({ where: { id: ownerId }, select: { deletedAt: true } })
    if (!owner || owner.deletedAt) throw new ForbiddenException('Account unavailable')
    const pending = await tx.accountMediaDeletion.count({ where: { uploadOwnerId: ownerId, uploadState: 'PENDING' } })
    if (pending >= MAX_PENDING_UPLOADS) throw new BadRequestException('Too many pending uploads; try again later')
    const [{ now }] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`
    const expiresAt = new Date(now.getTime() + RESERVATION_MS)
    await tx.accountMediaDeletion.create({ data: {
      // An old worker only understands availableAt. Keep it from touching
      // reservations issued during the bridge phase, even if it remains up.
      objectKey, availableAt: privateV1CleanupEnabled() ? expiresAt : PRIVATE_V1_PAUSED_UNTIL,
      uploadOwnerId: ownerId, uploadRequestId: randomUUID(),
      uploadFingerprint: createHash('sha256').update(JSON.stringify(fingerprint)).digest('hex'),
      uploadExpiresAt: expiresAt, uploadState: 'PENDING',
    } })
    return expiresAt
  })
}

/** Called under the object lock in the same transaction that creates a message. */
export async function consumePrivateV1Upload(
  tx: Prisma.TransactionClient,
  ownerId: string,
  objectKey: string,
): Promise<void> {
  const [{ now }] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`
  const consumed = await tx.accountMediaDeletion.deleteMany({ where: {
    objectKey, uploadOwnerId: ownerId, uploadState: 'PENDING', uploadExpiresAt: { gt: now },
  } })
  if (consumed.count !== 1) throw new BadRequestException('Attachment expired or is being removed; upload it again')
}

/** Adopt an exact already-persisted message from a mixed-version rollout.
 * The caller must first verify its actor, scope, key and complete payload.
 */
export async function adoptPrivateV1Upload(
  tx: Prisma.TransactionClient,
  ownerId: string,
  objectKey: string,
): Promise<void> {
  const adopted = await tx.accountMediaDeletion.deleteMany({ where: {
    objectKey, uploadOwnerId: ownerId, uploadState: 'PENDING',
  } })
  if (adopted.count !== 1) throw new BadRequestException('Attachment reservation does not belong to this sender')
}
