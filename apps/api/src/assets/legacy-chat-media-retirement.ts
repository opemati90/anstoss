import type { Prisma } from '@prisma/client'
import { ServiceUnavailableException } from '@nestjs/common'
import { R2Provider } from './r2.provider'
import { isPrivateUploadMarker } from './private-upload-retirement'
import { isOwnedPrivateV1Key } from '../media/private-v1-owner'
import { lockMediaObject } from './media-object-lock'
import { uploadKindFor, type ChatAttachmentType } from '../media/chat-media-limits'

type LegacyScope = { kind: 'chat' | 'dm'; clubId: string; targetId: string; senderId?: string | null; messageType?: string }

export function isProvenOwnedLegacyMedia(r2: R2Provider | undefined, url: string | null | undefined, scope: LegacyScope): boolean {
  const key = url && r2?.objectKeyFromUrl(url)
  return Boolean(key && scope.senderId && scope.messageType && ['IMAGE', 'VIDEO', 'FILE', 'VOICE'].includes(scope.messageType)
    && isOwnedPrivateV1Key(key, { targetType: scope.kind, clubId: scope.clubId, targetId: scope.targetId,
      ownerId: scope.senderId, kind: uploadKindFor(scope.messageType as ChatAttachmentType) }))
}

/** Legacy keys contain no authenticated uploader identity. Even a same-team
 * key may belong to an upload another member has not published yet. Do not
 * retire it or clear its last reference until provenance can be established. */
export async function retireLegacyChatMedia(
  tx: Prisma.TransactionClient,
  r2: R2Provider | undefined,
  url: string | null | undefined,
  scope: LegacyScope,
) {
  if (!url || isPrivateUploadMarker(url)) return
  const key = r2?.objectKeyFromUrl(url) ?? null
  if (!key) {
    // An old public base URL may no longer match the current configuration.
    // Preserve the pointer rather than silently orphan an unknown object.
    throw new ServiceUnavailableException('Attachment cleanup is unavailable. Contact support if this continues.')
  }
  if (!key.startsWith(`${scope.kind}/${scope.clubId}/${scope.targetId}/`)) {
    throw new ServiceUnavailableException('Attachment cleanup is unavailable. Contact support if this continues.')
  }
  if (isProvenOwnedLegacyMedia(r2, url, scope)) {
    // Keep the reference until the durable job is recorded in the same
    // transaction. The worker checks live messages and evidence holds under
    // this same lock and leaves a conditional-write barrier in private R2.
    await lockMediaObject(tx, key)
    await tx.accountMediaDeletion.createMany({ data: [{ objectKey: key }], skipDuplicates: true })
    return
  }
  throw new ServiceUnavailableException('Attachment cleanup needs review before this message can be deleted.')
}
