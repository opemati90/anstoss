import { randomUUID } from 'crypto'
import { Prisma, PrivateMediaUploadState } from '@prisma/client'
import { getClubId } from '../prisma/tenant.context'
import { lockMediaObject } from './media-object-lock'
import { ConflictException, HttpException, HttpStatus } from '@nestjs/common'

// Operational safety caps, not paid-plan storage entitlements. Ambiguous or
// aborted uploads remain charged until cleanup establishes REMOVED.
// Admission limits only: retiring an ATTACHED object can increase this usage
// above the cap, conservatively blocking new reservations until cleanup catches up.
export const PRIVATE_UPLOAD_PENDING_LIMIT = 10
export const PRIVATE_UPLOAD_PENDING_BYTES = 250 * 1024 * 1024

export type PrivateUploadScope = { clubId: string; ownerId: string; id: string }
type Operation = 'initiate' | 'complete' | 'abort' | 'remove'
const transitions = {
  initiate: { from: 'RESERVED', pending: 'INITIATING', settled: 'UPLOADING' },
  complete: { from: 'UPLOADING', pending: 'FINALIZING', settled: 'READY' },
  abort: { from: 'UPLOADING', pending: 'ABORTING', settled: 'ABORTED' },
  remove: { from: 'READY', pending: 'REMOVING', settled: 'REMOVED' },
} as const

/**
 * Transaction-only ledger, not an authorization service or active route.
 * Caller must authorize the current user/target under lifecycle locks, commit
 * begin() BEFORE external I/O, then settle only a definitive provider success.
 * An exception/timeout leaves the pending state intact for reconciliation.
 * No time-based lease stealing: a slow request may still commit externally.
 */
