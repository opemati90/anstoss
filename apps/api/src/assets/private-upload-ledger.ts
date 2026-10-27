import { randomUUID } from 'crypto'
import { Prisma, PrivateMediaUploadState } from '@prisma/client'
import { getClubId } from '../prisma/tenant.context'

export type PrivateUploadScope = { clubId: string; ownerId: string; id: string }
type Operation = 'initiate' | 'complete' | 'abort' | 'remove'
const transitions = {
  initiate: { from: 'RESERVED', pending: 'INITIATING', settled: 'UPLOADING' },
  complete: { from: 'UPLOADING', pending: 'FINALIZING', settled: 'READY' },
  abort: { from: 'UPLOADING', pending: 'ABORTING', settled: 'REMOVED' },
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
      !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(input.contentType)
    ) {
      throw new Error('Invalid private upload reservation')
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
        id,
        objectKey: `private-chat/v2/${id}`,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    })
  }

  private async locked(tx: Prisma.TransactionClient, scope: PrivateUploadScope) {
    if (getClubId() && getClubId() !== scope.clubId)
      throw new Error('Private upload tenant mismatch')
    if (
      ![scope.id, scope.clubId, scope.ownerId].every((v) => typeof v === 'string' && v.length > 0)
    ) {
      throw new Error('Private upload scope is required')
    }
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
    await tx.privateMediaUpload.updateMany({
      where: scope,
      data: {
        cancelRequestedAt: row.cancelRequestedAt ?? new Date(),
        // RESERVED has no provider request. Other states must reconcile I/O.
        ...(row.state === 'RESERVED' ? { state: 'REMOVED' as const } : {}),
      },
    })
    return true
  }

  /** Must share the transaction that inserts the authorized message. */
  async attach(tx: Prisma.TransactionClient, scope: PrivateUploadScope, messageId: string) {
    if (!messageId) throw new Error('Message ID is required')
    const row = await this.locked(tx, scope)
    if (
      !row ||
      row.state !== 'READY' ||
      row.operationId ||
      row.cancelRequestedAt ||
      row.expiresAt.getTime() <= Date.now()
    )
      return false
    const updated = await tx.privateMediaUpload.updateMany({
      where: { ...scope, state: 'READY', operationId: null, cancelRequestedAt: null },
      data: { state: 'ATTACHED', messageId },
    })
    return updated.count === 1
  }
}
