import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { Prisma, PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'
import { isDeepStrictEqual } from 'util'
import { privateMediaPublishSchema, type PrivateMediaPublishInput } from '@anstoss/shared'
import { PrivateUploadLedger, PrivateUploadScope } from './private-upload-ledger'
import { CHAT_UPLOAD_CONTENT_TYPES, CHAT_UPLOAD_MAX_BYTES, uploadKindFor } from '../media/chat-media-limits'

type AuthorizedTarget = {
  userId: string
  clubId: string
  targetId: string
} & ({ targetType: 'CHANNEL'; teamId: string } | { targetType: 'DM' })

/**
 * Atomic v2 message insertion/binding; not registered in live routes yet.
 * The mandatory authorization callback must acquire membership/revocation locks
 * and check current channel/DM + safeguarding policy inside this transaction.
 * It runs before any upload lock. Caller must not broadcast until publish resolves
 * and must not repeat delivery when replayed is true.
 */
export class PrivateUploadPublisher {
  constructor(
    private readonly prisma: Pick<PrismaClient, '$transaction'>,
    private readonly ledger = new PrivateUploadLedger(),
  ) {}

  async publish(
    scope: PrivateUploadScope,
    input: PrivateMediaPublishInput,
    authorize: (tx: Prisma.TransactionClient) => Promise<AuthorizedTarget>,
  ) {
    const parsed = privateMediaPublishSchema.safeParse(input)
    if (!parsed.success) throw new BadRequestException('Invalid attachment message')
    const validated = parsed.data
    return this.prisma.$transaction(async (tx) => {
      const target = await authorize(tx)
      if (target.userId !== scope.ownerId || target.clubId !== scope.clubId
        || !target.targetId || !['CHANNEL', 'DM'].includes(target.targetType)
        || (target.targetType === 'CHANNEL' && !target.teamId)) {
        throw new ForbiddenException('Upload scope does not match authorized target')
      }
      const user = await tx.user.findUnique({ where: { id: scope.ownerId }, select: { deletedAt: true } })
      if (!user || user.deletedAt) throw new ForbiddenException('Account unavailable')
      // Serialize publication retries, then lock the bound message before the
      // upload row (the same ordering used by attachment removal).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`private-publish:${scope.id}`}))`
      const candidate = await tx.privateMediaUpload.findFirst({
        where: { id: scope.id, clubId: scope.clubId, ownerId: scope.ownerId },
        select: { messageId: true },
      })
      const id = candidate?.messageId ?? randomUUID()
      const prefix = target.targetType === 'CHANNEL' ? 'chat-message' : 'dm-message'
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${prefix}:${id}`}))`
      const upload = await this.ledger.snapshot(tx, scope)
      const kind = uploadKindFor(validated.messageType)
      if (!upload || !['READY', 'ATTACHED'].includes(upload.state) || upload.operationId || !upload.uploadId
        || upload.cancelRequestedAt || (upload.state === 'READY' && upload.expiresAt.getTime() <= Date.now())
        || (upload.messageId && upload.messageId !== id)
        || upload.targetType !== target.targetType || upload.targetId !== target.targetId
        || (upload.reservedMessageType && upload.reservedMessageType !== validated.messageType)
        || (upload.reserveRequestId && target.targetType === 'CHANNEL' && upload.reservedTeamId !== target.teamId)
        || !CHAT_UPLOAD_CONTENT_TYPES[kind].has(upload.contentType)
        || upload.expectedBytes > CHAT_UPLOAD_MAX_BYTES[kind]) {
        throw new BadRequestException('Upload is not ready for this message')
      }
      if ((validated.attachmentMeta?.mimeType !== undefined && validated.attachmentMeta.mimeType !== upload.contentType)
        || (validated.attachmentMeta?.sizeBytes !== undefined && validated.attachmentMeta.sizeBytes !== upload.expectedBytes)) {
        throw new BadRequestException('Attachment metadata does not match the verified upload')
      }
      const data = {
        id, senderId: scope.ownerId, content: validated.content ?? '', messageType: validated.messageType,
        attachmentUrl: `https://private-media.anstoss.invalid/${upload.objectKey}`,
        attachmentMeta: { ...validated.attachmentMeta, mimeType: upload.contentType, sizeBytes: upload.expectedBytes },
        replyToId: validated.replyToId ?? null,
      }
      if (upload.state === 'ATTACHED') {
        if (!upload.messageId) throw new BadRequestException('Upload binding is unavailable')
        const message = target.targetType === 'CHANNEL'
          ? await tx.message.findFirst({ where: { id, clubId: scope.clubId, teamId: target.teamId, channelId: target.targetId, senderId: scope.ownerId, deletedAt: null } })
          : await tx.directMessage.findFirst({ where: { id, conversationId: target.targetId, conversation: { clubId: scope.clubId }, senderId: scope.ownerId, deletedAt: null } })
        if (!message || message.messageType !== data.messageType || message.content !== data.content
          || (message.replyToId ?? null) !== data.replyToId
          || message.attachmentUrl !== data.attachmentUrl
          || !isDeepStrictEqual(message.attachmentMeta, JSON.parse(JSON.stringify(data.attachmentMeta)))) {
          throw new BadRequestException('Upload was already published with different or unavailable message data')
        }
        return { ...message, replayed: true }
      }
      if (data.replyToId) {
        const parent = target.targetType === 'CHANNEL'
          ? await tx.message.findFirst({ where: { id: data.replyToId, clubId: scope.clubId,
            channelId: target.targetId }, select: { id: true } })
          : await tx.directMessage.findFirst({ where: { id: data.replyToId, conversationId: target.targetId,
            conversation: { clubId: scope.clubId } }, select: { id: true } })
        if (!parent) throw new BadRequestException('Invalid reply target')
      }
      const message = target.targetType === 'CHANNEL'
        ? await tx.message.create({ data: { ...data, clubId: scope.clubId, teamId: target.teamId, channelId: target.targetId } })
        : await tx.directMessage.create({ data: { ...data, conversationId: target.targetId } })
      if (!await this.ledger.attach(tx, scope, message.id)) {
        // Throw inside the owned transaction: never commit a message when the
        // upload could not be bound, even if INSERT itself succeeded.
        throw new BadRequestException('Upload could not be attached')
      }
      if (target.targetType === 'DM') {
        await tx.conversation.update({ where: { id: target.targetId }, data: { updatedAt: new Date() } })
      }
      return { ...message, replayed: false }
    }, { timeout: 15_000 })
  }
}
