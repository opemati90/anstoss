import { Prisma } from '@prisma/client'
import { PrivateUploadLedger } from './private-upload-ledger'

export class PrivateUploadBindingError extends Error {}

export function isPrivateUploadMarker(url: string | null | undefined): boolean {
  return Boolean(url?.startsWith('https://private-media.anstoss.invalid/private-chat/v2/'))
}

/**
 * Called in the same transaction that removes a message's attachment.
 * The message lock must precede the upload lock, matching publication and
 * cleanup. Cancellation schedules cleanup; it does not claim physical erasure.
 */
export async function retireMessageUpload(
  tx: Prisma.TransactionClient,
  binding: { clubId: string; messageId: string; targetType: 'CHANNEL' | 'DM'; targetId: string | null },
) {
  const prefix = binding.targetType === 'CHANNEL' ? 'chat-message' : 'dm-message'
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${prefix}:${binding.messageId}`}))`
  const upload = await tx.privateMediaUpload.findUnique({ where: { messageId: binding.messageId } })
  if (!upload) return false
  if (upload.clubId !== binding.clubId || upload.targetType !== binding.targetType
    || upload.targetId !== binding.targetId) {
    throw new PrivateUploadBindingError('Private upload message binding is inconsistent')
  }
  if (upload.cancelRequestedAt && ['REMOVING', 'REMOVED'].includes(upload.state)) return true
  if (upload.state !== 'ATTACHED') throw new PrivateUploadBindingError('Private upload message binding is inconsistent')
  const cancelled = await new PrivateUploadLedger().cancel(tx, {
    id: upload.id, clubId: binding.clubId, ownerId: upload.ownerId,
  })
  if (!cancelled) throw new Error('Private upload retirement failed')
  return true
}