export class PrivateUploadLedger {
  async reserve(
    tx: Prisma.TransactionClient,
    input: {
      clubId: string
      ownerId: string
      targetId: string
      targetType: 'CHANNEL' | 'DM'
      contentType: string
      expectedBytes: number
      reserveRequestId?: string
      reservedMessageType?: 'IMAGE' | 'VIDEO' | 'FILE' | 'VOICE'
      reservedTeamId?: string
    },
  ) {
    if (getClubId() && getClubId() !== input.clubId)
      throw new Error('Private upload tenant mismatch')
    if (
      ![input.clubId, input.ownerId, input.targetId].every(
        (v) => typeof v === 'string' && v.length > 0,
      ) ||
      !['CHANNEL', 'DM'].includes(input.targetType) ||
      !Number.isSafeInteger(input.expectedBytes) ||
      input.expectedBytes < 1 ||
      input.expectedBytes > 100 * 1024 * 1024 ||
      ((input.reserveRequestId === undefined) !== (input.reservedMessageType === undefined)) ||
      (input.reserveRequestId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(input.reserveRequestId)) ||
      (input.reservedMessageType !== undefined && !['IMAGE', 'VIDEO', 'FILE', 'VOICE'].includes(input.reservedMessageType)) ||
      (input.reserveRequestId !== undefined && input.targetType === 'CHANNEL' && !input.reservedTeamId) ||
      (input.targetType === 'DM' && input.reservedTeamId !== undefined) ||
      !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(input.contentType)
    ) {
      throw new Error('Invalid private upload reservation')
    }
    const quotaKey = `private-upload-quota:${JSON.stringify([input.clubId, input.ownerId])}`
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${quotaKey}))`
    if (input.reserveRequestId) {
      const existing = await tx.privateMediaUpload.findFirst({ where: {
        clubId: input.clubId, ownerId: input.ownerId, reserveRequestId: input.reserveRequestId,
      } })
      if (existing) {
        if (existing.clubId !== input.clubId || existing.ownerId !== input.ownerId
          || existing.reserveRequestId !== input.reserveRequestId || existing.targetId !== input.targetId
          || existing.targetType !== input.targetType || existing.reservedMessageType !== input.reservedMessageType
          || (existing.reservedTeamId ?? undefined) !== input.reservedTeamId
          || existing.contentType !== input.contentType || existing.expectedBytes !== input.expectedBytes) {
          throw new ConflictException('Upload request cannot be reused with different details')
        }
        // Do not extend expiry, reacquire quota, or resurrect an expired,
        // cancelled or published reservation on a retry.
        return existing
      }
    }
    const usage = await tx.privateMediaUpload.aggregate({
      where: { clubId: input.clubId, ownerId: input.ownerId, state: { notIn: ['ATTACHED', 'REMOVED'] } },
      _count: { _all: true }, _sum: { expectedBytes: true },
    })
    if (usage._count._all >= PRIVATE_UPLOAD_PENDING_LIMIT
      || (usage._sum.expectedBytes ?? 0) + input.expectedBytes > PRIVATE_UPLOAD_PENDING_BYTES) {
      throw new HttpException({
        code: 'PRIVATE_UPLOAD_PENDING_LIMIT',
        message: 'Too many pending uploads. Finish active uploads or contact support if you cannot continue.',
      }, HttpStatus.TOO_MANY_REQUESTS)
    }
    const id = randomUUID()
    return tx.privateMediaUpload.create({
      data: {
        clubId: input.clubId,
        ownerId: input.ownerId,
        targetId: input.targetId,
        targetType: input.targetType,
        contentType: input.contentType,
        expectedBytes: input.expectedBytes,
        reserveRequestId: input.reserveRequestId,
        reservedMessageType: input.reservedMessageType,
        reservedTeamId: input.reservedTeamId,
        id,
        objectKey: `private-chat/v2/${id}`,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    })
  }

  private validateScope(scope: PrivateUploadScope) {
    if (getClubId() && getClubId() !== scope.clubId)
      throw new Error('Private upload tenant mismatch')
    if (
      ![scope.id, scope.clubId, scope.ownerId].every((v) => typeof v === 'string' && v.length > 0)
    ) {
      throw new Error('Private upload scope is required')
    }
  }

  private matchesScope(row: { id: string; clubId: string; ownerId: string } | null, scope: PrivateUploadScope) {
    return row?.id === scope.id && row.clubId === scope.clubId && row.ownerId === scope.ownerId
  }

  private async locked(tx: Prisma.TransactionClient, scope: PrivateUploadScope) {
    this.validateScope(scope)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`private-upload:${scope.id}`}))`
    const row = await tx.privateMediaUpload.findFirst({
      where: { id: scope.id, clubId: scope.clubId, ownerId: scope.ownerId },
    })
    return row &&
      row.id === scope.id &&
      row.clubId === scope.clubId &&
      row.ownerId === scope.ownerId
      ? row
      : null
  }

  async begin(tx: Prisma.TransactionClient, scope: PrivateUploadScope, operation: Operation) {
    // Existing account erasure/moderation take message locks before any upload
    // lock. Preserve that order, then revalidate the immutable binding below.
    let removalMessageId: string | null = null
    if (operation === 'remove') {
      this.validateScope(scope)
      const candidate = await tx.privateMediaUpload.findFirst({
        where: { id: scope.id, clubId: scope.clubId, ownerId: scope.ownerId },
      })
      if (!this.matchesScope(candidate, scope)) return null
      removalMessageId = candidate!.messageId
      if (removalMessageId) {
        if (!['CHANNEL', 'DM'].includes(candidate!.targetType)) return null
        const prefix = candidate!.targetType === 'CHANNEL' ? 'chat-message' : 'dm-message'
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${prefix}:${removalMessageId}`}))`
      }
    }
    const row = await this.locked(tx, scope)
    const rule = transitions[operation]
    if (
      !row ||
      (row.state !== rule.from && !(operation === 'remove' && row.state === 'ATTACHED')) ||
      row.operationId
    )
      return null
    const cancelled =
      row.cancelRequestedAt !== null ||
      (row.state !== 'ATTACHED' && row.expiresAt.getTime() <= Date.now())
    if ((operation === 'initiate' || operation === 'complete') && cancelled) return null
    if ((operation === 'abort' || operation === 'remove') && !cancelled) return null
    if (operation !== 'initiate' && !row.uploadId) return null
    if (operation === 'remove') {
      if (row.messageId !== removalMessageId) return null
      await lockMediaObject(tx, row.objectKey)
      const attachmentUrl = `https://private-media.anstoss.invalid/${row.objectKey}`
      const channelBinding = row.targetType === 'CHANNEL' && row.messageId ? [{ id: row.messageId }] : []
      const dmBinding = row.targetType === 'DM' && row.messageId ? [{ id: row.messageId }] : []
      const holds = await Promise.all([
        tx.message.findFirst({ where: { clubId: row.clubId, deletedAt: null,
          OR: [{ attachmentUrl }, ...channelBinding.map(({ id }) => ({ id, attachmentUrl: { not: null } }))] }, select: { id: true } }),
        tx.directMessage.findFirst({ where: { deletedAt: null,
          OR: [{ attachmentUrl }, ...dmBinding.map(({ id }) => ({ id, attachmentUrl: { not: null } }))] }, select: { id: true } }),
        tx.messageReport.findFirst({ where: { evidencePurgedAt: null,
          OR: [{ evidenceAttachmentUrl: attachmentUrl }, ...channelBinding.map(({ id }) => ({ messageId: id }))] }, select: { id: true } }),
        tx.directMessageReport.findFirst({ where: { evidencePurgedAt: null,
          OR: [{ evidenceAttachmentUrl: attachmentUrl }, ...dmBinding.map(({ id }) => ({ directMessageId: id }))] }, select: { id: true } }),
      ])
      if (holds.some(Boolean)) return null
    }
    const operationId = randomUUID()
    const updated = await tx.privateMediaUpload.updateMany({
      where: { ...scope, state: row.state, operationId: null },
      data: { state: rule.pending, operationId },
    })
    if (updated.count !== 1) return null
    return { ...row, state: rule.pending, operationId }
  }

  /** Internal reconciliation snapshot, not a member-facing data projection. */
  async snapshot(tx: Prisma.TransactionClient, scope: PrivateUploadScope) {
    return this.locked(tx, scope)
  }

  async settle(
    tx: Prisma.TransactionClient,
    scope: PrivateUploadScope,
    operation: Operation,
    operationId: string,
    uploadId?: string,
  ) {
    const row = await this.locked(tx, scope)
    const rule = transitions[operation]
    if (!row || !operationId || row.operationId !== operationId || row.state !== rule.pending)
      return false
    if (
      operation === 'initiate' &&
      (!uploadId || uploadId.length > 2048 || /[\r\n]/.test(uploadId))
    ) {
      throw new Error('Definitive initiation requires a valid upload ID')
    }
    const updated = await tx.privateMediaUpload.updateMany({
      where: { ...scope, state: rule.pending, operationId },
      data: {
        state: rule.settled as PrivateMediaUploadState,
        operationId: null,
        ...(operation === 'initiate' ? { uploadId } : {}),
        // Preserve cancellation requested while external I/O was in flight.
        // READY is not usable when cancelRequestedAt is set; remove it next.
      },
    })
    return updated.count === 1
  }

  async cancel(tx: Prisma.TransactionClient, scope: PrivateUploadScope) {
    const row = await this.locked(tx, scope)
    if (!row || row.state === 'REMOVED') return false
    const updated = await tx.privateMediaUpload.updateMany({
      where: scope,
      data: {
        cancelRequestedAt: row.cancelRequestedAt ?? new Date(),
        // RESERVED has no provider request. Other states must reconcile I/O.
        ...(row.state === 'RESERVED' ? { state: 'REMOVED' as const } : {}),
      },
    })
    return updated.count === 1
  }

  /** Must share the transaction that inserts the authorized message.
   * A false result requires the caller to throw and roll back that insertion.
   * This verifies identity/binding, not current membership or safeguarding.
   */
  async attach(tx: Prisma.TransactionClient, scope: PrivateUploadScope, messageId: string) {
    if (!messageId) throw new Error('Message ID is required')
    this.validateScope(scope)
    const candidate = await tx.privateMediaUpload.findFirst({
      where: { id: scope.id, clubId: scope.clubId, ownerId: scope.ownerId },
    })
    if (!this.matchesScope(candidate, scope) || !['CHANNEL', 'DM'].includes(candidate!.targetType)) return false
    const prefix = candidate!.targetType === 'CHANNEL' ? 'chat-message' : 'dm-message'
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${prefix}:${messageId}`}))`
    const row = await this.locked(tx, scope)
    if (
      !row ||
      row.state !== 'READY' ||
      row.operationId ||
      !row.uploadId ||
      row.targetType !== candidate!.targetType ||
      row.cancelRequestedAt ||
      row.expiresAt.getTime() <= Date.now()
    )
      return false
    await lockMediaObject(tx, row.objectKey)
    const attachmentUrl = `https://private-media.anstoss.invalid/${row.objectKey}`
    const message = row.targetType === 'CHANNEL'
      ? await tx.message.findFirst({ where: {
        id: messageId, clubId: scope.clubId, channelId: row.targetId,
        senderId: scope.ownerId, attachmentUrl, deletedAt: null,
        messageType: { in: ['VOICE', 'IMAGE', 'VIDEO', 'FILE'] },
      }, select: { id: true } })
      : await tx.directMessage.findFirst({ where: {
        id: messageId, conversationId: row.targetId, conversation: { clubId: scope.clubId },
        senderId: scope.ownerId, attachmentUrl, deletedAt: null,
        messageType: { in: ['VOICE', 'IMAGE', 'VIDEO', 'FILE'] },
      }, select: { id: true } })
    if (!message) return false
    const updated = await tx.privateMediaUpload.updateMany({
      where: { ...scope, state: 'READY', operationId: null, cancelRequestedAt: null },
      data: { state: 'ATTACHED', messageId },
    })
    return updated.count === 1
  }
}
