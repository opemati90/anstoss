import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common'
import type { Prisma, PrismaClient } from '@prisma/client'
import type { ChatAttachmentType } from '@anstoss/shared'
import { CHAT_UPLOAD_CONTENT_TYPES, CHAT_UPLOAD_MAX_BYTES, uploadKindFor } from '../media/chat-media-limits'
import { PrivateUploadLedger } from './private-upload-ledger'
import { PrivateUploadStorage } from './private-upload-storage'

export type AuthorizedPrivateReadTarget = {
  userId: string
  clubId: string
  targetId: string
} & ({ targetType: 'CHANNEL'; teamId: string } | { targetType: 'DM' })

const READ_TTL_SECONDS = 300
const PRIVATE_REFERENCE = /^https:\/\/private-media\.anstoss\.invalid\/(private-chat\/v2\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?![\s\S])/

/** Internal only; deliberately not registered in HTTP/DI yet. Authorization
 * must acquire current reader/revocation locks through the supplied transaction.
 * It must be read authorization, not write authorization: a former DM peer's
 * departure can make a conversation read-only without removing its history.
 * Keep access -> message -> upload lock ordering, shared with retirement.
 */
export class PrivateUploadReads {
  constructor(
    private readonly prisma: Pick<PrismaClient, '$transaction'>,
    private readonly storage: Pick<PrivateUploadStorage, 'signGet'>,
    private readonly ledger = new PrivateUploadLedger(),
  ) {}

  async signForMessage(
    scope: { userId: string; clubId: string; messageId: string },
    authorize: (tx: Prisma.TransactionClient) => Promise<AuthorizedPrivateReadTarget>,
  ): Promise<{ url: string | null }> {
    return this.prisma.$transaction(async (tx) => {
      const target = await authorize(tx)
      if (!scope.userId || !scope.clubId || !scope.messageId
        || target.userId !== scope.userId || target.clubId !== scope.clubId
        || !target.targetId || !['CHANNEL', 'DM'].includes(target.targetType)
        || (target.targetType === 'CHANNEL' && !target.teamId)) {
        throw new ForbiddenException('Read scope does not match authorized target')
      }
      const user = await tx.user.findUnique({ where: { id: scope.userId }, select: { deletedAt: true } })
      if (!user || user.deletedAt) throw new ForbiddenException('Account unavailable')
      const prefix = target.targetType === 'CHANNEL' ? 'chat-message' : 'dm-message'
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${prefix}:${scope.messageId}`}))`
      const select = { id: true, senderId: true, attachmentUrl: true, deletedAt: true, messageType: true } as const
      const message = target.targetType === 'CHANNEL'
        ? await tx.message.findFirst({ where: { id: scope.messageId, clubId: scope.clubId,
          teamId: target.teamId, channelId: target.targetId }, select })
        : await tx.directMessage.findFirst({ where: { id: scope.messageId,
          conversationId: target.targetId, conversation: { clubId: scope.clubId } }, select })
      if (!message || message.deletedAt || !message.senderId || !message.attachmentUrl
        || !['VOICE', 'IMAGE', 'VIDEO', 'FILE'].includes(message.messageType)) return { url: null }
      // Only one exact non-resolving reference is accepted. Never normalize URL
      // aliases or fall back to public/legacy signing for a malformed v2 key.
      const key = PRIVATE_REFERENCE.exec(message.attachmentUrl)?.[1]
      if (!key) return { url: null }
      const candidate = await tx.privateMediaUpload.findFirst({ where: {
        messageId: scope.messageId, clubId: scope.clubId, ownerId: message.senderId,
        targetType: target.targetType, targetId: target.targetId, objectKey: key,
      }, select: { id: true } })
      if (!candidate) return { url: null }
      const upload = await this.ledger.snapshot(tx, {
        id: candidate.id, clubId: scope.clubId, ownerId: message.senderId,
      })
      const kind = uploadKindFor(message.messageType as ChatAttachmentType)
      if (!upload || upload.state !== 'ATTACHED' || upload.operationId || upload.cancelRequestedAt
        || !upload.uploadId || upload.messageId !== scope.messageId || upload.objectKey !== key
        || upload.targetType !== target.targetType || upload.targetId !== target.targetId
        || !CHAT_UPLOAD_CONTENT_TYPES[kind].has(upload.contentType)
        || !Number.isSafeInteger(upload.expectedBytes) || upload.expectedBytes < 1
        || upload.expectedBytes > CHAT_UPLOAD_MAX_BYTES[kind]) return { url: null }
      // ATTACHED reservation expiry is intentionally irrelevant to message reads.
      const signingDate = new Date(Date.now())
      try {
        const url = await this.storage.signGet(key, READ_TTL_SECONDS, signingDate)
        if (Date.now() >= signingDate.getTime() + READ_TTL_SECONDS * 1000) {
          throw new ServiceUnavailableException('Private media signing is temporarily unavailable')
        }
        return { url }
      } catch {
        // Provider/signer errors may contain credentials, object IDs or URLs.
        throw new ServiceUnavailableException('Private media signing is temporarily unavailable')
      }
    }, { timeout: 15_000 })
  }
}
