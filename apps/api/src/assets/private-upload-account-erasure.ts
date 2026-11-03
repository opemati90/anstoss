import type { Prisma, PrivateMediaUpload } from '@prisma/client'
import { tenantContext } from '../prisma/tenant.context'
import { PrivateUploadLedger } from './private-upload-ledger'

type AccountUploadIntent = Pick<PrivateMediaUpload,
  'id' | 'clubId' | 'ownerId' | 'targetId' | 'targetType' | 'messageId' | 'objectKey'>

export class PrivateUploadAccountErasureError extends Error {
  constructor() {
    super('Private upload cleanup could not be scheduled safely')
    this.name = PrivateUploadAccountErasureError.name
  }
}

/** Trusted self-account erasure inventory, after account + dm-user locks.
 * Owner ID is server-authenticated. Discovery must include abandoned intents
 * from clubs the owner has already left, even inside a tenant request.
 */
export async function findAccountPrivateUploads(tx: Prisma.TransactionClient, ownerId: string) {
  if (!ownerId) throw new PrivateUploadAccountErasureError()
  // Prisma delegates are lazy: consume the PrismaPromise before restoring the
  // ambient tenant, otherwise middleware can silently narrow the inventory.
  const uploads = await tenantContext.exit(async () => await tx.privateMediaUpload.findMany({
    where: { ownerId, state: { not: 'REMOVED' } },
    select: { id: true, clubId: true, ownerId: true, targetId: true, targetType: true, messageId: true, objectKey: true },
  }))
  for (const upload of uploads) {
    if (upload.ownerId !== ownerId || !upload.id || !upload.clubId || !upload.targetId
      || !['CHANNEL', 'DM'].includes(upload.targetType)) throw new PrivateUploadAccountErasureError()
  }
  return uploads
}

/** Runs in the account-erasure transaction before references are removed.
 * Merge ALL bound-message locks before locking any upload: acquiring a newly
 * discovered message lock after an upload would invert cleanup/publication.
 * Caller holds account/revocation locks to exclude fresh reservations/bindings.
 * Cancellation preserves operation tokens; no provider I/O or erasure claim.
 */
export async function cancelAccountPrivateUploads(
  tx: Prisma.TransactionClient,
  ownerId: string,
  uploads: AccountUploadIntent[],
  additionalMessageLocks: string[],
) {
  const messageLocks = new Set(additionalMessageLocks)
  for (const upload of uploads) {
    if (upload.ownerId !== ownerId || !upload.id || !upload.clubId || !upload.targetId
      || !['CHANNEL', 'DM'].includes(upload.targetType)) throw new PrivateUploadAccountErasureError()
    if (upload.messageId) {
      messageLocks.add(`${upload.targetType === 'CHANNEL' ? 'chat-message' : 'dm-message'}:${upload.messageId}`)
    }
  }
  for (const key of [...messageLocks].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`
  }
  const ledger = new PrivateUploadLedger()
  for (const upload of [...uploads].sort((a, b) => a.id.localeCompare(b.id))) {
    await tenantContext.run({ clubId: upload.clubId, userId: ownerId }, async () => {
      const scope = { id: upload.id, clubId: upload.clubId, ownerId }
      const current = await ledger.snapshot(tx, scope)
      // Recheck immutable routing after the upload lock. Never cancel a row
      // whose new binding would require a message lock outside the merged set.
      if (!current || current.messageId !== upload.messageId || current.targetId !== upload.targetId
        || current.targetType !== upload.targetType || current.objectKey !== upload.objectKey) throw new PrivateUploadAccountErasureError()
      if (current.state === 'REMOVED') return
      if (!await ledger.cancel(tx, scope)) throw new PrivateUploadAccountErasureError()
    })
  }
}
